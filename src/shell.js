// 房子的外壳：结构板、地面、墙（带门窗洞）、门、窗、阳台栏杆、窗帘、楼板。
import * as THREE from 'three';
import { box, prism, slab, lbox } from './geo.js';

const UV_SCALE = { floor_wood: 2.0, floor_marble: 1.2, floor_tile: 0.6, floor_tile_dark: 0.6, floor_balcony: 0.3 };

export function buildShell(data, M) {
  const root = new THREE.Group();
  root.name = 'shell';
  const H = data.heights.ceiling;

  // ---- 结构板 + 地面 ----
  const floors = new THREE.Group();
  floors.name = 'floors';
  for (const poly of data.base.polys) {
    floors.add(prism(poly, -0.16, -0.02, M.get('base'), { cast: false }));
  }
  for (const f of data.floors) {
    const pts = f.poly || rectPts(f.rect);
    const m = prism(pts, -0.02, 0, M.get(f.mat), { cast: false, uvScale: UV_SCALE[f.mat] || 1 });
    m.name = f.id;
    m.userData.floor = true;
    floors.add(m);
  }
  root.add(floors);

  // ---- 墙 ----
  const walls = new THREE.Group();
  walls.name = 'walls';
  const doorArcs = [];
  for (const w of data.walls) walls.add(buildWall(w, H, M, doorArcs));
  root.add(walls);

  // ---- 阳台栏杆 ----
  const balcony = new THREE.Group();
  balcony.name = 'balcony';
  const rail = data.balcony.rail;
  for (let i = 0; i < rail.length - 1; i++) {
    const a = rail[i], b = rail[i + 1];
    balcony.add(slab(a, b, 0.10, 0, data.balcony.parapet, M.get('wall')));
    balcony.add(slab(a, b, 0.012, data.balcony.parapet, data.balcony.railHeight - 0.03, M.get('glass'), { cast: false }));
    balcony.add(slab(a, b, 0.05, data.balcony.railHeight - 0.03, data.balcony.railHeight, M.get('frame_alu')));
  }
  balcony.userData.out = new THREE.Vector3(0, 0, -1);
  balcony.userData.outAt = new THREE.Vector3(1.4, 1, -1.5);
  root.add(balcony);

  // ---- 楼板（原天花）。相机在楼板上面时自动隐藏 ----
  const slabs = new THREE.Group();
  slabs.name = 'slabs';
  for (const r of data.ceiling.slabs) {
    slabs.add(box(r[0], r[2], r[1], r[3], H, H + data.heights.slabThickness, M.get('ceiling')));
  }
  root.add(slabs);

  return { root, floors, walls, slabs, balcony, doorArcs };
}

function rectPts(r) {
  return [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];
}

const OUT = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 0, 1], '-y': [0, 0, -1] };

function buildWall(w, H, M, doorArcs) {
  const g = new THREE.Group();
  g.name = w.id;
  g.userData.wall = w;
  const [x0, x1] = w.x, [y0, y1] = w.y;
  const z0 = 0, z1 = w.z ? w.z[1] : H;
  const axis = w.axis || (x1 - x0 >= y1 - y0 ? 'x' : 'y');
  const mats = [M.get('wall'), M.get('wall'), M.get('wall_cap'), M.get('wall'), M.get('wall'), M.get('wall')];
  const seg = (s0, s1, a, b) => {
    if (s1 - s0 < 1e-4 || b - a < 1e-4) return;
    g.add(axis === 'x' ? box(s0, s1, y0, y1, a, b, mats) : box(x0, x1, s0, s1, a, b, mats));
  };
  const ops = (w.openings || []).slice().sort((p, q) => p.at[0] - q.at[0]);
  let cur = axis === 'x' ? x0 : y0;
  const end = axis === 'x' ? x1 : y1;
  for (const o of ops) {
    seg(cur, o.at[0], z0, z1);
    seg(o.at[0], o.at[1], z0, o.z[0]);
    seg(o.at[0], o.at[1], o.z[1], z1);
    g.add(buildFill(w, axis, o, M));
    if (o.fill === 'door') doorArcs.push(doorArc(w, axis, o));
    cur = o.at[1];
  }
  seg(cur, end, z0, z1);
  if (w.out) {
    g.userData.out = new THREE.Vector3(...OUT[w.out]);
    g.userData.outAt = new THREE.Vector3((x0 + x1) / 2, 1, (y0 + y1) / 2);
  }
  return g;
}

