// 家具 / 设备组件库。每个组件都是一个函数：给宽、深、高和面料，返回一组网格。
// 本地坐标：原点在落地中心，+Z 是正面（朝房间的那面），X 是宽，Y 向上。
// 想加新组件：在 COMPONENTS 里加一项，写一个 build 就行；data/home.json 里 type 写它的名字。
import * as THREE from 'three';
import { lbox, rbox, lcyl, faceAngle } from './geo.js';
import { FINISHES } from './materials.js';

const WOODS = ['walnut', 'oak_light', 'wood_dark', 'white', 'black'];
const FABRICS = ['leather_black', 'leather_tan', 'fabric_grey', 'fabric_beige', 'fabric_dark', 'fabric_green', 'fabric_brown'];
const isWood = (f) => !!(FINISHES[f] && FINISHES[f].wood);

function group(...children) {
  const g = new THREE.Group();
  for (const c of children.flat()) if (c) g.add(c);
  return g;
}

/** 柜门之间的缝：一条很细的深色线 */
function reveal(M, len, vertical, x, y, z) {
  return vertical
    ? lbox(0.004, len, 0.003, M.get('frame_black'), x, y, z)
    : lbox(len, 0.004, 0.003, M.get('frame_black'), x, y, z);
}

function doorLines(g, M, w, y0, y1, zFront, n) {
  for (let i = 1; i < n; i++) g.add(reveal(M, y1 - y0, true, -w / 2 + (w * i) / n, y0, zFront));
}

