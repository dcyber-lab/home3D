// 施工图（SVG）：沙发墙吊顶剖面、客厅 / 主卧天花布置、全屋平面。
// 全部从 data/home.json 的同一套数字画出来，跟 3D 模型不会对不上。
import { uPath, arc } from './ceiling.js';

const C = {
  ink: '#1f2328', sub: '#5c6370', line: '#2b2f36',
  wall: '#8d9096', old: '#a9b0ba', neu: '#eadfc8', alu: '#c9ccd1',
  led: '#f39c12', spot: '#3a3b40', beam: 'rgba(245,190,70,0.45)',
  dim: '#b3261e', wood: '#f1e8d8', tile: '#e6e8ea', marble: '#f3f2ee', balc: '#ebebe6',
};

const f1 = (n) => (Math.round(n * 10) / 10).toString();
const cm = (m) => `${f1(m * 100)} cm`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function text(x, y, s, o = {}) {
  const { size = 12, fill = C.ink, anchor = 'start', weight = 400, rotate } = o;
  const tr = rotate ? ` transform="rotate(${rotate} ${x} ${y})"` : '';
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}"${tr}>${esc(s)}</text>`;
}

function dimH(x0, x1, y, label, o = {}) {
  const t = 4;
  const ty = o.below ? y + 13 : y - 5;
  return `<g stroke="${C.dim}" stroke-width="1" fill="none"><path d="M${x0} ${y}H${x1}M${x0} ${y - t}V${y + t}M${x1} ${y - t}V${y + t}"/></g>` +
    text((x0 + x1) / 2, ty, label, { size: o.size || 11, fill: C.dim, anchor: 'middle' });
}

function dimV(x, y0, y1, label, o = {}) {
  const t = 4;
  const tx = o.left ? x - 6 : x + 6;
  return `<g stroke="${C.dim}" stroke-width="1" fill="none"><path d="M${x} ${y0}V${y1}M${x - t} ${y0}H${x + t}M${x - t} ${y1}H${x + t}"/></g>` +
    text(tx, (y0 + y1) / 2 + 4, label, { size: o.size || 11, fill: C.dim, anchor: o.left ? 'end' : 'start' });
}

function wrap(w, h, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif" role="img" aria-label="${esc(title)}">` +
    `<rect width="${w}" height="${h}" fill="#ffffff"/>${body}</svg>`;
}

/* ------------------------------------------------------------------ */
/*  剖面                                                               */
/* ------------------------------------------------------------------ */

/** 一个做法在沙发墙这一条的剖面零件（单位 m）。noSpots = 这个做法移除了客厅射灯 */
export function sectionParts(data, key, noSpots = false) {
  const Lc = data.ceiling.living, c = Lc.common, opt = Lc.options[key];
  const H = data.heights.ceiling, old = data.ceiling.oldBox;
  const parts = [];           // { x0, x1, z0, z1, kind: 'new' | 'old' | 'alu' }
  const leds = [];            // { x, z, dir: 'up' | 'wash' }
  const R = (x0, x1, z0, z1, kind) => parts.push({ x0, x1, z0, z1, kind });
  const tf = c.troughFloor;
  if (opt.kind === 'u') {
    const wS = opt.sofaWidth, u = opt.under;
    R(0, wS, u, u + tf, 'new');
    R(0, wS - c.trough, u + tf, H, 'new');
    R(wS - c.lipThickness, wS, u + tf, u + c.lipHeight, 'new');
    if (opt.lower) R(opt.lower.x[0], opt.lower.x[1], opt.lower.z[0], opt.lower.z[1], 'new');
    leds.push({ x: wS - c.lipThickness - c.ledFromLip, z: u + tf + 0.008, dir: 'up' });
  } else if (opt.kind === 'wash') {
    R(opt.baffle.x[0], opt.baffle.x[1], opt.baffle.z[0], opt.baffle.z[1], 'new');
    leds.push({ x: opt.wash.x, z: opt.wash.z - 0.006, dir: 'wash' });
  } else if (opt.kind === 'e1') {
    const b = opt.block, ch = opt.channel;
    R(b.x[0], b.x[1], b.z[0], b.z[1], 'new');
    R(b.x[1], b.x[1] + ch.out, ch.z[0], ch.z[0] + 0.004, 'alu');
    R(b.x[1] + ch.out - 0.004, b.x[1] + ch.out, ch.z[0], ch.z[1], 'alu');
    leds.push({ x: b.x[1] + 0.015, z: ch.z[0] + 0.012, dir: 'up' });
  }
  if (opt.keepOldBox) R(old.x[0], old.x[1], old.z[0], old.z[1], 'old');
  const spot = opt.spotZ != null && !noSpots ? { x: c.spots.fromWall, z: opt.spotZ } : null;
  const lowest = Math.min(...parts.map((p) => p.z0));
  const widest = Math.max(...parts.filter((p) => p.kind !== 'alu').map((p) => p.x1));
  return { parts, leds, spot, opt, H, lowest, widest, old };
}