/** 门开启的弧线（平面视图里画） */
function doorArc(w, axis, o) {
  const hingeA = o.hinge === 'end' ? o.at[1] : o.at[0];
  const latchA = o.hinge === 'end' ? o.at[0] : o.at[1];
  const width = o.at[1] - o.at[0];
  const sign = o.swing === '+' ? 1 : -1;
  if (axis === 'x') {
    const face = sign > 0 ? w.y[1] : w.y[0];
    return { hinge: [hingeA, face], closed: [latchA, face], open: [hingeA, face + sign * width] };
  }
  const face = sign > 0 ? w.x[1] : w.x[0];
  return { hinge: [face, hingeA], closed: [face, latchA], open: [face + sign * width, hingeA] };
}

/** 门窗洞里的填充物。本地坐标：X 沿墙，Z 垂直于墙，Y 向上，原点在洞口底边中心。 */
function buildFill(w, axis, o, M) {
  const g = new THREE.Group();
  const width = o.at[1] - o.at[0];
  const height = o.z[1] - o.z[0];
  const mid = (o.at[0] + o.at[1]) / 2;
  const thick = axis === 'x' ? w.y[1] - w.y[0] : w.x[1] - w.x[0];
  if (axis === 'x') {
    g.position.set(mid, o.z[0], (w.y[0] + w.y[1]) / 2);
  } else {
    g.position.set((w.x[0] + w.x[1]) / 2, o.z[0], mid);
    g.rotation.y = -Math.PI / 2;
  }
  switch (o.fill) {
    case 'door': fillDoor(g, width, height, thick, o, M); break;
    case 'slider': fillSlider(g, width, height, thick, M); break;
    case 'window': fillWindow(g, width, height, thick, o, M); break;
    default: break;
  }
  return g;
}

function fillDoor(g, w, h, t, o, M) {
  const style = o.style || 'walnut';
  const frameMat = { walnut: 'door_walnut', entry: 'door_entry', white: 'door_white', glass_black: 'frame_black' }[style];
  const fm = M.get(frameMat);
  const fw = 0.045;                       // 门套看面
  const depth = t + 0.02;
  g.add(lbox(fw, h, depth, fm, -w / 2 + fw / 2, 0, 0));
  g.add(lbox(fw, h, depth, fm, w / 2 - fw / 2, 0, 0));
  g.add(lbox(w, fw, depth, fm, 0, h - fw, 0));
  const lw = w - fw * 2, lh = h - fw - 0.008;
  const latch = (o.hinge === 'end' ? -1 : 1) * (lw / 2 - 0.07);
  if (style === 'glass_black') {
    const st = 0.05;
    g.add(lbox(st, lh, 0.04, fm, -lw / 2 + st / 2, 0.008, 0));
    g.add(lbox(st, lh, 0.04, fm, lw / 2 - st / 2, 0.008, 0));
    g.add(lbox(lw, st, 0.04, fm, 0, 0.008, 0));
    g.add(lbox(lw, st, 0.04, fm, 0, 0.008 + lh - st, 0));
    g.add(lbox(lw, 0.03, 0.04, fm, 0, 0.008 + lh * 0.72, 0));
    g.add(lbox(0.03, lh, 0.04, fm, 0, 0.008, 0));
    const glass = lbox(lw - st * 2, lh - st * 2, 0.012, M.get('glass_fluted'), 0, 0.008 + st, 0);
    glass.castShadow = false;
    g.add(glass);
  } else {
    const leafMat = M.get({ walnut: 'door_walnut', entry: 'door_entry', white: 'door_white' }[style]);
    g.add(lbox(lw, lh, 0.042, leafMat, 0, 0.008, 0));
  }
  // 把手（两面都有）
  for (const s of [-1, 1]) {
    g.add(lbox(0.13, 0.02, 0.022, M.get('metal'), latch - Math.sign(latch) * 0.04, 1.0, s * 0.045));
    g.add(lbox(0.02, 0.02, 0.05, M.get('metal'), latch, 1.0, s * 0.03));
  }
  if (style === 'entry') {
    g.add(lbox(0.07, 0.28, 0.03, M.get('frame_black'), latch, 0.95, -0.035));
    g.add(lbox(0.07, 0.28, 0.03, M.get('frame_black'), latch, 0.95, 0.035));
  }
}

