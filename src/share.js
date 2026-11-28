// 只读分享链接（给工人看）。
// 把“现在定下来的方案”打包成一段令牌放在链接里：view.html#<令牌>。
// view.html 只按令牌显示，没有任何修改入口；令牌带校验，被改过或不完整就直接报错，
// 不会退回成可编辑的页面，也不会显示成别的方案。
import { evenSpots } from './ceiling.js';

const VERSION = 1;
const SUM_LEN = 7;
const SHOW_KEYS = ['furniture', 'frames', 'curtains', 'dims', 'labels', 'colourCode'];
const ITEM_KEYS = ['type', 'name', 'room', 'x', 'y', 'z0', 'h', 'face', 'finish', 'opts', 'hidden', 'note'];

const clone = (o) => JSON.parse(JSON.stringify(o));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** FNV-1a 32 位校验，转成 7 位 36 进制 */
function checksum(str) {
  let hsh = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hsh ^= str.charCodeAt(i);
    hsh = Math.imul(hsh, 0x01000193);
  }
  return (hsh >>> 0).toString(36).padStart(SUM_LEN, '0');
}

function toB64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function encodeShare(payload) {
  const body = toB64Url(JSON.stringify(payload));
  return checksum(body) + body;
}

/** 解不开、校验不对、版本不认识，一律抛错 */
export function decodeShare(token) {
  const t = String(token || '').trim();
  if (t.length <= SUM_LEN || !/^[0-9a-z]+[A-Za-z0-9_-]+$/.test(t)) throw new Error('链接不完整');
  const sum = t.slice(0, SUM_LEN), body = t.slice(SUM_LEN);
  if (checksum(body) !== sum) throw new Error('链接被改过或者没复制全');
  let payload;
  try { payload = JSON.parse(fromB64Url(body)); } catch { throw new Error('链接内容读不出来'); }
  if (!payload || payload.v !== VERSION || typeof payload.o !== 'string') throw new Error('链接版本不对');
  return payload;
}

/** 家具相对仓库里 data/home.json 的差异：改了哪些、加了哪些、删了哪些 */
function diffFurniture(baseList, curList) {
  const baseById = new Map(baseList.map((f) => [f.id, f]));
  const curIds = new Set(curList.map((f) => f.id));
  const out = { set: {}, add: [], del: [] };
  for (const cur of curList) {
    const b = baseById.get(cur.id);
    if (!b) { out.add.push(clone(cur)); continue; }
    const ch = {};
    for (const k of ITEM_KEYS) if (!same(b[k], cur[k])) ch[k] = cur[k] === undefined ? null : cur[k];
    if (Object.keys(ch).length) out.set[cur.id] = ch;
  }
  for (const b of baseList) if (!curIds.has(b.id)) out.del.push(b.id);
  const n = Object.keys(out.set).length + out.add.length + out.del.length;
  return n ? out : null;
}

function patchFurniture(list, diff) {
  if (!diff) return list;
  const del = new Set(diff.del || []);
  const out = list.filter((f) => !del.has(f.id));
  for (const f of out) {
    const ch = (diff.set || {})[f.id];
    if (!ch) continue;
    for (const [k, v] of Object.entries(ch)) {
      if (!ITEM_KEYS.includes(k)) continue;
      if (v === null) delete f[k];
      else f[k] = v;
    }
  }
  for (const f of diff.add || []) if (f && f.id && !out.some((o) => o.id === f.id)) out.push(f);
  return out;
}

/** 吊顶、墙体这些“结构”数据，去掉会被链接覆盖的几项，用来比较本机数据和仓库数据是不是同一套尺寸 */
function structure(data) {
  const d = clone({ heights: data.heights, floors: data.floors, walls: data.walls, balcony: data.balcony, curtains: data.curtains, ceiling: data.ceiling });
  delete d.ceiling.living.default;
  delete d.ceiling.master.beam;
  delete d.ceiling.living.common.spots.y;
  delete d.ceiling.living.common.spots.beam;
  for (const o of Object.values(d.ceiling.living.options)) delete o.noSpots;
  return JSON.stringify(d);
}

/** 从当前页面的状态生成令牌内容 */
export function buildShare(app) {
  const s = app.state;
  const base = app.baseData;
  const spots = app.data.ceiling.living.common.spots;
  const opt = app.data.ceiling.living.options[s.option];
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const payload = {
    v: VERSION,
    t: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    dv: base.meta.version,
    o: s.option,
    ns: opt.spotZ != null && s.spotsOff[s.option] ? 1 : 0,
    n: spots.y.length,
    a: spots.beam,
    mb: s.masterBeam,
    s: s.scene,
    vw: s.view || 'overview',
    fl: app.M.floorFinish,
    wl: app.M.wallFinish,
    sh: SHOW_KEYS.map((k) => (s.show[k] ? 1 : 0)).join(''),
    g: s.general ? 1 : 0,
  };
  const fu = diffFurniture(base.furniture, app.data.furniture);
  if (fu) payload.fu = fu;
  const furnitureChanges = fu ? Object.keys(fu.set).length + fu.add.length + fu.del.length : 0;
  return { payload, furnitureChanges, structureDiffers: structure(app.data) !== structure(base) };
}

/** 把令牌内容套到仓库数据上，得到只读页面要显示的那一份数据 */
export function applyShare(base, p) {
  const d = clone(base);
  const Lc = d.ceiling.living;
  if (!Lc.options[p.o]) throw new Error('链接里的做法在现在的数据里找不到');
  Lc.default = p.o;
  for (const o of Object.values(Lc.options)) delete o.noSpots;
  if (p.ns) Lc.options[p.o].noSpots = true;
  const sp = Lc.common.spots;
  const n = Math.round(Number(p.n));
  if (n >= 1 && n <= 12 && n !== sp.y.length) sp.y = evenSpots(Lc.y[1] - Lc.y[0], n, Lc.y[0]);
  if (Number(p.a) >= 8 && Number(p.a) <= 90) sp.beam = Number(p.a);
  if (Number(p.mb) >= 8 && Number(p.mb) <= 90) d.ceiling.master.beam = Number(p.mb);
  if (d.scenes[p.s]) d.lights.defaultScene = p.s;
  d.finishes = { floor: p.fl, wall: p.wl };
  d.furniture = patchFurniture(d.furniture, p.fu);
  const show = {};
  SHOW_KEYS.forEach((k, i) => { if (typeof p.sh === 'string' && p.sh[i] != null) show[k] = p.sh[i] === '1'; });
  return {
    data: d,
    init: { view: d.cameras.some((c) => c.id === p.vw) ? p.vw : 'overview', show, general: p.g !== 0 },
    info: { date: p.t, dataVersion: p.dv, stale: p.dv !== base.meta.version },
  };
}

/** 只读页面的完整网址 */
export function shareURL(token) {
  const u = new URL('view.html', location.href);
  u.search = '';
  u.hash = token;
  return u.toString();
}