const SECTION_BOTTOM = 2.04;   // 剖面图里墙画到离地多高为止

function sectionBody(data, key, S, ox, oy, compact, noSpots = false) {
  const sec = sectionParts(data, key, noSpots);
  const { opt, H } = sec;
  const old = data.ceiling.oldBox;
  const X = (x) => ox + (x * 100 + 12) * S;
  const Y = (z) => oy + (272 - z * 100) * S;
  const fs = compact ? 10 : 11.5;
  let s = '';
  // 墙、楼板
  s += `<rect x="${X(-0.10)}" y="${Y(2.68)}" width="${10 * S}" height="${(268 - SECTION_BOTTOM * 100) * S}" fill="${C.wall}"/>`;
  s += `<rect x="${X(-0.10)}" y="${Y(2.68)}" width="${72 * S}" height="${8 * S}" fill="${C.wall}"/>`;
  s += text(X(0.26), Y(2.64) + 4, '原天花（楼板）', { size: compact ? 10 : 12, fill: '#fff', anchor: 'middle' });
  s += text(X(-0.05) + 4, Y(SECTION_BOTTOM + 0.1), '沙发墙', { size: compact ? 10 : 12, fill: '#fff', anchor: 'middle', rotate: -90 });
  // 零件
  const fill = { new: C.neu, old: C.old, alu: C.alu };
  for (const p of sec.parts) {
    s += `<rect x="${X(p.x0).toFixed(1)}" y="${Y(p.z1).toFixed(1)}" width="${((p.x1 - p.x0) * 100 * S).toFixed(1)}" height="${((p.z1 - p.z0) * 100 * S).toFixed(1)}" fill="${fill[p.kind]}" stroke="${C.line}" stroke-width="1"/>`;
  }
  // 射灯
  let floor = sec.lowest;
  if (sec.spot) {
    const { x, z } = sec.spot;
    s += `<polygon points="${X(x - 0.0375)},${Y(z)} ${X(x + 0.0375)},${Y(z)} ${X(x + 0.07)},${Y(z - 0.08)} ${X(x - 0.07)},${Y(z - 0.08)}" fill="${C.beam}"/>`;
    s += `<rect x="${X(x - 0.0375)}" y="${Y(z + 0.09)}" width="${7.5 * S}" height="${9 * S}" fill="${C.spot}"/>`;
    floor = Math.min(floor, z - 0.08);
  }
  // 灯带
  for (const l of sec.leds) {
    s += `<circle cx="${X(l.x)}" cy="${Y(l.z)}" r="${1.1 * S}" fill="${C.led}" stroke="${C.line}" stroke-width="0.8"/>`;
    const a = l.dir === 'up' ? [0, -5.5] : [-3.2, 5];
    s += `<path d="M${X(l.x)} ${Y(l.z)}l${a[0] * S} ${a[1] * S}" stroke="${C.led}" stroke-width="2" stroke-dasharray="3 3"/>`;
  }
  // 标高
  const levels = new Map([[H, '原天花']]);
  levels.set(opt.under, opt.kind === 'wash' || opt.kind === 'e1' ? '两端边吊底' : opt.lower ? '台阶（两端边吊底）' : '边吊底');
  if (opt.kind === 'e1' || opt.lower) levels.set(old.z[0], '下半截底');
  else if (opt.keepOldBox) levels.set(old.z[0], '旧边吊底');
  if (opt.baffle) levels.set(opt.baffle.z[0], '挡板底');
  const lx = X(0.44);
  for (const [z, name] of levels) {
    s += `<path d="M${X(sec.widest) + 5} ${Y(z)}H${lx}" stroke="${C.dim}" stroke-width="1" stroke-dasharray="4 3"/>`;
    s += text(lx + 4, Y(z) + 4, `${name}  离地 ${z.toFixed(2)}`, { size: fs, fill: C.dim });
  }
  // 宽度
  const yb = Y(floor) + (compact ? 14 : 18);
  s += dimH(X(0), X(sec.widest), yb, `总宽 ${cm(sec.widest)}`, { below: true, size: compact ? 10 : 11 });
  if (opt.keepOldBox) s += dimH(X(0), X(old.x[1]), yb + (compact ? 24 : 28), `旧 ${cm(old.x[1])}`, { below: true, size: compact ? 10 : 11 });
  if (sec.spot) s += text(X(sec.spot.x + 0.085), Y(sec.spot.z - 0.045), `射灯离墙 ${cm(sec.spot.x)}`, { size: compact ? 10 : 11, fill: C.sub });
  return s;
}

function legend(x, y, items) {
  let s = '';
  items.forEach(([fill, label], i) => {
    s += `<rect x="${x}" y="${y + i * 20}" width="14" height="12" fill="${fill}" stroke="${C.line}" stroke-width="0.8"/>`;
    s += text(x + 20, y + i * 20 + 10.5, label, { size: 11.5, fill: C.sub });
  });
  return s;
}