function fillSlider(g, w, h, t, M) {
  const fm = M.get('frame_alu');
  const fw = 0.05;
  g.add(lbox(fw, h, t, fm, -w / 2 + fw / 2, 0, 0));
  g.add(lbox(fw, h, t, fm, w / 2 - fw / 2, 0, 0));
  g.add(lbox(w, fw, t, fm, 0, h - fw, 0));
  g.add(lbox(w, 0.02, t, fm, 0, 0, 0));
  const n = 3;
  const pw = (w - fw * 2) / n;
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + fw + pw * (i + 0.5);
    const zz = (i % 2 === 0 ? -1 : 1) * 0.02;
    g.add(lbox(0.035, h - fw - 0.02, 0.03, fm, cx - pw / 2 + 0.0175, 0.02, zz));
    g.add(lbox(0.035, h - fw - 0.02, 0.03, fm, cx + pw / 2 - 0.0175, 0.02, zz));
    const glass = lbox(pw - 0.07, h - fw - 0.02, 0.01, M.get('glass'), cx, 0.02, zz);
    glass.castShadow = false;
    g.add(glass);
  }
}

function fillWindow(g, w, h, t, o, M) {
  const fm = M.get('frame_alu');
  const fw = 0.045;
  const d = Math.min(t, 0.08);
  g.add(lbox(fw, h, d, fm, -w / 2 + fw / 2, 0, 0));
  g.add(lbox(fw, h, d, fm, w / 2 - fw / 2, 0, 0));
  g.add(lbox(w, fw, d, fm, 0, h - fw, 0));
  g.add(lbox(w, fw, d, fm, 0, 0, 0));
  const n = Math.max(1, Math.round(w / 0.75));
  for (let i = 1; i < n; i++) g.add(lbox(0.035, h, d * 0.8, fm, -w / 2 + (w * i) / n, 0, 0));
  const glass = lbox(w - fw * 2, h - fw * 2, 0.01, M.get(o.frosted ? 'glass_frosted' : 'glass'), 0, fw, 0);
  glass.castShadow = false;
  g.add(glass);
}

/* ---------- 窗帘 ---------- */

export function buildCurtains(data, M, tops = {}) {
  const g = new THREE.Group();
  g.name = 'curtains';
  for (const c of data.curtains) {
    const top = typeof c.top === 'number' ? c.top : (tops[c.top] ?? data.heights.ceiling);
    const sheer = c.style === 'sheer';
    const mesh = curtainMesh(c.from, c.to, 0.015, top - 0.005, {
      amp: sheer ? 0.028 : 0.04,
      wave: sheer ? 0.11 : 0.15,
      mat: M.get(sheer ? 'curtain_sheer' : 'curtain_blackout'),
    });
    mesh.name = c.id;
    mesh.castShadow = !sheer;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

function curtainMesh(from, to, z0, z1, { amp, wave, mat }) {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;       // 沿帘子
  const nx = -uy, ny = ux;                  // 垂直于帘子
  const n = Math.max(8, Math.round(len / 0.012));
  const pos = new Float32Array((n + 1) * 2 * 3);
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * len;
    const off = amp * Math.sin((s / wave) * Math.PI * 2) + amp * 0.25 * Math.sin((s / wave) * Math.PI * 2 * 2.7 + 1.3);
    const x = from[0] + ux * s + nx * off;
    const y = from[1] + uy * s + ny * off;
    pos.set([x, z0, y], i * 6);
    pos.set([x, z1, y], i * 6 + 3);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
