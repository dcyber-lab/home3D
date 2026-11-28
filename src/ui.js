// 界面：左边控制面板、右边组件面板、底部操作提示、施工图弹窗。
import { Editor } from './editor.js';
import { COMPONENTS } from './furniture.js';
import { FINISHES, FLOOR_FINISHES, WALL_FINISHES } from './materials.js';
import { DRAWINGS } from './drawings.js';
import { livingSpotInfo } from './ceiling.js';
import { buildShare, encodeShare, shareURL } from './share.js';
import { round2 } from './geo.js';

/** 小小的 DOM 帮手 */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const HINTS = {
  orbit: '拖动旋转 · 滚轮缩放 · 右键平移 · 双击地面走进去 · 点家具可以换',
  walk: '拖动转头 · 滚轮 / WASD 走动 · 双击地面走过去 · 点家具可以换',
  measure: '依次点两个点量距离 · Esc 退出',
};
const HINTS_TOUCH = {
  orbit: '单指旋转 · 双指缩放平移 · 双击地面走进去 · 点家具可以换',
  walk: '单指转头 · 双指捏合前进后退 · 双击地面走过去',
  measure: '依次点两个点量距离',
};

/**
 * opts.readOnly：给工人的只读页面。能看、能换视角和灯光场景、能量距离、能看施工图，
 * 但做法、射灯、材质、家具都不能改，也不出现任何修改入口。
 */