export function sectionSVG(data, key, noSpots = false) {
  const opt = data.ceiling.living.options[key];
  const removed = opt.spotZ != null && noSpots;
  const S = 7.5;
  const w = 900, h = 82 + (272 - SECTION_BOTTOM * 100) * S + 30;
  let s = text(28, 36, `做法 ${key} · ${opt.name}${removed ? '（不装客厅射灯）' : ''}`, { size: 19, weight: 700 });
  s += text(28, 58, '沙发墙这一条的剖面（从阳台往餐厅方向看：左边是墙，上边是原天花）', { size: 12, fill: C.sub });
  s += sectionBody(data, key, S, 24, 82, false, noSpots);
  const lines = [
    opt.shape,
    removed ? '这个做法不装客厅射灯，沙发墙这一条只有灯带；检修口照留，灯带的驱动要用'
      : opt.spotZ != null ? `射灯：5 个，离墙 15 cm，嵌在离地 ${opt.spotZ.toFixed(2)} 的底面；光斑最亮尖离地约 ${opt.tip.toFixed(2)} m` : '没有射灯；洗墙灯带藏在旧边吊底下，朝墙往下',
    opt.kind === 'wash' ? '沙发墙这侧没有朝上的灯槽；阳台端、餐厅端的灯槽照常做' : '灯带在灯槽里，离挡边内侧 7 cm，发光面朝上，只照亮天花',
    opt.caveat && !(removed && /光斑/.test(opt.caveat)) ? `注意：${opt.caveat}` : '',
  ].filter(Boolean);
  // 右侧说明
  let yy = 120;
  s += text(610, yy, '说明', { size: 13, weight: 700 }); yy += 8;
  for (const t of lines) {
    for (const row of breakText(t, 22)) { yy += 19; s += text(610, yy, row, { size: 12, fill: C.sub }); }
    yy += 8;
  }
  const items = [[C.old, '旧边吊（保留）'], [C.neu, '新做的'], [C.alu, '铝槽'], [C.led, '灯带']];
  if (opt.spotZ != null && !removed) items.push([C.spot, '射灯']);
  s += legend(610, yy + 16, items);
  return wrap(w, h, s, `做法 ${key} 剖面`);
}

/** 按宽度折行：汉字算 1，英文数字算 0.55；不把数字、单位拆开，行首不放标点 */
function breakText(t, width) {
  const tokens = t.match(/[A-Za-z0-9.×–°+\-]+|\s+|./g) || [];
  const wide = (tok) => [...tok].reduce((n, ch) => n + (ch.charCodeAt(0) > 255 ? 1 : 0.55), 0);
  const rows = [];
  let cur = '', len = 0;
  for (const tok of tokens) {
    const tw = wide(tok);
    if (len + tw > width && cur && !/^[，。；、：）)]$/.test(tok)) { rows.push(cur.trim()); cur = ''; len = 0; }
    cur += tok; len += tw;
  }
  if (cur.trim()) rows.push(cur.trim());
  return rows;
}

export function sectionsAllSVG(data, spotsOff = {}) {
  const keys = Object.keys(data.ceiling.living.options);
  const S = 4.2;
  const cw = 420, chh = 372;
  const w = cw * 3 + 20, h = chh * 2 + 70;
  let s = text(24, 36, '客厅沙发墙吊顶：六种做法的剖面对比', { size: 19, weight: 700 });
  keys.forEach((k, i) => {
    const ox = 12 + (i % 3) * cw, oy = 60 + Math.floor(i / 3) * chh;
    const opt = data.ceiling.living.options[k];
    const removed = opt.spotZ != null && !!spotsOff[k];
    s += text(ox + 10, oy + 22, `${k} · ${opt.name}`, { size: 13.5, weight: 700 });
    s += sectionBody(data, k, S, ox + 4, oy + 34, true, removed);
    const note = removed ? '不装客厅射灯 · 只有灯带' : opt.tip ? `射灯底 ${opt.spotZ.toFixed(2)} · 光斑尖离地 ${opt.tip.toFixed(2)}` : '无射灯 · 洗墙';
    s += text(ox + 10, oy + chh - 22, note, { size: 11, fill: C.sub });
  });
  s += legend(w - 150, 14, [[C.old, '旧边吊'], [C.neu, '新做的']]);
  return wrap(w, h, s, '六种做法剖面对比');
}

/* ------------------------------------------------------------------ */
/*  天花布置                                                            */
/* ------------------------------------------------------------------ */

const pts = (arr, X, Y) => arr.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');