function rugTexture(w, d, dots) {
  const ppm = 260;
  const c = document.createElement('canvas');
  c.width = Math.max(64, Math.round(w * ppm));
  c.height = Math.max(64, Math.round(d * ppm));
  const g = c.getContext('2d');
  g.fillStyle = dots ? '#efe9dc' : '#c2bbae';
  g.fillRect(0, 0, c.width, c.height);
  if (dots) {
    const b = 0.045 * ppm;
    g.strokeStyle = '#b9966b';
    g.lineWidth = b;
    g.strokeRect(b / 2, b / 2, c.width - b, c.height - b);
    g.fillStyle = '#1b1b1b';
    const step = 0.115 * ppm;
    const nx = Math.floor((c.width - b * 4) / step), ny = Math.floor((c.height - b * 4) / step);
    const ox = (c.width - nx * step) / 2, oy = (c.height - ny * step) / 2;
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= ny; j++) {
        g.beginPath();
        g.arc(ox + i * step, oy + j * step, 0.013 * ppm, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export const COMPONENTS = {
  sofa: {
    label: '沙发', cat: '坐具', finishes: FABRICS, size: [2.4, 0.95, 0.86],
    build({ w, d, h, finish, opts }, M) {
      const m = M.finish(finish);
      const sh = opts.seatH ?? 0.44;
      const arm = Math.min(0.16, w * 0.12);
      const backT = 0.22;
      const g = group();
      g.add(rbox(w, 0.24, d, m, 0, 0.07, 0, 0.04));
      g.add(rbox(w, h - 0.07, 0.16, m, 0, 0.07, -d / 2 + 0.08, 0.05));
      for (const s of [-1, 1]) g.add(rbox(arm, sh + 0.13 - 0.07, d, m, s * (w / 2 - arm / 2), 0.07, 0, 0.05));
      const inner = w - arm * 2;
      const n = Math.max(1, Math.round(inner / 0.75));
      const cw = inner / n;
      for (let i = 0; i < n; i++) {
        const x = -inner / 2 + cw * (i + 0.5);
        g.add(rbox(cw - 0.012, 0.15, d - backT - 0.02, m, x, sh - 0.15, backT / 2, 0.05));
        const back = rbox(cw - 0.012, h - sh - 0.04, 0.17, m, x, sh - 0.02, -d / 2 + 0.16 + 0.085, 0.06);
        back.rotation.x = -0.12;
        g.add(back);
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        g.add(lbox(0.04, 0.07, 0.04, M.get('frame_black'), sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08)));
      }
      return g;
    },
  },

  armchair: {
    label: '单人椅', cat: '坐具', finishes: FABRICS, size: [0.85, 0.85, 0.8],
    build(p, M) { return COMPONENTS.sofa.build(p, M); },
  },

  chair: {
    label: '椅子', cat: '坐具', finishes: ['oak_light', 'walnut', 'fabric_grey', 'fabric_beige', 'fabric_dark', 'black'], size: [0.45, 0.46, 0.8],
    build({ w, d, h, finish }, M) {
      const m = M.finish(finish);
      const leg = isWood(finish) ? m : M.get('frame_black');
      const g = group();
      g.add(rbox(w, 0.05, d * 0.92, m, 0, 0.41, 0.01, 0.02));
      const back = rbox(w * 0.96, h - 0.52, 0.035, m, 0, 0.52, -d / 2 + 0.03, 0.015);
      back.rotation.x = -0.1;
      g.add(back);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        g.add(lbox(0.03, sz < 0 ? 0.56 : 0.41, 0.03, leg, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.035)));
      }
      return g;
    },
  },

  rug: {
    label: '地毯', cat: '软装', finishes: ['rug_dots', 'rug_plain'], size: [1.3, 2.5, 0.012], flat: true,
    build({ w, d, h, finish }, M) {
      const mat = M.std({ map: rugTexture(w, d, finish === 'rug_dots'), roughness: 1 });
      const mesh = lbox(w, Math.max(h, 0.008), d, mat);
      mesh.castShadow = false;
      mesh.userData.ownMaterial = true;
      return group(mesh);
    },
  },

  tv_cabinet: {
    label: '电视柜', cat: '柜体', finishes: WOODS, size: [1.5, 0.3, 0.45],
    build({ w, d, h, finish }, M) {
      const m = M.finish(finish);
      const g = group();
      g.add(lbox(w - 0.12, 0.12, d - 0.06, M.get('frame_black'), 0, 0, -0.02));
      g.add(rbox(w, h - 0.12, d, m, 0, 0.12, 0, 0.008));
      doorLines(g, M, w, 0.13, h - 0.01, d / 2 + 0.001, Math.max(2, Math.round(w / 0.5)));
      return g;
    },
  },

  tv: {
    label: '电视', cat: '设备', finishes: ['black'], size: [1.45, 0.04, 0.83], z0: 0.95, wall: true,
    build({ w, d, h }, M) {
      const g = group();
      g.add(lbox(w, h, Math.min(d, 0.04), M.get('frame_black'), 0, 0, 0));
      g.add(lbox(w - 0.02, h - 0.02, 0.004, M.get('screen'), 0, 0.01, Math.min(d, 0.04) / 2));
      return g;
    },
  },

  side_table: {
    label: '圆边几', cat: '桌', finishes: WOODS, size: [0.4, 0.4, 0.55],
    build({ w, d, h, finish }, M) {
      const m = M.finish(finish);
      const r = Math.min(w, d) / 2;
      return group(
        lcyl(r, 0.028, m, 0, h - 0.028, 0, 40),
        lcyl(0.022, h - 0.04, m, 0, 0.012, 0, 12),
        lcyl(r * 0.62, 0.012, m, 0, 0, 0, 40),
      );
    },
  },

  coffee_table: {
    label: '茶几', cat: '桌', finishes: WOODS, size: [1.0, 0.55, 0.38],
    build({ w, d, h, finish }, M) {
      const m = M.finish(finish);
      const g = group(rbox(w, 0.035, d, m, 0, h - 0.035, 0, 0.012));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(lbox(0.035, h - 0.035, 0.035, M.get('frame_black'), sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06)));
      return g;
    },
  },

  dining_table: {
    label: '餐桌', cat: '桌', finishes: WOODS, size: [1.15, 0.75, 0.75],
    build({ w, d, h, finish }, M) {
      const m = M.finish(finish);
      const g = group(rbox(w, 0.038, d, m, 0, h - 0.038, 0, 0.012));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(lbox(0.05, h - 0.038, 0.05, m, sx * (w / 2 - 0.07), 0, sz * (d / 2 - 0.07)));
      g.add(lbox(w - 0.2, 0.06, 0.02, m, 0, h - 0.1, d / 2 - 0.08));
      g.add(lbox(w - 0.2, 0.06, 0.02, m, 0, h - 0.1, -d / 2 + 0.08));
      return g;
    },
  },

  desk: {
    label: '书桌', cat: '桌', finishes: WOODS, size: [1.0, 0.6, 0.75],
    build({ w, d, h, finish }, M) {
      const m = M.finish(finish);
      const g = group(rbox(w, 0.03, d, m, 0, h - 0.03, 0, 0.008));
      for (const s of [-1, 1]) g.add(lbox(0.03, h - 0.03, d - 0.08, m, s * (w / 2 - 0.03), 0, 0));
      g.add(lbox(w - 0.06, 0.28, 0.018, m, 0, h - 0.31, -d / 2 + 0.06));
      return g;
    },
  },

  cabinet: {
    label: '柜子', cat: '柜体', finishes: WOODS, size: [1.5, 0.4, 0.9],
    build({ w, d, h, finish, item }, M) {
      const m = M.finish(finish);
      const g = group();
      const onFloor = !(item && item.z0 > 0);
      const p = onFloor ? 0.08 : 0;
      if (onFloor) g.add(lbox(w - 0.02, p, d - 0.05, M.get('frame_black'), 0, 0, -0.02));
      g.add(rbox(w, h - p, d, m, 0, p, 0, 0.006));
      doorLines(g, M, w, p + 0.01, h - 0.01, d / 2 + 0.001, Math.max(2, Math.round(w / 0.5)));
      return g;
    },
  },

  shelf: {
    label: '层架', cat: '柜体', finishes: WOODS, size: [0.8, 0.3, 1.9],
    build({ w, d, h, finish }, M) {
      const m = M.finish(finish);
      const g = group();
      for (const s of [-1, 1]) g.add(lbox(0.022, h, d, m, s * (w / 2 - 0.011), 0, 0));
      const n = Math.max(2, Math.round(h / 0.38));
      for (let i = 0; i <= n; i++) g.add(lbox(w - 0.044, 0.022, d - 0.01, m, 0, Math.min(h - 0.022, (h / n) * i), 0));
      g.add(lbox(w - 0.02, h, 0.008, m, 0, 0, -d / 2 + 0.004));
      return g;
    },
  },

  wardrobe: {
    label: '衣柜', cat: '柜体', finishes: WOODS, size: [1.8, 0.6, 2.6],
    build({ w, d, h, finish, opts }, M) {
      const m = M.finish(finish);
      const g = group(lbox(w, h, d, m, 0, 0, 0));
      const n = Math.max(2, Math.round(w / 0.47));
      const z = d / 2 + 0.001;
      doorLines(g, M, w, 0.02, h - 0.02, z, n);
      g.add(reveal(M, w, false, 0, 0.06, z));
      if (opts.drawers) {
        const half = Math.floor(n / 2);
        const dw = (w * (n - half)) / n;
        const cx = w / 2 - dw / 2;
        for (const y of [0.32, 0.6, 0.88]) g.add(reveal(M, dw, false, cx, y, z));
      }
      return g;
    },
  },

  nightstand: {
    label: '床头柜', cat: '柜体', finishes: WOODS, size: [0.5, 0.4, 0.5],
    build({ w, d, h, finish }, M) {
      const m = M.finish(finish);
      const g = group(rbox(w, h - 0.1, d, m, 0, 0.1, 0, 0.008));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(lbox(0.025, 0.1, 0.025, M.get('frame_black'), sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04)));
      g.add(reveal(M, w - 0.02, false, 0, 0.1 + (h - 0.1) / 2, d / 2 + 0.001));
      return g;
    },
  },

  dresser: {
    label: '五斗柜', cat: '柜体', finishes: WOODS, size: [0.8, 0.4, 1.0],
    build({ w, d, h, finish }, M) {
      const m = M.finish(finish);
      const g = group(rbox(w, h - 0.06, d, m, 0, 0.06, 0, 0.008));
      g.add(lbox(w - 0.04, 0.06, d - 0.06, M.get('frame_black'), 0, 0, -0.01));
      const n = 5;
      for (let i = 1; i < n; i++) g.add(reveal(M, w - 0.02, false, 0, 0.06 + ((h - 0.06) * i) / n, d / 2 + 0.001));
      for (let i = 0; i < n; i++) g.add(lbox(0.1, 0.012, 0.014, M.get('metal'), 0, 0.06 + ((h - 0.06) * (i + 0.5)) / n, d / 2 + 0.001));
      return g;
    },
  },

  entry_cabinet: {
    label: '入户柜（带灯带）', cat: '柜体', finishes: WOODS, size: [2.15, 0.35, 2.3],
    build({ w, d, h, finish }, M) {
      const m = M.finish(finish);
      const g = group();
      const lowH = 0.92, nicheH = 0.36;
      const n = Math.max(2, Math.round(w / 0.5));
      const z = d / 2 + 0.001;
      g.add(lbox(w - 0.02, 0.07, d - 0.05, M.get('frame_black'), 0, 0, -0.02));
      g.add(lbox(w, lowH - 0.07, d, m, 0, 0.07, 0));
      doorLines(g, M, w, 0.08, lowH - 0.01, z, n);
      g.add(lbox(w, nicheH, 0.02, m, 0, lowH, -d / 2 + 0.01));
      for (const s of [-1, 1]) g.add(lbox(0.02, nicheH, d, m, s * (w / 2 - 0.01), lowH, 0));
      const upY = lowH + nicheH;
      g.add(lbox(w, h - upY, d, m, 0, upY, 0));
      doorLines(g, M, w, upY + 0.01, h - 0.01, z, n);
      // 壁龛顶上的灯带
      const led = lbox(w - 0.06, 0.006, 0.012, M.get('led_cabinet'), 0, upY - 0.007, d / 2 - 0.06);
      led.castShadow = false;
      g.add(led);
      const lw = 0.02;
      const nits = 380 / (Math.PI * lw);
      const light = new THREE.RectAreaLight('#ffd2a0', nits, w - 0.08, lw);
      light.position.set(0, upY - 0.012, d / 2 - 0.06);
      light.rotation.x = -Math.PI / 2;
      light.userData = { channel: 'cabinet', base: nits };
      g.add(light);
      g.userData.lights = [light];
      return g;
    },
  },

  bed: {
    label: '床', cat: '床', finishes: ['fabric_grey', 'fabric_beige', 'fabric_dark', 'fabric_green', 'walnut', 'oak_light'], size: [1.8, 2.0, 1.0],
    build({ w, d, h, finish }, M) {
      const m = M.finish(finish);
      const g = group();
      g.add(rbox(w, 0.24, d - 0.05, m, 0, 0.06, 0.025, 0.03));
      g.add(rbox(w + 0.04, h, 0.08, m, 0, 0, -d / 2 + 0.04, 0.03));
      g.add(rbox(w - 0.04, 0.2, d - 0.14, M.get('mattress'), 0, 0.3, 0.03, 0.05));
      g.add(rbox(w + 0.03, 0.09, d * 0.62, M.get('bedding'), 0, 0.46, d / 2 - d * 0.31 - 0.03, 0.04));
      g.add(rbox(w + 0.035, 0.03, 0.5, M.finish('fabric_brown'), 0, 0.535, d / 2 - 0.42, 0.012));
      const pw = Math.min(0.7, w * 0.42);
      for (const s of [-1, 1]) {
        const pil = rbox(pw, 0.14, 0.42, M.get('pillow'), s * (w / 4), 0.5, -d / 2 + 0.36, 0.06);
        pil.rotation.x = -0.25;
        g.add(pil);
      }
      for (const sx of [-1, 1]) g.add(lbox(0.05, 0.06, 0.05, M.get('frame_black'), sx * (w / 2 - 0.1), 0, d / 2 - 0.12));
      return g;
    },
  },

  plant: {
    label: '盆栽', cat: '软装', finishes: ['green'], size: [0.8, 0.7, 1.6],
    build({ w, d, h }, M) {
      const g = group();
      const pr = Math.min(0.19, Math.min(w, d) * 0.28);
      const ph = Math.min(0.36, h * 0.24);
      g.add(lcyl(pr * 0.82, ph, M.get('pot'), 0, 0, 0, 28, pr));
      g.add(lcyl(pr * 0.94, 0.02, M.finish('wood_dark'), 0, ph - 0.03, 0, 28));
      const spread = Math.min(w, d) / 2;
      const n = 16;
      const leafGeo = new THREE.SphereGeometry(1, 10, 6);
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const yaw = i * 2.39996;
        const lean = 0.35 + 0.95 * ((i * 7) % n) / n;       // 离竖直的倾角
        const len = (h - ph) * (0.45 + 0.4 * (1 - Math.abs(t - 0.5)));
        const stem = new THREE.Group();
        stem.position.set(0, ph - 0.02, 0);
        stem.rotation.set(0, yaw, 0);
        const frond = new THREE.Group();
        frond.rotation.z = -Math.min(lean, Math.atan2(spread, (h - ph) * 0.5) + 0.25);
        const leaf = new THREE.Mesh(leafGeo, M.get(i % 3 === 0 ? 'leaf_dark' : 'leaf'));
        leaf.scale.set(0.05 + 0.02 * (i % 3), len / 2, 0.012);
        leaf.position.y = len / 2 + 0.05;
        leaf.castShadow = true;
        frond.add(leaf);
        const rib = lcyl(0.006, len * 0.9, M.get('leaf_dark'), 0, 0.02, 0, 6);
        frond.add(rib);
        stem.add(frond);
        g.add(stem);
      }
      return g;
    },
  },

  frames: {
    label: '画框组', cat: '软装', finishes: ['black', 'walnut', 'oak_light', 'white'], size: [1.7, 0.03, 0.8], z0: 1.2, wall: true,
    build({ w, d, h, finish }, M) {
      const fm = M.finish(finish);
      const g = group();
      const layout = [
        [0.0, 0.0, 0.4, 1.0, 'art_c'],
        [0.46, 0.45, 0.72, 1.0, 'art_a'],
        [0.46, 0.0, 0.72, 0.38, 'art_b'],
        [0.78, 0.18, 1.0, 0.78, 'art_a'],
      ];
      const zb = -d / 2;
      for (const [u0, v0, u1, v1, art] of layout) {
        const fw = (u1 - u0) * w, fh = (v1 - v0) * h;
        const cx = -w / 2 + (u0 + u1) / 2 * w;
        const y = v0 * h;
        g.add(lbox(fw, fh, 0.028, fm, cx, y, zb + 0.014));
        g.add(lbox(fw - 0.05, fh - 0.05, 0.004, M.get('paper'), cx, y + 0.025, zb + 0.03));
        g.add(lbox(fw * 0.5, fh * 0.55, 0.004, M.get(art), cx, y + fh * 0.225, zb + 0.032));
      }
      return g;
    },
  },

  fan: {
    label: '吊扇', cat: '设备', finishes: ['walnut', 'oak_light', 'wood_dark', 'white', 'black'], size: [1.3, 1.3, 0.35], z0: 2.25, ceiling: true,
    build({ w, d, h, finish }, M) {
      const m = M.finish(finish);
      const dark = M.finish('wood_dark');
      const r = Math.min(w, d) / 2;
      const g = group();
      g.add(lcyl(0.07, 0.04, dark, 0, h - 0.04, 0, 24));
      g.add(lcyl(0.014, Math.max(0.02, h - 0.24), dark, 0, 0.2, 0, 10));
      g.add(lcyl(0.11, 0.1, dark, 0, 0.1, 0, 32));
      const lamp = lcyl(0.085, 0.05, M.get('paper'), 0, 0.05, 0, 32, 0.1);
      g.add(lamp);
      const n = 5;
      for (let i = 0; i < n; i++) {
        const arm = new THREE.Group();
        arm.rotation.y = (i / n) * Math.PI * 2;
        const blade = rbox(r - 0.14, 0.012, 0.13, m, 0.14 + (r - 0.14) / 2, 0.15, 0, 0.005);
        blade.rotation.x = 0.2;
        arm.add(blade);
        g.add(arm);
      }
      return g;
    },
  },

  ac: {
    label: '壁挂空调', cat: '设备', finishes: ['white'], size: [0.9, 0.21, 0.29], z0: 2.24, wall: true,
    build({ w, d, h }, M) {
      return group(
        rbox(w, h, d, M.finish('white'), 0, 0, 0, 0.045),
        lbox(w - 0.08, 0.012, 0.01, M.get('frame_alu'), 0, 0.035, d / 2),
      );
    },
  },

  washer: {
    label: '洗衣机', cat: '设备', finishes: ['white', 'grey'], size: [0.6, 0.6, 0.85],
    build({ w, d, h, finish }, M) {
      const g = group(rbox(w, h, d, M.finish(finish), 0, 0, 0, 0.02));
      const door = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, h) * 0.3, Math.min(w, h) * 0.3, 0.03, 40), M.get('screen'));
      door.rotation.x = Math.PI / 2;
      door.position.set(0, h * 0.48, d / 2 + 0.005);
      g.add(door);
      g.add(lbox(w - 0.06, 0.07, 0.006, M.get('frame_alu'), 0, h - 0.11, d / 2 + 0.001));
      return g;
    },
  },

  fridge: {
    label: '冰箱', cat: '设备', finishes: ['grey', 'white', 'black'], size: [0.7, 0.66, 1.8],
    build({ w, d, h, finish }, M) {
      const g = group(rbox(w, h, d, M.finish(finish), 0, 0, 0, 0.015));
      g.add(reveal(M, w, false, 0, h * 0.42, d / 2 + 0.001));
      g.add(lbox(0.02, 0.4, 0.02, M.get('metal'), -w / 2 + 0.06, h * 0.5, d / 2 + 0.012));
      g.add(lbox(0.02, 0.3, 0.02, M.get('metal'), -w / 2 + 0.06, h * 0.2, d / 2 + 0.012));
      return g;
    },
  },

  counter: {
    label: '厨房台面', cat: '厨卫', finishes: ['white', 'oak_light', 'walnut', 'grey'], size: [2.0, 0.6, 0.88],
    build({ w, d, h, finish, opts }, M) {
      const g = group();
      g.add(lbox(w - 0.02, 0.1, d - 0.07, M.get('frame_black'), 0, 0, -0.025));
      g.add(lbox(w, h - 0.14, d - 0.02, M.finish(finish), 0, 0.1, -0.01));
      g.add(lbox(w, 0.04, d, M.get('counter_top'), 0, h - 0.04, 0));
      doorLines(g, M, w, 0.11, h - 0.05, d / 2 - 0.02 + 0.001, Math.max(1, Math.round(w / 0.55)));
      if (opts.hob) g.add(lbox(0.58, 0.006, 0.5, M.get('screen'), w * 0.18, h, 0));
      if (opts.sink) {
        g.add(lbox(Math.min(0.7, w * 0.6), 0.004, d * 0.62, M.get('steel'), 0, h, 0.02));
        g.add(lcyl(0.012, 0.24, M.get('steel'), 0, h, -d / 2 + 0.07, 10));
      }
      return g;
    },
  },

  vanity: {
    label: '洗手台', cat: '厨卫', finishes: ['white', 'oak_light', 'walnut'], size: [1.0, 0.5, 0.85],
    build({ w, d, h, finish }, M) {
      const g = group();
      g.add(lbox(w, h - 0.35, d - 0.02, M.finish(finish), 0, 0.3, -0.01));
      g.add(lbox(w, 0.05, d, M.get('counter_top'), 0, h - 0.05, 0));
      g.add(rbox(Math.min(0.5, w * 0.55), 0.03, d * 0.6, M.get('ceramic'), 0, h, 0.02, 0.012));
      g.add(lcyl(0.012, 0.16, M.get('steel'), 0, h, -d / 2 + 0.06, 10));
      g.add(lbox(w - 0.1, 0.9, 0.012, M.get('steel'), 0, h + 0.2, -d / 2 + 0.006));
      return g;
    },
  },

  toilet: {
    label: '马桶', cat: '厨卫', finishes: ['white'], size: [0.4, 0.68, 0.42],
    build({ w, d, h }, M) {
      const c = M.get('ceramic');
      return group(
        rbox(w, h + 0.36, 0.18, c, 0, 0, -d / 2 + 0.09, 0.03),
        rbox(w * 0.92, h, d - 0.2, c, 0, 0, 0.08, 0.1),
        rbox(w * 0.95, 0.03, d - 0.22, c, 0, h, 0.08, 0.012),
      );
    },
  },

  glass_panel: {
    label: '玻璃隔断', cat: '厨卫', finishes: ['glass'], size: [1.2, 0.02, 2.0],
    build({ w, d, h }, M) {
      const glass = lbox(w, h, Math.max(0.01, Math.min(d, 0.012)), M.get('glass'));
      glass.castShadow = false;
      return group(glass, lbox(w, 0.02, 0.02, M.get('frame_black'), 0, h, 0));
    },
  },

  floor_lamp: {
    label: '落地灯', cat: '软装', finishes: ['black', 'white', 'walnut'], size: [0.35, 0.35, 1.5],
    build({ w, d, h, finish }, M) {
      const m = M.finish(finish);
      const r = Math.min(w, d) / 2;
      return group(
        lcyl(r * 0.8, 0.02, m, 0, 0, 0, 32),
        lcyl(0.012, h - 0.3, m, 0, 0.02, 0, 10),
        lcyl(r, 0.28, M.get('paper'), 0, h - 0.28, 0, 32, r * 0.75),
      );
    },
  },

  box: {
    label: '方盒（占位）', cat: '其他', finishes: Object.keys(FINISHES).filter((k) => !k.startsWith('rug')), size: [0.6, 0.6, 0.6],
    build({ w, d, h, finish }, M) {
      return group(lbox(w, h, d, M.finish(finish)));
    },
  },
};