export function initUI(app, opts = {}) {
  const ro = !!opts.readOnly;
  const editor = new Editor(app);
  editor.readOnly = ro;
  app.editor = editor;
  const root = document.getElementById('ui');
  const touch = matchMedia('(pointer: coarse)').matches;
  const data = app.data;
  const refs = {};

  /* ---------------- 地址栏里记住状态，方便把链接发给施工队 ---------------- */

  const hasDefaultNoSpots = Object.values(data.ceiling.living.options).some((o) => o.noSpots);
  const spotCfg = data.ceiling.living.common.spots;
  const spotDefaults = { count: spotCfg.y.length, beam: spotCfg.beam };   // 数据里的默认值，链接只记跟它不一样的
  const beamChoices = spotCfg.beamChoices || [15, 24, 36, 60];
  const maxSpots = spotCfg.maxCount || 8;
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get('o') && data.ceiling.living.options[p.get('o')]) app.state.option = p.get('o');
    if (p.get('s') && data.scenes[p.get('s')]) app.state.scene = p.get('s');
    if (p.get('b')) app.state.masterBeam = Number(p.get('b')) === 36 ? 36 : 24;
    if (p.get('d') === '1') app.state.show.dims = true;
    // ns = 哪些做法移除了客厅射灯，例如 ns=A-D。带了这个参数就完全按它来
    const opts = data.ceiling.living.options;
    if (p.has('ns')) {
      app.state.spotsOff = {};
      for (const k of p.get('ns').split(/[-,.]/)) if (opts[k] && opts[k].spotZ != null) app.state.spotsOff[k] = true;
    } else if (p.get('sp') === '0') {
      // 旧链接：sp=0 表示所有做法都不要客厅射灯
      for (const k of Object.keys(opts)) if (opts[k].spotZ != null) app.state.spotsOff[k] = true;
    }
    // n = 客厅射灯数量，a = 光束角
    const n = Number(p.get('n')), a = Number(p.get('a'));
    if (p.has('n') && n >= 1 && n <= maxSpots) app.setLivingSpotLayout({ count: n }, false);
    if (p.has('a') && a >= 8 && a <= 90) app.setLivingSpotLayout({ beam: a }, false);
    return p.get('v');
  }
  function writeHash() {
    if (ro) return;                 // 只读页面的地址就是令牌，不能动
    const s = app.state;
    const p = new URLSearchParams();
    p.set('o', s.option);
    p.set('s', s.scene);
    if (s.view) p.set('v', s.view);
    if (s.masterBeam !== 24) p.set('b', s.masterBeam);
    if (s.show.dims) p.set('d', '1');
    const off = Object.keys(data.ceiling.living.options).filter((k) => s.spotsOff[k]);
    if (off.length || hasDefaultNoSpots) p.set('ns', off.join('-'));
    if (spotCfg.y.length !== spotDefaults.count) p.set('n', spotCfg.y.length);
    if (spotCfg.beam !== spotDefaults.beam) p.set('a', spotCfg.beam);
    history.replaceState(null, '', '#' + p.toString());
  }

  /* ---------------- 左边面板 ---------------- */

  const section = (title, open, ...body) =>
    h('details', { class: 'sec', open }, h('summary', {}, title), h('div', { class: 'sec-body' }, ...body));

  const optKeys = Object.keys(data.ceiling.living.options);
  refs.optButtons = optKeys.map((k) => h('button', { class: 'opt', 'data-k': k, title: data.ceiling.living.options[k].name, onclick: () => app.setOption(k) }, k));
  refs.optCard = h('div', { class: 'card' });

  refs.sceneButtons = Object.entries(data.scenes).map(([k, sc]) =>
    h('button', { class: 'seg', 'data-k': k, onclick: () => app.setScene(k) }, sc.name));
  refs.sceneHint = h('p', { class: 'hint' });

  refs.viewButtons = data.cameras.map((c) =>
    h('button', { class: 'chip', 'data-k': c.id, title: c.look || '', onclick: () => app.gotoView(c.id) }, c.name));

  const toggle = (label, get, set, title) => {
    const input = h('input', { type: 'checkbox', checked: get(), onchange: (e) => set(e.target.checked) });
    const el = h('label', { class: 'toggle', title }, input, h('span', { class: 'track' }), h('span', {}, label));
    el.sync = () => { input.checked = get(); };
    return el;
  };
  refs.toggles = [
    toggle('家具', () => app.state.show.furniture, (v) => app.setShow('furniture', v)),
    toggle('画框', () => app.state.show.frames, (v) => app.setShow('frames', v), '评估射灯光斑时可以先拿掉'),
    toggle('窗帘', () => app.state.show.curtains, (v) => app.setShow('curtains', v)),
    toggle('尺寸标注', () => app.state.show.dims, (v) => app.setShow('dims', v)),
    toggle('房间名', () => app.state.show.labels, (v) => app.setShow('labels', v), '从屋外看时显示'),
    toggle('新旧分色', () => app.state.show.colourCode, (v) => app.setShow('colourCode', v), '旧边吊灰蓝，新做的暖黄'),
    toggle('其他房间照明', () => app.state.general, (v) => app.setGeneral(v), '文档里没有这些灯，开着只是为了看清户型'),
  ];
  refs.beamButtons = data.ceiling.master.beamChoices.map((b) =>
    h('button', { class: 'seg', 'data-k': String(b), onclick: () => app.setMasterBeam(b) }, `${b}°`));
  const slider = (label, min, max, step, value, fmtFn, onInput) => {
    const out = h('output', {}, fmtFn(value));
    const input = h('input', { type: 'range', min, max, step, value, oninput: (e) => { out.textContent = fmtFn(Number(e.target.value)); onInput(Number(e.target.value)); } });
    return h('label', { class: 'slider' }, h('span', {}, label), input, out);
  };

  const select = (options, value, onChange) => {
    const el = h('select', { onchange: (e) => onChange(e.target.value) },
      Object.entries(options).map(([k, v]) => h('option', { value: k }, v.label || v)));
    el.value = value;
    return el;
  };

  refs.addSelect = h('select', {}, Object.entries(COMPONENTS).map(([k, v]) => h('option', { value: k }, `${v.cat} · ${v.label}`)));
  refs.dirty = h('p', { class: 'hint dirty' });
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { await editor.importJSON(f); } catch (err) { toast('导入失败：' + err.message); }
    e.target.value = '';
  } });

  refs.measureBtn = h('button', { class: 'btn', onclick: () => editor.setTool(editor.tool === 'measure' ? 'select' : 'measure') }, '量距离');
  refs.clearMeasure = h('button', { class: 'btn ghost', hidden: true, onclick: () => editor.clearMeasures() }, '清除测量');

  const panel = h('aside', { id: 'panel' },
    h('header', {},
      h('div', {},
        h('h1', {}, data.meta.title, ro ? h('span', { class: 'badge' }, '只读') : null),
        h('p', {}, ro ? `施工版 · ${opts.share.date} 生成` : `${data.meta.subtitle} · 全屋 3D`)),
      h('button', { class: 'icon', title: '收起面板', 'aria-label': '收起面板', onclick: () => setPanel(false) }, '‹')),
    h('div', { class: 'scroll' },
      ro
        ? section('客厅吊顶做法（已定）', true,
          refs.optCard,
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => openDrawings('section') }, '看剖面'),
            h('button', { class: 'btn ghost', onclick: () => openDrawings('living') }, '天花布置图')))
        : section('客厅吊顶做法', true,
          h('div', { class: 'opts' }, refs.optButtons),
          refs.optCard,
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => openDrawings('section') }, '看剖面'),
            h('button', { class: 'btn ghost', onclick: () => openDrawings('sections') }, '六种对比'))),
      section('灯光场景', true, h('div', { class: 'segs two' }, refs.sceneButtons), refs.sceneHint),
      section('视角', true, h('div', { class: 'chips' }, refs.viewButtons)),
      section('显示', false,
        h('div', { class: 'toggles' }, refs.toggles),
        h('div', { class: 'field' }, h('span', {}, '主卧射灯'),
          ro ? h('span', {}, `${app.state.masterBeam}°（已定）`) : h('div', { class: 'segs' }, refs.beamButtons)),
        slider('曝光', -2, 2, 0.1, 0, (v) => (v > 0 ? '+' : '') + v.toFixed(1), (v) => app.setExposure(v)),
        slider('剖切高度', 0.3, 3, 0.05, 3, (v) => (v >= 2.95 ? '不切' : v.toFixed(2) + ' m'), (v) => app.setClip(v))),
      ro ? null : section('材质', false,
        h('div', { class: 'field' }, h('span', {}, '地板'), select(FLOOR_FINISHES, app.M.floorFinish, (v) => { app.M.setFloor(v); editor.save(); app.invalidate(); })),
        h('div', { class: 'field' }, h('span', {}, '墙面'), select(WALL_FINISHES, app.M.wallFinish, (v) => { app.M.setWall(v); editor.save(); app.invalidate(); }))),
      ro ? null : section('家具和组件', false,
        h('p', { class: 'hint' }, '点场景里的家具：换款式、面料、尺寸、位置；选中后按住可以拖动。'),
        h('div', { class: 'row' }, refs.addSelect, h('button', { class: 'btn', onclick: () => { editor.add(refs.addSelect.value); toast('已添加，拖动它到位置上'); } }, '添加')),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => editor.exportJSON(), title: '下载完整的 home.json' }, '导出 JSON'),
          h('button', { class: 'btn ghost', onclick: () => fileInput.click() }, '导入'),
          h('button', { class: 'btn ghost', onclick: () => { if (confirm('丢掉本机的改动，回到仓库里的默认方案？')) editor.reset(); } }, '恢复默认')),
        fileInput, refs.dirty),
      section('工具', false,
        h('div', { class: 'row' }, refs.measureBtn, refs.clearMeasure),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => openDrawings('living') }, '施工图'),
          h('button', { class: 'btn ghost', onclick: savePNG }, '存截图'),
          ro ? null : h('button', { class: 'btn ghost', onclick: copyLink, title: '给自己用：打开后还能继续改' }, '复制链接')),
        ro ? null : h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: openShare, title: '把现在的方案定下来，生成一个只能看、不能改的链接' }, '只读链接（给工人）'))),
      section('待现场确认', false,
        h('ul', { class: 'confirm' }, (data.toConfirm || []).map((t) =>
          h('li', {}, h('b', {}, t.item), h('span', {}, `现在用：${t.now}`), h('em', {}, t.why))))),
      h('p', { class: 'foot' }, ro
        ? `这是只读链接，内容不能改；要调整请找业主重新发一个。数据版本 ${data.meta.version}${opts.share.stale ? `（链接生成时是 ${opts.share.dataVersion}，尺寸数据之后更新过）` : ''}`
        : `数据版本 ${data.meta.version} · 尺寸按建模说明，带“假设”的没量过`)));
  if (ro) panel.classList.add('ro');

  const reopen = h('button', { id: 'reopen', class: 'icon', title: '打开面板', 'aria-label': '打开面板', hidden: true, onclick: () => setPanel(true) }, '☰');
  const narrow = matchMedia('(max-width: 760px)');
  function setPanel(open) {
    panel.classList.toggle('closed', !open);
    reopen.hidden = open;
    updateInsets();
  }
  /** 告诉场景面板挡住了哪一块，画面中心让到剩下的区域 */
  function updateInsets() {
    const open = !panel.classList.contains('closed');
    if (!open) app.setInsets({});
    else if (narrow.matches) app.setInsets({ bottom: panel.offsetHeight });
    else app.setInsets({ left: panel.offsetWidth + 12 });
  }
  window.addEventListener('resize', updateInsets);

  /* ---------------- 底部：操作方式 + 提示 ---------------- */

  refs.modeButtons = [
    h('button', { class: 'seg', 'data-k': 'orbit', onclick: () => setMode('orbit') }, '环绕'),
    h('button', { class: 'seg', 'data-k': 'walk', onclick: () => setMode('walk') }, '漫游'),
  ];
  refs.hint = h('span', { class: 'tip' });
  const bar = h('div', { id: 'bar' }, h('div', { class: 'segs' }, refs.modeButtons), refs.hint);

  function setMode(mode) {
    const c = app.controls;
    if (c.mode === mode) return;
    if (mode === 'walk') {
      // 从外面切到漫游：站到客厅中间
      if (app.outside) { app.gotoView('diag'); return; }
      c.setMode('walk');
      c.hfov = 78; c.updateFov();
    } else {
      app.gotoView('overview');
      return;
    }
    app.state.view = '';
    app.emit('state');
    app.invalidate();
  }

  /* ---------------- 右边：组件面板 ---------------- */

  const inspector = h('aside', { id: 'inspector', hidden: true });

  function num(label, value, step, onChange, min) {
    const input = h('input', { type: 'number', step, value: round2(value), min, onchange: (e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) onChange(v);
    } });
    return h('label', { class: 'num' }, h('span', {}, label), input);
  }

  function renderInspector() {
    const it = editor.selected;
    inspector.hidden = !it;
    inspector.replaceChildren();
    if (!it) return;
    const def = COMPONENTS[it.type] || COMPONENTS.box;
    const alongX = it.face === '+x' || it.face === '-x';
    const w = alongX ? it.y[1] - it.y[0] : it.x[1] - it.x[0];
    const d = alongX ? it.x[1] - it.x[0] : it.y[1] - it.y[0];
    const cx = (it.x[0] + it.x[1]) / 2, cy = (it.y[0] + it.y[1]) / 2;
    const types = Object.fromEntries(Object.entries(COMPONENTS).map(([k, v]) => [k, { label: `${v.cat} · ${v.label}` }]));
    const fins = Object.fromEntries(def.finishes.map((k) => [k, FINISHES[k]]));
    const arrows = { '+y': '↓', '-y': '↑', '+x': '→', '-x': '←' };
    if (ro) {
      const kv = (k, v) => h('div', { class: 'kv' }, h('span', {}, k), h('b', {}, v));
      inspector.append(
        h('header', {},
          h('strong', { class: 'name' }, it.name || def.label),
          h('button', { class: 'icon', title: '关闭', 'aria-label': '关闭', onclick: () => editor.select(null) }, '×')),
        h('div', { class: 'scroll' },
          kv('款式', def.label),
          FINISHES[it.finish] ? kv('面料', FINISHES[it.finish].label) : null,
          kv('宽 × 深 × 高', `${w.toFixed(2)} × ${d.toFixed(2)} × ${it.h.toFixed(2)} m`),
          kv('x 范围', `${it.x[0].toFixed(2)} – ${it.x[1].toFixed(2)}`),
          kv('y 范围', `${it.y[0].toFixed(2)} – ${it.y[1].toFixed(2)}`),
          it.z0 ? kv('离地', `${it.z0.toFixed(2)} m`) : null,
          it.note ? h('p', { class: 'hint' }, it.note) : null,
          h('p', { class: 'hint' }, '坐标原点在客厅沙发墙内表面 × 阳台推拉门线：x 向右，y 向入户门。')));
      return;
    }
    inspector.append(
      h('header', {},
        h('input', { class: 'name', value: it.name || def.label, 'aria-label': '名称', onchange: (e) => editor.patch(it, { name: e.target.value }) }),
        h('button', { class: 'icon', title: '关闭', 'aria-label': '关闭', onclick: () => editor.select(null) }, '×')),
      h('div', { class: 'scroll' },
        h('div', { class: 'field' }, h('span', {}, '款式'), select(types, it.type, (v) => editor.swapType(it, v))),
        def.finishes.length > 1 ? h('div', { class: 'field' }, h('span', {}, '面料'), select(fins, def.finishes.includes(it.finish) ? it.finish : def.finishes[0], (v) => editor.patch(it, { finish: v }))) : null,
        h('div', { class: 'grid2' },
          num('中心 x', cx, 0.05, (v) => editor.setBox(it, { cx: v })),
          num('中心 y', cy, 0.05, (v) => editor.setBox(it, { cy: v })),
          num('宽', w, 0.05, (v) => editor.setBox(it, { w: v }), 0.02),
          num('深', d, 0.05, (v) => editor.setBox(it, { d: v }), 0.01),
          num('高', it.h, 0.05, (v) => editor.patch(it, { h: Math.max(0.005, v) }), 0.005),
          num('离地', it.z0 || 0, 0.05, (v) => editor.patch(it, { z0: Math.max(0, v) }), 0)),
        h('p', { class: 'hint mono' }, `x ${it.x[0].toFixed(2)}–${it.x[1].toFixed(2)} · y ${it.y[0].toFixed(2)}–${it.y[1].toFixed(2)} · 朝向 ${arrows[it.face]}`),
        it.note ? h('p', { class: 'hint' }, it.note) : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => editor.rotate(it) }, '转 90°'),
          h('button', { class: 'btn ghost', onclick: () => editor.patch(it, { hidden: !it.hidden }) }, it.hidden ? '显示' : '隐藏'),
          h('button', { class: 'btn ghost', onclick: () => editor.duplicate(it) }, '复制'),
          h('button', { class: 'btn danger', onclick: () => editor.remove(it) }, '删除')),
        h('p', { class: 'hint' }, '按住选中的家具可以在地面上拖动。坐标是文档坐标：x 向右，y 向入户门。')));
  }

  /* ---------------- 施工图弹窗 ---------------- */

  const modal = h('div', { id: 'modal', hidden: true, onclick: (e) => { if (e.target === modal) closeDrawings(); } });
  let currentDrawing = 'section';
  // 只读页面只有一个定下来的做法，不放六种对比
  const drawings = ro ? DRAWINGS.filter((d) => d.id !== 'sections') : DRAWINGS;
  function openDrawings(id) {
    currentDrawing = id || currentDrawing;
    const def = drawings.find((d) => d.id === currentDrawing) || drawings[0];
    const sheet = h('div', { class: 'sheet', html: def.make(app) });
    modal.replaceChildren(h('div', { class: 'dialog', role: 'dialog', 'aria-label': '施工图' },
      h('header', {},
        h('div', { class: 'tabs' }, drawings.map((d) => h('button', { class: 'tab' + (d.id === def.id ? ' on' : ''), onclick: () => openDrawings(d.id) }, d.name))),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => window.print() }, '打印 / 存 PDF'),
          h('button', { class: 'btn ghost', onclick: () => download(`${def.name}.svg`, new Blob([sheet.innerHTML], { type: 'image/svg+xml' })) }, '下载 SVG'),
          h('button', { class: 'icon', title: '关闭', 'aria-label': '关闭', onclick: closeDrawings }, '×'))),
      sheet));
    modal.hidden = false;
  }
  function closeDrawings() { modal.hidden = true; modal.replaceChildren(); }
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeDrawings(); });

  /* ---------------- 小工具 ---------------- */

  const toastEl = h('div', { id: 'toast', hidden: true });
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }
  function download(name, blob) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function savePNG() {
    const url = app.snapshot();
    const a = h('a', { href: url, download: `lake-grande-${app.state.option}-${app.state.scene}.png` });
    a.click();
  }
  async function copyLink() {
    writeHash();
    try { await navigator.clipboard.writeText(location.href); toast('链接已复制：打开就是现在的做法、场景和视角'); }
    catch { toast(location.href); }
  }

  /** 把现在的方案定下来，生成给工人的只读链接 */
  function openShare() {
    const { payload, furnitureChanges, structureDiffers } = buildShare(app);
    const url = shareURL(encodeShare(payload));
    const opt = data.ceiling.living.options[payload.o];
    const spots = opt.spotZ == null ? '洗墙灯带（这个做法没有射灯）'
      : payload.ns ? '不装客厅射灯' : `客厅射灯 ${payload.n} 个 · 光束角 ${payload.a}°`;
    const field = h('textarea', { class: 'share-url', readonly: true, rows: 3, 'aria-label': '只读链接', onfocus: (e) => e.target.select() }, url);
    const status = h('span', { class: 'share-status' });
    const copy = async () => {
      try { await navigator.clipboard.writeText(url); status.textContent = '已复制'; }
      catch { field.focus(); field.select(); status.textContent = '没能自动复制，请手动复制上面的链接'; }
    };
    const li = (k, v) => h('li', {}, h('span', {}, k), h('b', {}, v));
    modal.replaceChildren(h('div', { class: 'dialog small', role: 'dialog', 'aria-label': '只读链接' },
      h('header', {},
        h('strong', {}, '只读链接（给工人）'),
        h('button', { class: 'icon', title: '关闭', 'aria-label': '关闭', onclick: closeDrawings }, '×')),
      h('div', { class: 'share' },
        h('p', {}, '工人打开这个链接只能看：可以转视角、换灯光场景、量距离、看施工图，但做法、射灯、材质、家具都改不了。链接里固定的是现在这一套：'),
        h('ul', { class: 'share-list' },
          li('做法', `${payload.o} · ${opt.name}`),
          li('射灯', spots),
          li('主卧射灯', `光束角 ${payload.mb}°`),
          li('材质', `${FLOOR_FINISHES[payload.fl].label}地板 · ${WALL_FINISHES[payload.wl].label}墙面`),
          li('家具', furnitureChanges ? `仓库里的布置 + 你在这台电脑上改的 ${furnitureChanges} 处` : '仓库里的布置'),
          li('打开时', `${data.scenes[payload.s].name} · ${(data.cameras.find((c) => c.id === payload.vw) || {}).name || '鸟瞰全屋'}`)),
        field,
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: copy }, '复制链接'),
          h('a', { class: 'btn ghost', href: url, target: '_blank', rel: 'noopener' }, '打开看看'),
          status),
        structureDiffers ? h('p', { class: 'warn' }, '注意：你导入过一份墙体或吊顶尺寸跟仓库不一样的数据。只读链接按仓库里的尺寸显示，请先把导出的 JSON 更新到仓库再发链接。') : null,
        url.length > 1900 ? h('p', { class: 'warn' }, `这个链接比较长（${url.length} 个字符），有的聊天软件会截断。家具改动多的话，先导出 JSON 更新到仓库，再生成链接会短很多。`) : null,
        h('p', { class: 'note' }, '之后你再改方案，这个链接显示的内容不会变；要给工人新方案，重新生成一个链接发过去。'))));
    modal.hidden = false;
    copy();
  }

  /* ---------------- 同步 ---------------- */

  function sync() {
    const s = app.state;
    const opt = data.ceiling.living.options[s.option];
    const opts = data.ceiling.living.options;
    for (const b of refs.optButtons) {
      const k = b.dataset.k;
      const removed = opts[k].spotZ != null && !!s.spotsOff[k];
      b.classList.toggle('on', k === s.option);
      b.classList.toggle('nospot', removed);
      b.title = opts[k].name + (removed ? '（已移除客厅射灯）' : '');
    }
    const hasSpots = app.livingHasSpots();
    const info = livingSpotInfo(data, s.option);
    const count = spotCfg.y.length;
    const step = (label, delta, disabled) => h('button', { class: 'icon', disabled, 'aria-label': label, title: label,
      onclick: () => app.setLivingSpotLayout({ count: count + delta }) }, delta > 0 ? '+' : '−');
    for (const b of refs.sceneButtons) b.classList.toggle('on', b.dataset.k === s.scene);
    for (const b of refs.viewButtons) b.classList.toggle('on', b.dataset.k === s.view);
    for (const b of refs.beamButtons) b.classList.toggle('on', Number(b.dataset.k) === s.masterBeam);
    for (const t of refs.toggles) t.sync();
    const controls = ro ? [] : [
      // 每个做法各自一个开关：关掉 = 这个做法不装客厅射灯。主卧射灯不受影响
      opt.spotZ != null
        ? toggle('客厅射灯', () => app.livingHasSpots(s.option), (v) => app.setLivingSpots(s.option, v),
          '关掉 = 这个做法不装客厅射灯。每个做法各记各的，主卧射灯不受影响')
        : h('p', { class: 'hint' }, '这个做法本来就没有射灯'),
      // 数量和光束角：六个做法共用，沿沙发墙等分
      hasSpots ? h('div', { class: 'field' }, h('span', {}, '数量'),
        h('div', { class: 'stepper' },
          step('减少一个射灯', -1, count <= 1),
          h('output', {}, `${count} 个`),
          step('增加一个射灯', 1, count >= maxSpots),
          h('span', { class: 'hint' }, info.spacing ? `间距 ${info.spacing.toFixed(2)} m` : '居中'))) : null,
      hasSpots ? h('div', { class: 'field' }, h('span', {}, '光束角'),
        h('div', { class: 'segs' }, beamChoices.map((b) =>
          h('button', { class: 'seg' + (b === spotCfg.beam ? ' on' : ''), onclick: () => app.setLivingSpotLayout({ beam: b }) }, `${b}°`)))) : null,
    ];
    refs.optCard.replaceChildren(
      h('h3', {}, h('b', {}, s.option), opt.name),
      h('p', {}, opt.shape),
      h('div', { class: 'tags' },
        opt.spotZ == null ? h('span', {}, '无射灯')
          : hasSpots ? h('span', {}, `射灯底 ${opt.spotZ.toFixed(2)} m`)
          : h('span', { class: 'off' }, '不装射灯'),
        info ? (hasSpots ? h('span', {}, `光斑尖离地 ${info.tip.toFixed(2)} m`) : null) : h('span', {}, '洗墙灯带'),
        h('span', {}, `边吊底 ${opt.under.toFixed(2)} m`),
        ro && hasSpots ? h('span', {}, `射灯 ${count} 个 · 光束角 ${spotCfg.beam}°`) : null,
        ro && hasSpots && info.spacing ? h('span', {}, `间距 ${info.spacing.toFixed(2)} m`) : null),
      opt.caveat && (hasSpots || !/光斑/.test(opt.caveat)) ? h('p', { class: 'caveat' }, opt.caveat) : null,
      ...controls);
    const sc = data.scenes[s.scene];
    refs.sceneHint.textContent = sc.hint || '';
    refs.sceneHint.hidden = !sc.hint;
    writeHash();
  }

  function syncMode() {
    const mode = app.controls.mode;
    for (const b of refs.modeButtons) b.classList.toggle('on', b.dataset.k === mode);
    const key = editor.tool === 'measure' ? 'measure' : mode;
    const tip = (touch ? HINTS_TOUCH : HINTS)[key];
    refs.hint.textContent = ro ? tip.replace('点家具可以换', '点家具看尺寸') : tip;
    refs.measureBtn.classList.toggle('on', editor.tool === 'measure');
    refs.measureBtn.textContent = editor.tool === 'measure' ? '退出测量' : '量距离';
    refs.clearMeasure.hidden = editor.measures.children.length === 0;
  }

  function syncDirty() {
    refs.dirty.hidden = !editor.dirty;
    refs.dirty.textContent = '本机有改动（只存在这个浏览器里）。导出 JSON 替换仓库里的 data/home.json，别人打开才看得到。';
  }

  app.addEventListener('state', sync);
  app.addEventListener('mode', syncMode);
  editor.addEventListener('select', renderInspector);
  editor.addEventListener('change', () => { renderInspector(); });
  editor.addEventListener('dirty', syncDirty);
  editor.addEventListener('tool', syncMode);
  editor.addEventListener('measure', syncMode);

  root.append(panel, reopen, bar, inspector, modal, toastEl);

  // 地址栏里带了状态就按它来
  const before = { option: app.state.option, beam: app.state.masterBeam, spots: JSON.stringify([spotCfg.y, spotCfg.beam]) };
  const view = ro ? opts.initView : readHash();
  if (app.state.option !== before.option || app.livingHasSpots() !== app.livingInfo.hasSpots
    || JSON.stringify([spotCfg.y, spotCfg.beam]) !== before.spots) app.rebuildLiving();
  if (app.state.masterBeam !== before.beam) app.rebuildMaster();
  app.applyLights();
  app.annotations.sync();
  if (view && data.cameras.some((c) => c.id === view)) app.gotoView(view, false);
  updateInsets();
  sync();
  syncMode();
  syncDirty();
  return { toast, openDrawings };
}
