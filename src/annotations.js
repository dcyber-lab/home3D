// 标注：房间名、尺寸线、门的开启弧线。
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { V, disposeGroup, fmt } from './geo.js';

export class Annotations {
  constructor(app) {
    this.app = app;
    this.root = new THREE.Group();
    this.root.name = 'annotations';
    this.labels = new THREE.Group();
    this.dims = new THREE.Group();
    this.plan = new THREE.Group();
    this.root.add(this.labels, this.dims, this.plan);
    app.scene.add(this.root);
    // 标注线不参与曝光和色调映射，不然晚上的场景里会变成黑的
    this.lineMat = new THREE.LineBasicMaterial({ color: '#ffb347', depthTest: false, transparent: true, toneMapped: false });
    this.arcMat = new THREE.LineBasicMaterial({ color: '#8d94a0', toneMapped: false });
  }

  label(text, cls, pos, sub) {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    if (sub) {
      const s = document.createElement('span');
      s.textContent = sub;
      el.appendChild(s);
    }
    const o = new CSS2DObject(el);
    o.position.copy(pos);
    return o;
  }

  /** 一条尺寸线：a、b 是文档坐标 [x, y, z] */
  dim(a, b, text) {
    const pa = V(...a), pb = V(...b);
    const dir = pb.clone().sub(pa).normalize();
    // 端头的小横线：取一个跟尺寸线垂直的方向
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(0.04);
    const pts = [pa, pb, pa.clone().add(side), pa.clone().sub(side), pb.clone().add(side), pb.clone().sub(side)];
    const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), this.lineMat);
    line.renderOrder = 10;
    this.dims.add(line);
    this.dims.add(this.label(text, 'dim-label', pa.clone().add(pb).multiplyScalar(0.5)));
  }

  rebuild() {
    const { app } = this;
    const { data } = app;
    disposeGroup(this.labels);
    disposeGroup(this.dims);
    disposeGroup(this.plan);

    // 房间名
    for (const r of data.rooms) {
      const pos = V((r.x[0] + r.x[1]) / 2, (r.y[0] + r.y[1]) / 2, 0.3);
      this.labels.add(this.label(r.name, 'room-label', pos, r.size));
    }

    // 门的开启弧线
    for (const d of app.shell.doorArcs) {
      const r = Math.hypot(d.closed[0] - d.hinge[0], d.closed[1] - d.hinge[1]);
      const a0 = Math.atan2(d.closed[1] - d.hinge[1], d.closed[0] - d.hinge[0]);
      const a1 = Math.atan2(d.open[1] - d.hinge[1], d.open[0] - d.hinge[0]);
      let da = a1 - a0;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      const pts = [V(d.hinge[0], d.hinge[1], 0.012), V(d.open[0], d.open[1], 0.012)];
      for (let i = 20; i >= 0; i--) {
        const a = a0 + (da * i) / 20;
        pts.push(V(d.hinge[0] + r * Math.cos(a), d.hinge[1] + r * Math.sin(a), 0.012));
      }
      this.plan.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.arcMat));
    }

    // 尺寸线
    const Lc = data.ceiling.living;
    const opt = Lc.options[app.state.option];
    const W = Lc.x[1], LEN = Lc.y[1];
    const H = data.heights.ceiling;
    const c = Lc.common;
    this.dim([0, 0.62, 0.03], [W, 0.62, 0.03], `客厅宽 ${fmt(W, 3)}`);
    this.dim([W - 0.04, 0, 0.03], [W - 0.04, LEN, 0.03], `客厅段 ${fmt(LEN)}（待确认）`);
    this.dim([-0.32, 0, 0.03], [-0.32, data.ceiling.oldBox.y[1], 0.03], `沙发墙 ${fmt(data.ceiling.oldBox.y[1])}`);
    this.dim([W - 0.02, 1.69, 0], [W - 0.02, 1.69, H], `原天花 ${fmt(H)}（假设）`);
    this.dim([0.02, LEN - 0.03, 0], [0.02, LEN - 0.03, data.ceiling.oldBox.z[0]], `旧边吊底 ${fmt(data.ceiling.oldBox.z[0])}`);
    this.dim([1.7, LEN - 0.31, 0], [1.7, LEN - 0.31, opt.under], `边吊底 ${fmt(opt.under)}`);
    this.dim([1.2, 0, opt.under - 0.004], [1.2, c.endBand, opt.under - 0.004], `${fmt(c.endBand)}`);
    this.dim([1.2, LEN - c.endBand, opt.under - 0.004], [1.2, LEN, opt.under - 0.004], `${fmt(c.endBand)}`);
    if (opt.kind === 'wash') {
      const b = opt.baffle;
      this.dim([b.x[1] + 0.01, 3.6, b.z[0]], [b.x[1] + 0.01, 3.6, H], `挡板 ${fmt(H - b.z[0])}`);
      this.dim([0, 3.6, b.z[0] - 0.02], [b.x[1], 3.6, b.z[0] - 0.02], `${fmt(b.x[1], 3)}`);
    } else {
      const wS = opt.sofaWidth;
      const zU = opt.lower ? opt.lower.z[0] : opt.block ? opt.block.z[0] : opt.under;
      this.dim([0, 3.6, zU - 0.004], [wS, 3.6, zU - 0.004], `宽 ${fmt(wS)}`);
    }
    if (app.livingHasSpots()) {
      const sx = c.spots.fromWall;
      const ys = c.spots.y;
      const z = opt.spotZ - 0.004;
      this.dim([0, ys[0], z], [sx, ys[0], z], `离墙 ${fmt(sx)}`);
      this.dim([sx, 0, z], [sx, ys[0], z], fmt(ys[0]));
      for (let i = 0; i < ys.length - 1; i++) this.dim([sx, ys[i], z], [sx, ys[i + 1], z], fmt(ys[i + 1] - ys[i]));
      this.dim([sx, ys[ys.length - 1], z], [sx, LEN, z], fmt(LEN - ys[ys.length - 1]));
      if (opt.tip) this.dim([0.004, (ys[2] + ys[3]) / 2, 0], [0.004, (ys[2] + ys[3]) / 2, opt.tip], `光斑尖离地 ${fmt(opt.tip)}`);
    }

    const m = data.ceiling.master;
    const hx = m.headWallX, wy = m.windowWallY;
    this.dim([hx - m.size.u, wy + m.size.v - 0.25, 0.03], [hx, wy + m.size.v - 0.25, 0.03], `主卧宽 ${fmt(m.size.u)}`);
    this.dim([hx - 0.03, wy, 0.03], [hx - 0.03, wy + m.size.v, 0.03], `床头墙 ${fmt(m.size.v)}`);
    this.dim([hx - m.headBand, wy + 2.7, m.under - 0.004], [hx, wy + 2.7, m.under - 0.004], fmt(m.headBand));
    this.dim([hx - 1.6, wy, m.under - 0.004], [hx - 1.6, wy + m.windowBand, m.under - 0.004], fmt(m.windowBand));
    let prev = 0;
    for (const s of m.spots) {
      this.dim([hx - s.u, wy + prev, m.under - 0.004], [hx - s.u, wy + s.v, m.under - 0.004], `${s.id} ${fmt(s.v - prev)}`);
      prev = s.v;
    }
    this.dim([hx - 0.02, wy + m.size.v - 0.02, 0], [hx - 0.02, wy + m.size.v - 0.02, m.under], `边吊底 ${fmt(m.under)}`);

    this.sync();
  }

  sync() {
    const { app } = this;
    this.labels.visible = app.state.show.labels && app.outside;
    this.plan.visible = app.outside;
    this.dims.visible = app.state.show.dims;
    app.invalidate();
  }
}
