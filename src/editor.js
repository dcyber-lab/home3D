// 组件编辑：点选家具 → 换款式 / 面料 / 尺寸 / 位置 / 朝向，拖动挪位置，添加、复制、删除。
// 改动自动存在本机浏览器里；“导出 JSON”得到完整的 home.json，替换仓库里的 data/home.json 就对所有人生效。
import * as THREE from 'three';
import { COMPONENTS, newItem } from './furniture.js';
import { FACES, round2, toPlan } from './geo.js';

const STORE_KEY = 'home3d.data.v1';

/** 启动时：如果本机存过改动，而且是基于同一版数据，就用本机的 */
export function loadEdits(base) {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && saved.meta && saved.meta.version === base.meta.version && Array.isArray(saved.furniture)) {
        // 自己导入的整份数据：原样用
        if (saved.meta.imported) {
          saved.meta.localEdits = true;
          return saved;
        }
        // 平时在页面上的改动：只把家具、材质和选好的方案盖到仓库数据上。
        // 墙体、吊顶这些尺寸永远用仓库里最新的，仓库更新了不会被本机的旧副本挡住。
        const d = JSON.parse(JSON.stringify(base));
        d.furniture = saved.furniture;
        if (saved.finishes) d.finishes = saved.finishes;
        const sl = saved.ceiling && saved.ceiling.living, dl = d.ceiling.living;
        if (sl) {
          if (dl.options[sl.default]) dl.default = sl.default;
          for (const [k, o] of Object.entries(dl.options)) {
            if (sl.options && sl.options[k] && sl.options[k].noSpots) o.noSpots = true;
            else delete o.noSpots;
          }
          const ss = sl.common && sl.common.spots;
          if (ss && Array.isArray(ss.y) && ss.y.length) dl.common.spots.y = ss.y;
          if (ss && Number.isFinite(ss.beam)) dl.common.spots.beam = ss.beam;
        }
        if (saved.ceiling && saved.ceiling.master && Number.isFinite(saved.ceiling.master.beam)) d.ceiling.master.beam = saved.ceiling.master.beam;
        if (saved.lights && d.scenes[saved.lights.defaultScene]) d.lights.defaultScene = saved.lights.defaultScene;
        d.meta.localEdits = true;
        return d;
      }
    }
  } catch (e) {
    console.warn('读取本机改动失败', e);
  }
  return JSON.parse(JSON.stringify(base));
}