export function livingPlanSVG(data, key, noSpots = false) {
  const Lc = data.ceiling.living, c = Lc.common, opt = Lc.options[key];
  const W = Lc.x[1], L = Lc.y[1];
  const S = 118, ox = 150, oy = 150;
  const X = (x) => ox + x * S, Y = (y) => oy + y * S;
  const w = ox + W * S + 300, h = oy + L * S + 70;
  const old = data.ceiling.oldBox;
  let s = text(28, 36, `客厅天花布置 · 做法 ${key}（${opt.name}${opt.spotZ != null && noSpots ? '，不装客厅射灯' : ''}）`, { size: 19, weight: 700 });
  s += text(28, 58, '从上往下看，方向跟平面图一致：上边是阳台，左边是沙发墙。单位 m。', { size: 12, fill: C.sub });
  s += `<rect x="${X(0)}" y="${Y(0)}" width="${W * S}" height="${L * S}" fill="#fafafa" stroke="${C.line}" stroke-width="2.5"/>`;
  const wE = c.endBand, R = c.cornerRadius;
  const mid = c.lipThickness + c.ledFromLip;
  if (opt.kind === 'wash') {
    const x0 = opt.baffle.x[1];
    s += `<rect x="${X(x0)}" y="${Y(0)}" width="${(W - x0) * S}" height="${wE * S}" fill="${C.neu}" stroke="${C.line}"/>`;
    s += `<rect x="${X(x0)}" y="${Y(L - wE)}" width="${(W - x0) * S}" height="${wE * S}" fill="${C.neu}" stroke="${C.line}"/>`;
    s += `<rect x="${X(0)}" y="${Y(0)}" width="${old.x[1] * S}" height="${L * S}" fill="${C.old}" stroke="${C.line}"/>`;
    s += `<rect x="${X(opt.baffle.x[0])}" y="${Y(0)}" width="${Math.max(2, (opt.baffle.x[1] - opt.baffle.x[0]) * S)}" height="${L * S}" fill="${C.neu}" stroke="${C.line}"/>`;
    s += `<path d="M${X(x0)} ${Y(wE - mid)}H${X(W)}M${X(x0)} ${Y(L - wE + mid)}H${X(W)}" stroke="${C.led}" stroke-width="2.5"/>`;
    s += `<path d="M${X(opt.wash.x)} ${Y(0.02)}V${Y(L - 0.02)}" stroke="${C.led}" stroke-width="2.5" stroke-dasharray="7 4"/>`;
    s += text(X(0.2), Y(2.25), '洗墙灯带（藏在旧边吊底下，虚线）', { size: 11.5, fill: C.led, rotate: 0 });
  } else {
    const wS = opt.sofaWidth;
    const closure = [[W, L], [0, L], [0, 0], [W, 0]];
    s += `<polygon points="${pts([...uPath(W, L, wS, wE, wE, R, 0, 14), ...closure], X, Y)}" fill="${C.neu}" stroke="${C.line}"/>`;
    s += `<polyline points="${pts(uPath(W, L, wS, wE, wE, R, c.trough, 14), X, Y)}" fill="none" stroke="${C.sub}" stroke-dasharray="4 3"/>`;
    if (opt.kind === 'e1') {
      const b = opt.block.x[1];
      s += `<rect x="${X(0)}" y="${Y(0)}" width="${b * S}" height="${L * S}" fill="${C.neu}" stroke="${C.line}"/>`;
      const c1 = [wS + R, wE + R], c2 = [wS + R, L - wE - R];
      const rl = R - 0.015, yb = wE - mid;
      s += `<polyline points="${pts([[W, yb], [c1[0], yb]], X, Y)}" fill="none" stroke="${C.led}" stroke-width="2.5"/>`;
      s += `<polyline points="${pts([[c2[0], L - yb], [W, L - yb]], X, Y)}" fill="none" stroke="${C.led}" stroke-width="2.5"/>`;
      s += `<polyline points="${pts([...arc(c1, rl, -Math.PI / 2, -Math.PI, 12), ...arc(c2, rl, Math.PI, Math.PI / 2, 12)], X, Y)}" fill="none" stroke="${C.led}" stroke-width="2.5"/>`;
    } else {
      s += `<polyline points="${pts(uPath(W, L, wS, wE, wE, R, mid, 14), X, Y)}" fill="none" stroke="${C.led}" stroke-width="2.5"/>`;
      if (opt.lower) s += `<rect x="${X(0)}" y="${Y(0)}" width="${opt.lower.x[1] * S}" height="${L * S}" fill="none" stroke="${C.line}" stroke-dasharray="6 3"/>`;
      if (opt.keepOldBox && !opt.lower) s += `<rect x="${X(0)}" y="${Y(0)}" width="${old.x[1] * S}" height="${L * S}" fill="${C.old}" stroke="${C.line}"/>`;
    }
    s += dimH(X(0), X(wS), Y(3.72), `${wS.toFixed(2)}`, { below: true });
    s += text(X(wS + R * 0.55), Y(wE + R * 0.5), `R${R.toFixed(2)}`, { size: 11, fill: C.dim });
    s += text(X(wS + R * 0.55), Y(L - wE - R * 0.35), `R${R.toFixed(2)}`, { size: 11, fill: C.dim });
  }
  s += dimV(X(1.9), Y(0), Y(wE), `${wE.toFixed(2)}`);
  s += dimV(X(1.9), Y(L - wE), Y(L), `${wE.toFixed(2)}`);
  // 射灯 + 检修口
  const removed = opt.spotZ != null && noSpots;
  if (opt.spotZ != null) {
    const sx = c.spots.fromWall, ys = c.spots.y;
    if (!removed) {
      ys.forEach((y, i) => {
        s += `<circle cx="${X(sx)}" cy="${Y(y)}" r="${0.045 * S}" fill="#fff" stroke="${C.line}" stroke-width="1.4"/><path d="M${X(sx) - 8} ${Y(y)}h16M${X(sx)} ${Y(y) - 8}v16" stroke="${C.line}" stroke-width="0.8"/>`;
        s += text(X(-0.12), Y(y) + 4, `S${i + 1}`, { size: 11.5, anchor: 'end', weight: 700 });
      });
      const chain = [0, ...ys, L];
      for (let i = 0; i < chain.length - 1; i++) s += dimV(X(-0.52), Y(chain[i]), Y(chain[i + 1]), (chain[i + 1] - chain[i]).toFixed(2), { left: true });
      s += dimH(X(0), X(sx), Y(ys[0]) - 20, '', {});
      s += text(X(sx) + 34, Y(ys[0]) - 16, `离墙 ${sx.toFixed(2)}`, { size: 11, fill: C.dim });
    }
    const hs = c.hatch.size;
    s += `<rect x="${X(sx - hs[0] / 2)}" y="${Y(c.hatch.y - hs[1] / 2)}" width="${hs[0] * S}" height="${hs[1] * S}" fill="none" stroke="${C.dim}" stroke-dasharray="4 3"/>`;
    s += text(X(sx + hs[0] / 2) + 8, Y(c.hatch.y) + 4, `检修口 ${c.hatch.id}  ${hs[0].toFixed(2)} × ${hs[1].toFixed(2)}`, { size: 11, fill: C.dim });
  }
  // 吊扇
  const fan = data.furniture.find((f) => f.type === 'fan' && f.room === 'living');
  if (fan) {
    const fx = (fan.x[0] + fan.x[1]) / 2, fy = (fan.y[0] + fan.y[1]) / 2, fr = (fan.x[1] - fan.x[0]) / 2;
    s += `<circle cx="${X(fx)}" cy="${Y(fy)}" r="${fr * S}" fill="none" stroke="${C.sub}" stroke-dasharray="6 4"/>`;
    s += text(X(fx), Y(fy) + 4, '吊扇', { size: 11.5, fill: C.sub, anchor: 'middle' });
  }
  // 外围尺寸和朝向
  s += dimH(X(0), X(W), Y(0) - 26, `客厅宽 ${W.toFixed(3)}（实测）`);
  s += dimV(X(W) + 30, Y(0), Y(L), `客厅段 ${L.toFixed(2)}（待现场确认）`);
  s += text(X(W / 2), Y(0) - 50, '↑ 阳台', { size: 12.5, anchor: 'middle', weight: 700 });
  s += text(X(W / 2), Y(L) + 30, '↓ 餐厅（横向旧边吊）', { size: 12.5, anchor: 'middle', weight: 700 });
  s += text(X(0) - 98, Y(L / 2), '沙发墙', { size: 12.5, anchor: 'middle', weight: 700, rotate: -90 });
  s += text(X(W) + 14, Y(0.9), '电视墙（空调侧，不做边吊）', { size: 11.5, fill: C.sub, rotate: 90 });
  s += legend(X(W) + 70, Y(L) - 96, [[C.neu, '新做的边吊'], [C.old, '旧边吊'], [C.led, '灯带']]);
  s += text(X(W) + 70, Y(L) - 108, `边吊底离地 ${opt.under.toFixed(2)}${removed ? '，不装客厅射灯' : opt.spotZ != null && opt.spotZ !== opt.under ? `，射灯在 ${opt.spotZ.toFixed(2)} 那层` : ''}`, { size: 11.5, fill: C.sub });
  return wrap(w, h, s, '客厅天花布置');
}