/** 把一条家具数据变成场景里的一个组 */
export function buildItem(item, M) {
  const def = COMPONENTS[item.type] || COMPONENTS.box;
  const dx = item.x[1] - item.x[0], dy = item.y[1] - item.y[0];
  const alongX = item.face === '+x' || item.face === '-x';
  const w = alongX ? dy : dx;
  const d = alongX ? dx : dy;
  const finish = item.finish && FINISHES[item.finish] ? item.finish : def.finishes[0];
  const g = def.build({ w, d, h: item.h, finish, opts: item.opts || {}, item }, M);
  g.position.set((item.x[0] + item.x[1]) / 2, item.z0 || 0, (item.y[0] + item.y[1]) / 2);
  g.rotation.y = faceAngle(item.face);
  g.name = item.id;
  g.userData.item = item;
  g.visible = !item.hidden;
  g.traverse((o) => {
    if (o.isMesh) {
      o.receiveShadow = true;
      if (o.castShadow === undefined) o.castShadow = true;
    }
  });
  return g;
}

/** 新建一条家具数据（“添加组件”用），放在 (cx, cy) */
export function newItem(type, cx, cy, id) {
  const def = COMPONENTS[type];
  const [w, d, h] = def.size;
  const item = {
    id, type, name: def.label, room: '',
    x: [cx - w / 2, cx + w / 2], y: [cy - d / 2, cy + d / 2],
    h, face: '+y', finish: def.finishes[0],
  };
  if (def.z0) item.z0 = def.z0;
  return item;
}