export class Editor extends EventTarget {
  constructor(app) {
    super();
    this.app = app;
    this.selected = null;           // 选中的家具数据
    this.tool = 'select';           // 'select' | 'measure'
    this.ray = new THREE.Raycaster();
    this.helper = null;
    this.drag = null;
    this.measurePts = [];
    this.measures = new THREE.Group();
    app.scene.add(this.measures);
    this.measureMat = new THREE.LineBasicMaterial({ color: '#59d0ff', depthTest: false, transparent: true, toneMapped: false });
    this._bind();
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  get dirty() { return !!this.app.data.meta.localEdits; }

  /* ---------------- 拾取 ---------------- */

  _ndc(e) {
    const r = this.app.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  _visible(o) {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  }

  _hits(e, roots) {
    this.ray.setFromCamera(this._ndc(e), this.app.camera);
    const clipZ = this.app.state.clipZ;
    return this.ray.intersectObjects(roots, true).filter((h) => h.object.isMesh && this._visible(h.object) && h.point.y <= clipZ + 1e-3);
  }

  pickItem(e) {
    const hits = this._hits(e, [this.app.groups.furniture]);
    for (const h of hits) {
      for (let p = h.object; p; p = p.parent) {
        if (p.userData && p.userData.item) return { item: p.userData.item, object: p, point: h.point };
      }
    }
    return null;
  }

  pickAny(e) {
    const g = this.app.groups;
    const hits = this._hits(e, [g.shell, g.furniture, g.living, g.master, g.fixedCeiling, g.foyerCeiling]);
    return hits.length ? hits[0] : null;
  }

  pickFloor(e) {
    const hits = this._hits(e, [this.app.shell.floors]);
    const any = this.pickAny(e);
    if (!hits.length) return null;
    // 被家具或墙挡住的地面不算
    if (any && any.distance < hits[0].distance - 0.02 && !any.object.userData.floor) return null;
    return hits[0].point;
  }

  /* ---------------- 事件 ---------------- */

  _bind() {
    const canvas = this.app.canvas;
    let down = null;
    // 捕获阶段先于相机控制拿到事件：按在已选中的家具上就开始拖动
    window.addEventListener('pointerdown', (e) => {
      if (e.target !== canvas || e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (this.tool === 'select' && this.selected && !this.readOnly) {
        const hit = this.pickItem(e);
        if (hit && hit.item === this.selected) this._startDrag(e, hit);
      }
    }, true);
    window.addEventListener('pointermove', (e) => { if (this.drag) this._moveDrag(e); });
    window.addEventListener('pointerup', (e) => {
      if (this.drag) { this._endDrag(); down = null; return; }
      if (!down || e.target !== canvas) { down = null; return; }
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 500;
      down = null;
      if (moved > 5 || !quick) return;
      if (this.tool === 'measure') { this._measureClick(e); return; }
      // 双击 / 双指轻点两下：走到地面上的那一点
      const now = performance.now();
      const last = this._lastTap;
      const dbl = last && now - last.t < 380 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30;
      this._lastTap = dbl ? null : { t: now, x: e.clientX, y: e.clientY };
      if (dbl && this._double(e)) return;
      const hit = this.pickItem(e);
      this.select(hit ? hit.item : null);
    });
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        if (this.tool === 'measure') this.setTool('select');
        else this.select(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected && !this.readOnly) { e.preventDefault(); this.remove(this.selected); }
    });
  }

  _double(e) {
    if (this.pickItem(e)) return false;
    const p = this.pickFloor(e);
    if (!p) return false;
    const c = this.app.controls;
    if (c.mode !== 'walk') {
      // 从外面双击地面：走进去，站在那一点上
      const dir = new THREE.Vector3();
      this.app.camera.getWorldDirection(dir);
      dir.y = 0;
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
      dir.normalize();
      const pos = new THREE.Vector3(p.x, 1.5, p.z);
      c.setMode('walk');
      c.hfov = 78;
      const from = this.app.camera.fov;
      c.updateFov();
      c.flyTo(pos, pos.clone().add(dir), 0.9, from, this.app.camera.fov);
      this.app.state.view = '';
      this.app.emit('state');
    } else {
      c.walkTo(p);
    }
    return true;
  }

  /* ---------------- 选中 ---------------- */

  select(item) {
    if (this.selected === item) return;
    this.selected = item;
    this._updateHelper();
    this.emit('select', item);
  }

  objectOf(item) {
    return this.app.groups.furniture.children.find((c) => c.userData.item === item);
  }

  _updateHelper() {
    if (this.helper) {
      this.app.scene.remove(this.helper);
      this.helper.geometry.dispose();
      this.helper = null;
    }
    const obj = this.selected && this.objectOf(this.selected);
    if (obj) {
      const it = this.selected;
      const z0 = it.z0 || 0;
      const b = new THREE.Box3(
        new THREE.Vector3(it.x[0] - 0.01, z0, it.y[0] - 0.01),
        new THREE.Vector3(it.x[1] + 0.01, z0 + it.h + 0.01, it.y[1] + 0.01),
      );
      this.helper = new THREE.Box3Helper(b, '#ff9f2e');
      this.helper.material.depthTest = false;
      this.helper.material.transparent = true;
      this.helper.material.toneMapped = false;
      this.helper.renderOrder = 20;
      this.app.scene.add(this.helper);
    }
    this.app.invalidate();
  }

  /* ---------------- 拖动 ---------------- */

  _startDrag(e, hit) {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y);
    this.drag = { plane, start: hit.point.clone(), obj: hit.object, origin: hit.object.position.clone(), item: hit.item };
    this.app.controls.setBlocked(true);
    this.app.canvas.style.cursor = 'grabbing';
  }