export function masterPlanSVG(data, beam) {
  const m = data.ceiling.master, c = data.ceiling.living.common;
  const U = m.size.u, VV = m.size.v, R = m.cornerRadius;
  const S = 128, ox = 150, oy = 150;
  // 画成跟平面图同向：床头墙在右，窗墙在上
  const X = (u) => ox + (U - u) * S, Y = (v) => oy + v * S;
  const w = ox + U * S + 320, h = oy + VV * S + 70;
  const mid = c.lipThickness + c.ledFromLip;
  const cc = [m.headBand + R, m.windowBand + R];
  const path = (o) => [[U, m.windowBand - o], ...arc(cc, R + o, -Math.PI / 2, -Math.PI, 14), [m.headBand - o, VV]];
  let s = text(28, 36, '主卧天花布置 · L 形边吊', { size: 19, weight: 700 });
  s += text(28, 58, '从上往下看，方向跟平面图一致：上边是窗墙，右边是床头墙。单位 m。', { size: 12, fill: C.sub });
  s += `<rect x="${X(U)}" y="${Y(0)}" width="${U * S}" height="${VV * S}" fill="#fafafa" stroke="${C.line}" stroke-width="2.5"/>`;
  s += `<polygon points="${pts([...path(0), [0, VV], [0, 0], [U, 0]], X, Y)}" fill="${C.neu}" stroke="${C.line}"/>`;
  s += `<polyline points="${pts(path(c.trough), X, Y)}" fill="none" stroke="${C.sub}" stroke-dasharray="4 3"/>`;
  s += `<polyline points="${pts(path(mid), X, Y)}" fill="none" stroke="${C.led}" stroke-width="2.5"/>`;
  const bed = data.furniture.find((f) => f.id === 'master_bed');
  if (bed) {
    const u0 = m.headWallX - bed.x[1], u1 = m.headWallX - bed.x[0], v0 = bed.y[0] - m.windowWallY, v1 = bed.y[1] - m.windowWallY;
    s += `<rect x="${X(u1)}" y="${Y(v0)}" width="${(u1 - u0) * S}" height="${(v1 - v0) * S}" fill="none" stroke="${C.sub}" stroke-dasharray="6 4"/>`;
    s += text(X((u0 + u1) / 2), Y((v0 + v1) / 2) + 4, '床', { size: 12, fill: C.sub, anchor: 'middle' });
  }
  const fan = data.furniture.find((f) => f.type === 'fan' && f.room === 'master');
  if (fan) {
    const fu = m.headWallX - (fan.x[0] + fan.x[1]) / 2, fv = (fan.y[0] + fan.y[1]) / 2 - m.windowWallY, fr = (fan.x[1] - fan.x[0]) / 2;
    s += `<circle cx="${X(fu)}" cy="${Y(fv)}" r="${fr * S}" fill="none" stroke="${C.sub}" stroke-dasharray="2 4"/>`;
    s += text(X(fu), Y(fv) - fr * S - 6, `吊扇 F2（u ${fu.toFixed(2)}，v ${fv.toFixed(2)}）`, { size: 11, fill: C.sub, anchor: 'middle' });
  }
  let prev = 0;
  for (const sp of m.spots) {
    s += `<circle cx="${X(sp.u)}" cy="${Y(sp.v)}" r="${0.045 * S}" fill="#fff" stroke="${C.line}" stroke-width="1.4"/><path d="M${X(sp.u) - 8} ${Y(sp.v)}h16M${X(sp.u)} ${Y(sp.v) - 8}v16" stroke="${C.line}" stroke-width="0.8"/>`;
    s += text(X(0) + 44, Y(sp.v) + 4, sp.id, { size: 12, weight: 700 });
    s += dimV(X(0) + 26, Y(prev), Y(sp.v), '', {});
    s += text(X(0) + 44, Y((prev + sp.v) / 2) + 4, (sp.v - prev).toFixed(2), { size: 11, fill: C.dim });
    prev = sp.v;
  }
  s += dimV(X(0) + 26, Y(prev), Y(VV), '');
  s += text(X(0) + 44, Y((prev + VV) / 2) + 4, (VV - prev).toFixed(2), { size: 11, fill: C.dim });
  s += dimH(X(m.spots[0].u), X(0), Y(m.spots[0].v) - 20, '');
  s += text(X(m.spots[0].u) - 8, Y(m.spots[0].v) - 16, `离墙 ${m.spots[0].u.toFixed(2)}`, { size: 11, fill: C.dim, anchor: 'end' });
  const hs = m.hatch.size;
  s += `<rect x="${X(0.01 + hs[0])}" y="${Y(m.hatch.v - hs[1] / 2)}" width="${hs[0] * S}" height="${hs[1] * S}" fill="none" stroke="${C.dim}" stroke-dasharray="4 3"/>`;
  s += text(X(0.01 + hs[0]) - 6, Y(m.hatch.v) + 4, `检修口 ${m.hatch.id}`, { size: 11, fill: C.dim, anchor: 'end' });
  s += dimH(X(m.headBand), X(0), Y(3.0), m.headBand.toFixed(2), { below: true });
  s += dimV(X(1.9), Y(0), Y(m.windowBand), m.windowBand.toFixed(2), { left: true });
  s += text(X(m.headBand + R * 0.6), Y(m.windowBand + R * 0.55), `R${R.toFixed(2)}`, { size: 11, fill: C.dim, anchor: 'end' });
  s += dimH(X(U), X(0), Y(0) - 26, `宽 ${U.toFixed(2)}（实测）`);
  s += dimV(X(U) - 26, Y(0), Y(VV), '', { left: true });
  s += text(X(U) - 40, Y(VV / 2), `床头墙 ${VV.toFixed(2)}（实测，到衣柜前面）`, { size: 11, fill: C.dim, anchor: 'middle', rotate: -90 });
  s += text(X(U / 2), Y(0) - 50, '↑ 窗墙', { size: 12.5, anchor: 'middle', weight: 700 });
  s += text(X(0) + 96, Y(VV / 2), '床头墙（外墙）', { size: 12.5, anchor: 'middle', weight: 700, rotate: 90 });
  s += text(X(U / 2), Y(VV) + 30, '↓ 衣柜 / 主卫门', { size: 12.5, anchor: 'middle', weight: 700 });
  s += text(X(0) + 120, Y(VV) - 64, `边吊底离地 ${m.under.toFixed(2)}`, { size: 11.5, fill: C.sub });
  s += text(X(0) + 120, Y(VV) - 44, `射灯光束角 ${beam}°（24° / 36° 待定）`, { size: 11.5, fill: C.sub });
  s += legend(X(0) + 120, Y(VV) - 28, [[C.neu, '新做的边吊'], [C.led, '灯带']]);
  return wrap(w, h, s, '主卧天花布置');
}

