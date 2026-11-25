// 几何小工具。
// 文档坐标：x 向右、y 向下（阳台→入户门）、z 向上。
// three.js 坐标：three.x = x，three.y = z，three.z = y。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** 文档坐标 (x, y, z) → three.js 向量 */
export const V = (x, y, z = 0) => new THREE.Vector3(x, z, y);

/** three.js 向量 → 文档坐标 [x, y, z] */
export const toPlan = (v) => [v.x, v.z, v.y];

function shadowed(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

/** 轴对齐的盒子，直接用文档坐标的范围 */
export function box(x0, x1, y0, y1, z0, z1, mat, opts = {}) {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0), Math.abs(y1 - y0));
  const m = new THREE.Mesh(g, mat);
  m.position.set((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2);
  return shadowed(m, opts.cast !== false, opts.receive !== false);
}

/** 平面多边形（文档坐标 [[x,y],...]）沿 z 拉伸成棱柱 */
export function prism(points, z0, z1, mat, opts = {}) {
  const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: 4 });
  // 拉伸方向本来是 +Z：绕 X 转 90° 后变成 −Y，再抬到 z1
  g.rotateX(Math.PI / 2);
  g.translate(0, z1, 0);
  if (opts.uvScale) planarUV(g, opts.uvScale, opts.uvRotate);
  const m = new THREE.Mesh(g, mat);
  return shadowed(m, opts.cast !== false, opts.receive !== false);
}

/** 按世界坐标铺 UV（地板、地砖用），scale = 一张贴图对应多少米 */
export function planarUV(geometry, scale, rotate = false) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / scale;
    const v = pos.getZ(i) / scale;
    if (rotate) uv.setXY(i, v, u);
    else uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

/** 两点之间的直墙段（可以是斜的），用于阳台栏杆 */
export function slab(p0, p1, thickness, z0, z1, mat, opts = {}) {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const len = Math.hypot(dx, dy);
  const g = new THREE.BoxGeometry(len, z1 - z0, thickness);
  const m = new THREE.Mesh(g, mat);
  m.position.set((p0[0] + p1[0]) / 2, (z0 + z1) / 2, (p0[1] + p1[1]) / 2);
  m.rotation.y = -Math.atan2(dy, dx);
  return shadowed(m, opts.cast !== false, opts.receive !== false);
}

/* ---------- 家具用的本地坐标小工具（原点在落地中心，+Z 是正面，Y 向上） ---------- */

/** 盒子：底面中心在 (x, y, z) */
export function lbox(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  return shadowed(m);
}

/** 圆角盒子：底面中心在 (x, y, z) */
export function rbox(w, h, d, mat, x = 0, y = 0, z = 0, r = 0.03) {
  const rad = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.max(rad, 0.002)), mat);
  m.position.set(x, y + h / 2, z);
  return shadowed(m);
}

/** 竖直圆柱：底面中心在 (x, y, z) */
export function lcyl(r, h, mat, x = 0, y = 0, z = 0, seg = 24, rTop = r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, seg), mat);
  m.position.set(x, y + h / 2, z);
  return shadowed(m);
}

/** 释放一个组里所有网格的几何体（材质是共享的，不在这里释放） */
export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose();
    if (o.userData && o.userData.ownMaterial && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
  });
  group.clear();
}

/** 朝向字符串 → 绕竖轴的转角（本地 +Z 转到这个方向） */
export function faceAngle(face) {
  switch (face) {
    case '+x': return Math.PI / 2;
    case '-x': return -Math.PI / 2;
    case '-y': return Math.PI;
    default: return 0; // '+y'
  }
}

export const FACES = ['+y', '-x', '-y', '+x']; // 顺时针转一圈

export const round2 = (n) => Math.round(n * 100) / 100;
export const round3 = (n) => Math.round(n * 1000) / 1000;
export const fmt = (n, d = 2) => Number(n).toFixed(d);