  _moveDrag(e) {
    const d = this.drag;
    this.ray.setFromCamera(this._ndc(e), this.app.camera);
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(d.plane, p)) return;
    const dx = round2(p.x - d.start.x), dz = round2(p.z - d.start.z);
    d.obj.position.set(d.origin.x + dx, d.origin.y, d.origin.z + dz);
    d.dx = dx; d.dz = dz;
    if (this.helper) {
      const it = d.item, z0 = it.z0 || 0;
      this.helper.box.set(
        new THREE.Vector3(it.x[0] + dx - 0.01, z0, it.y[0] + dz - 0.01),
        new THREE.Vector3(it.x[1] + dx + 0.01, z0 + it.h + 0.01, it.y[1] + dz + 0.01),
      );
    }
    this.app.invalidate(true);
  }

  _endDrag() {
    const d = this.drag;
    this.drag = null;
    this.app.controls.setBlocked(false);
    this.app.canvas.style.cursor = '';
    if (d.dx || d.dz) {
      const it = d.item;
      it.x = [round2(it.x[0] + (d.dx || 0)), round2(it.x[1] + (d.dx || 0))];
      it.y = [round2(it.y[0] + (d.dz || 0)), round2(it.y[1] + (d.dz || 0))];
      this.commit(it, false);
    }
  }

  /* ---------------- 修改 ---------------- */

  /** 数据改完之后调用：重建这件家具、存本机、刷新面板 */
  commit(item, rebuild = true) {
    if (rebuild) this.app.rebuildItem(item);
    this.save();
    this._updateHelper();
    this.emit('change', item);
    this.app.invalidate(true);
  }

  patch(item, changes) {
    Object.assign(item, changes);
    this.commit(item);
  }

  /** 改尺寸 / 位置。宽 = 垂直于朝向的方向，深 = 沿朝向的方向 */
  setBox(item, { cx, cy, w, d }) {
    const alongX = item.face === '+x' || item.face === '-x';
    const curW = alongX ? item.y[1] - item.y[0] : item.x[1] - item.x[0];
    const curD = alongX ? item.x[1] - item.x[0] : item.y[1] - item.y[0];
    const W = Math.max(0.02, w ?? curW), D = Math.max(0.005, d ?? curD);
    const X = cx ?? (item.x[0] + item.x[1]) / 2, Y = cy ?? (item.y[0] + item.y[1]) / 2;
    const sx = alongX ? D : W, sy = alongX ? W : D;
    item.x = [round2(X - sx / 2), round2(X + sx / 2)];
    item.y = [round2(Y - sy / 2), round2(Y + sy / 2)];
    this.commit(item);
  }

  rotate(item) {
    const i = FACES.indexOf(item.face);
    const cx = (item.x[0] + item.x[1]) / 2, cy = (item.y[0] + item.y[1]) / 2;
    const sx = item.x[1] - item.x[0], sy = item.y[1] - item.y[0];
    item.face = FACES[(i + 1) % 4];
    item.x = [round2(cx - sy / 2), round2(cx + sy / 2)];
    item.y = [round2(cy - sx / 2), round2(cy + sx / 2)];
    this.commit(item);
  }

  /** 换成另一种组件，占地范围不变 */
  swapType(item, type) {
    const def = COMPONENTS[type];
    if (!def) return;
    item.type = type;
    if (!def.finishes.includes(item.finish)) item.finish = def.finishes[0];
    if (def.z0 && !item.z0) item.z0 = def.z0;
    this.commit(item);
  }

  _newId(type) {
    const ids = new Set(this.app.data.furniture.map((f) => f.id));
    let n = 1;
    while (ids.has(`${type}_${n}`)) n++;
    return `${type}_${n}`;
  }

  /** 在相机正在看的地面位置加一件 */
  add(type) {
    const app = this.app;
    const dir = new THREE.Vector3();
    app.camera.getWorldDirection(dir);
    let target;
    if (app.controls.mode === 'orbit') target = app.controls.orbit.target.clone();
    else target = app.camera.position.clone().addScaledVector(new THREE.Vector3(dir.x, 0, dir.z).normalize(), 1.6);
    const item = newItem(type, round2(target.x), round2(target.z), this._newId(type));
    app.data.furniture.push(item);
    this.commit(item);
    this.select(item);
    return item;
  }

  duplicate(item) {
    const copy = JSON.parse(JSON.stringify(item));
    copy.id = this._newId(item.type);
    copy.x = [round2(item.x[0] + 0.3), round2(item.x[1] + 0.3)];
    copy.y = [round2(item.y[0] + 0.3), round2(item.y[1] + 0.3)];
    this.app.data.furniture.push(copy);
    this.commit(copy);
    this.select(copy);
  }

  remove(item) {
    const app = this.app;
    const i = app.data.furniture.indexOf(item);
    if (i < 0) return;
    app.data.furniture.splice(i, 1);
    const obj = this.objectOf(item);
    if (obj) {
      app.groups.furniture.remove(obj);
      obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    const lights = [];
    for (const c of app.groups.furniture.children) if (c.userData.lights) lights.push(...c.userData.lights);
    app.lighting.setLights('furniture', lights);
    this.select(null);
    this.save();
    this.emit('change', null);
    app.invalidate(true);
  }

  /* ---------------- 存取 ---------------- */

  snapshotData() {
    const app = this.app;
    const d = JSON.parse(JSON.stringify(app.data));
    delete d.meta.localEdits;
    d.finishes = { floor: app.M.floorFinish, wall: app.M.wallFinish };
    d.ceiling.living.default = app.state.option;
    for (const [k, o] of Object.entries(d.ceiling.living.options)) {
      if (app.state.spotsOff[k]) o.noSpots = true;
      else delete o.noSpots;
    }
    d.ceiling.master.beam = app.state.masterBeam;
    d.lights.defaultScene = app.state.scene;
    return d;
  }

  save() {
    if (this.readOnly) return;       // 只读页面什么都不存
    this.app.data.meta.localEdits = true;
    try {
      const d = this.snapshotData();
      localStorage.setItem(STORE_KEY, JSON.stringify(d));
    } catch (e) {
      console.warn('存不进本机', e);
    }
    this.emit('dirty');
  }

  exportJSON() {
    const text = JSON.stringify(this.snapshotData(), null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = 'home.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async importJSON(file) {
    const d = JSON.parse(await file.text());
    if (!d || !Array.isArray(d.walls) || !Array.isArray(d.furniture) || !d.ceiling) throw new Error('这不是全屋模型的 home.json');
    d.meta = d.meta || {};
    d.meta.version = this.app.baseData.meta.version;
    d.meta.imported = true;          // 整份导入的数据原样用，不跟仓库数据合并
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
    location.reload();
  }

  reset() {
    localStorage.removeItem(STORE_KEY);
    location.reload();
  }

  /* ---------------- 测量 ---------------- */

  setTool(tool) {
    this.tool = tool;
    this.measurePts = [];
    this.app.canvas.style.cursor = tool === 'measure' ? 'crosshair' : '';
    if (tool === 'measure') this.select(null);
    this.emit('tool', tool);
  }

  _measureClick(e) {
    const hit = this.pickAny(e);
    if (!hit) return;
    this.measurePts.push(hit.point.clone());
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), new THREE.MeshBasicMaterial({ color: '#59d0ff', depthTest: false, transparent: true, toneMapped: false }));
    dot.position.copy(hit.point);
    dot.renderOrder = 30;
    dot.userData.ownMaterial = true;
    this.measures.add(dot);
    if (this.measurePts.length === 2) {
      const [a, b] = this.measurePts;
      this.measurePts = [];
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), this.measureMat);
      line.renderOrder = 30;
      this.measures.add(line);
      const pa = toPlan(a), pb = toPlan(b);
      const text = `${a.distanceTo(b).toFixed(3)} m`;
      const sub = `Δx ${Math.abs(pb[0] - pa[0]).toFixed(2)} · Δy ${Math.abs(pb[1] - pa[1]).toFixed(2)} · Δz ${Math.abs(pb[2] - pa[2]).toFixed(2)}`;
      this.measures.add(this.app.annotations.label(text, 'measure-label', a.clone().add(b).multiplyScalar(0.5), sub));
    }
    this.app.invalidate();
    this.emit('measure');
  }

  clearMeasures() {
    this.measurePts = [];
    for (const c of [...this.measures.children]) {
      this.measures.remove(c);
      if (c.geometry) c.geometry.dispose();
    }
    this.app.invalidate();
    this.emit('measure');
  }
}