/* ------------------------------------------------------------------ */
/*  全屋平面                                                            */
/* ------------------------------------------------------------------ */

export function floorPlanSVG(data) {
  const S = 66, ox = 130, oy = 100;
  const X = (x) => ox + (x + 0.3) * S, Y = (y) => oy + (y + 2.1) * S;
  const w = X(9.1) + 80, h = Y(10.8) + 50;
  const fills = { floor_wood: C.wood, floor_marble: C.marble, floor_tile: C.tile, floor_tile_dark: C.tile, floor_balcony: C.balc };
  let s = text(28, 36, `${data.meta.title} 全屋平面`, { size: 19, weight: 700 });
  s += text(28, 58, '内表面尺寸，单位 m。原点（红点）= 客厅沙发墙内表面 × 阳台推拉门线。', { size: 12, fill: C.sub });
  for (const f of data.floors) {
    const p = f.poly || [[f.rect[0], f.rect[1]], [f.rect[2], f.rect[1]], [f.rect[2], f.rect[3]], [f.rect[0], f.rect[3]]];
    s += `<polygon points="${pts(p, X, Y)}" fill="${fills[f.mat] || '#eee'}"/>`;
  }
  // 家具
  for (const it of data.furniture) {
    if (it.hidden || it.type === 'frames' || it.type === 'ac' || it.type === 'tv') continue;
    const x = X(it.x[0]), y = Y(it.y[0]), ww = (it.x[1] - it.x[0]) * S, hh = (it.y[1] - it.y[0]) * S;
    if (it.type === 'fan') {
      s += `<circle cx="${x + ww / 2}" cy="${y + hh / 2}" r="${ww / 2}" fill="none" stroke="#9aa0a8" stroke-dasharray="3 4"/>`;
      continue;
    }
    if (it.z0 > 1) { s += `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="none" stroke="#b0a089" stroke-dasharray="3 3"/>`; continue; }
    const rug = it.type === 'rug';
    s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${ww.toFixed(1)}" height="${hh.toFixed(1)}" rx="2" fill="${rug ? 'rgba(120,110,90,0.10)' : 'rgba(150,120,80,0.22)'}" stroke="#8b7557" stroke-width="${rug ? 0.6 : 1}"/>`;
    const underLabel = data.rooms.some((r) => {
      const lx = (r.x[0] + r.x[1]) / 2, ly = (r.y[0] + r.y[1]) / 2;
      return lx > it.x[0] - 0.5 && lx < it.x[1] + 0.5 && ly > it.y[0] - 0.25 && ly < it.y[1] + 0.3;
    });
    if (!rug && !underLabel && ww * hh > 2600 && it.type !== 'chair') {
      const vertical = hh > ww * 1.4;
      s += text(x + ww / 2, y + hh / 2 + 4, it.name, { size: 10, fill: '#5a4a35', anchor: 'middle', rotate: vertical ? -90 : 0 });
    }
  }
  // 墙
  for (const wl of data.walls) {
    s += `<rect x="${X(wl.x[0]).toFixed(1)}" y="${Y(wl.y[0]).toFixed(1)}" width="${((wl.x[1] - wl.x[0]) * S).toFixed(1)}" height="${((wl.y[1] - wl.y[0]) * S).toFixed(1)}" fill="#3c4047"/>`;
    const axis = wl.x[1] - wl.x[0] >= wl.y[1] - wl.y[0] ? 'x' : 'y';
    for (const o of wl.openings || []) {
      const r = axis === 'x'
        ? [X(o.at[0]), Y(wl.y[0]) - 0.5, (o.at[1] - o.at[0]) * S, (wl.y[1] - wl.y[0]) * S + 1]
        : [X(wl.x[0]) - 0.5, Y(o.at[0]), (wl.x[1] - wl.x[0]) * S + 1, (o.at[1] - o.at[0]) * S];
      const win = o.fill !== 'door';
      s += `<rect x="${r[0].toFixed(1)}" y="${r[1].toFixed(1)}" width="${r[2].toFixed(1)}" height="${r[3].toFixed(1)}" fill="${win ? '#cfe3ee' : '#ffffff'}" stroke="#3c4047" stroke-width="0.8"/>`;
      if (o.fill === 'door') {
        const hingeA = o.hinge === 'end' ? o.at[1] : o.at[0];
        const width = o.at[1] - o.at[0];
        const sign = o.swing === '+' ? 1 : -1;
        const dirA = o.hinge === 'end' ? -1 : 1;
        let hx, hy, cx, cy, ex, ey;
        if (axis === 'x') {
          const face = sign > 0 ? wl.y[1] : wl.y[0];
          [hx, hy] = [hingeA, face]; [cx, cy] = [hingeA + dirA * width, face]; [ex, ey] = [hingeA, face + sign * width];
        } else {
          const face = sign > 0 ? wl.x[1] : wl.x[0];
          [hx, hy] = [face, hingeA]; [cx, cy] = [face, hingeA + dirA * width]; [ex, ey] = [face + sign * width, hingeA];
        }
        const cross = (cx - hx) * (ey - hy) - (cy - hy) * (ex - hx);
        s += `<path d="M${X(hx)} ${Y(hy)}L${X(ex)} ${Y(ey)}A${width * S} ${width * S} 0 0 ${cross > 0 ? 0 : 1} ${X(cx)} ${Y(cy)}" fill="none" stroke="#6b7280" stroke-width="0.9"/>`;
      }
    }
  }
  // 阳台栏杆、旧边吊
  s += `<polyline points="${pts(data.balcony.rail, X, Y)}" fill="none" stroke="#3c4047" stroke-width="3"/>`;
  const ob = data.ceiling.oldBox;
  s += `<rect x="${X(ob.x[0])}" y="${Y(ob.y[0])}" width="${Math.max(3, (ob.x[1] - ob.x[0]) * S)}" height="${(ob.y[1] - ob.y[0]) * S}" fill="rgba(243,156,18,0.55)"/>`;
  s += text(X(0.16), Y(8.4), '旧边吊 0.10 × 0.30 沿沙发墙通长', { size: 10.5, fill: '#b9770e', rotate: 90 });
  // 房间名
  for (const r of data.rooms) {
    const cx = X((r.x[0] + r.x[1]) / 2), cy = Y((r.y[0] + r.y[1]) / 2);
    s += text(cx, cy - 2, r.name, { size: 13, weight: 700, anchor: 'middle' });
    if (r.size) s += text(cx, cy + 14, r.size, { size: 10.5, fill: C.sub, anchor: 'middle' });
  }
  // 外围尺寸
  const Lc = data.ceiling.living;
  s += dimV(X(-0.2) - 26, Y(0), Y(ob.y[1]), `沙发墙 ${ob.y[1].toFixed(2)}`, { left: true });
  s += dimH(X(0), X(Lc.x[1]), Y(-2.0) - 4, `${Lc.x[1].toFixed(3)}`);
  const m = data.ceiling.master;
  s += dimH(X(m.headWallX - m.size.u), X(m.headWallX), Y(-1.74) - 12, `${m.size.u.toFixed(2)}`);
  s += dimV(X(8.99) + 22, Y(m.windowWallY), Y(m.windowWallY + m.size.v), `${m.size.v.toFixed(2)}`);
  const b2 = data.rooms.find((r) => r.id === 'bedroom2');
  if (b2) s += dimH(X(b2.x[0]), X(b2.x[1]), Y(-1.74) - 12, `${(b2.x[1] - b2.x[0]).toFixed(2)}`);
  s += `<circle cx="${X(0)}" cy="${Y(0)}" r="5" fill="#d93025"/>`;
  s += text(X(0) - 10, Y(0) + 4, '原点', { size: 11, fill: '#d93025', anchor: 'end', weight: 700 });
  s += text(X(4.2), Y(9.1), 'x →（沙发墙 → 卧室）', { size: 11.5, fill: C.sub });
  s += text(X(4.2), Y(9.45), 'y ↓（阳台 → 入户门）', { size: 11.5, fill: C.sub });
  s += legend(X(4.2), Y(9.75), [[C.wood, '木地板'], [C.tile, '瓷砖'], ['#cfe3ee', '窗 / 推拉门']]);
  return wrap(w, h, s, '全屋平面');
}

export const DRAWINGS = [
  { id: 'section', name: '当前做法剖面', make: (app) => sectionSVG(app.data, app.state.option, !!app.state.spotsOff[app.state.option]) },
  { id: 'sections', name: '六种剖面对比', make: (app) => sectionsAllSVG(app.data, app.state.spotsOff) },
  { id: 'living', name: '客厅天花布置', make: (app) => livingPlanSVG(app.data, app.state.option, !!app.state.spotsOff[app.state.option]) },
  { id: 'master', name: '主卧天花布置', make: (app) => masterPlanSVG(app.data, app.state.masterBeam) },
  { id: 'plan', name: '全屋平面', make: (app) => floorPlanSVG(app.data) },
];
