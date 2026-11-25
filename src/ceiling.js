// 吊顶：客厅六种做法（A / B / C / D / E1 / E2）、主卧 L 形边吊、旧边吊、入户走廊低吊顶。
// 灯具（射灯、灯带面光源）也在这里生成，开关和亮度由 lighting.js 统一管。
import * as THREE from 'three';
import { box, prism, V } from './geo.js';

const DEG = Math.PI / 180;

/** 光束角（半强度全角）→ three.js SpotLight 的 angle（penumbra = 1 时半强度正好落在光束角上） */
export function coneAngle(beamDeg) {
  return Math.acos(2 * Math.cos((beamDeg / 2) * DEG) - 1);
}

/** 光通量 → SpotLight 的坎德拉（penumbra = 1 的 smoothstep 分布） */
function spotCandela(lumens, angle) {
  return lumens / (Math.PI * (1 - Math.cos(angle)));
}

/* ------------------------------------------------------------------ */
/*  灯槽边吊的通用做法：槽底板 + 实心部分 + 挡边 + 灯带 + 面光源          */
/* ------------------------------------------------------------------ */

/**
 * path(o, nArc)：边吊靠房间一侧的边线，往墙那边缩进 o 之后的折线（文档平面坐标）。
 * closure：把折线两端沿墙连起来的点。
 */
function coveBand(g, M, lights, { path, closure, under, top, c, strip, channel, ledMat, makeLights = true }) {
  const tf = c.troughFloor;
  const poly = (o) => [...path(o, 12), ...closure];
  // 槽底板（整个边吊的底面）
  g.add(prism(poly(0), under, under + tf, M.get('bulk_new')));
  // 实心部分（灯槽以内）
  g.add(prism(poly(c.trough), under + tf, top, M.get('bulk_new')));
  // 挡边：坐在槽底板上，不跟槽底板共面重叠
  g.add(prism([...path(0, 12), ...path(c.lipThickness, 12).reverse()], under + tf, under + c.lipHeight, M.get('bulk_new')));
  // 灯带（发光条）
  const mid = c.lipThickness + c.ledFromLip;
  const hw = strip.width / 2;
  const led = prism([...path(mid - hw, 12), ...path(mid + hw, 12).reverse()], under + tf, under + tf + 0.004, M.get(ledMat), { cast: false, receive: false });
  g.add(led);
  if (makeLights) stripLights(g, lights, path(mid, 2), under + tf + 0.008, { strip, channel });
  return { ledPath: path(mid, 12) };
}

/** 沿折线放一串朝上的面光源（RectAreaLight 不投阴影，所以必须整条藏在挡边里） */
function stripLights(g, lights, pts, z, { strip, channel, lumensPerMetre, width }) {
  const lm = lumensPerMetre ?? strip.lumensPerMetre;
  const w = width ?? 0.02;                          // 面光源的宽度（比真实灯带略宽，采样更稳）
  const nits = lm / (Math.PI * w);                  // 亮度 = 光通量 / (π · 面积)
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.03) continue;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    const light = new THREE.RectAreaLight(strip.colour, nits, len, w);
    light.position.copy(V((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z));
    // 本地 X 沿灯带，本地 −Z（出光方向）朝上
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(dx, 0, dz),
      new THREE.Vector3(-dz, 0, dx),
      new THREE.Vector3(0, -1, 0),
    );
    light.quaternion.setFromRotationMatrix(m);
    light.userData = { channel, base: nits };
    g.add(light);
    lights.push(light);
  }
}

/** 嵌入式射灯：灯圈贴平边吊底面，光源在底面下 1 cm，开阴影 */
function addSpot(g, M, lights, x, y, zUnder, { spot, beam, channel, glowMat, id }) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(spot.cutout / 2, spot.trimOuter / 2, 40), M.get('spot_trim'));
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(V(x, y, zUnder - 0.0015));
  g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(spot.cutout / 2, 40), M.get(glowMat));
  disc.rotation.x = Math.PI / 2;
  disc.position.copy(V(x, y, zUnder - 0.001));
  g.add(disc);

  const angle = coneAngle(beam);
  const cd = spotCandela(spot.lumens, angle);
  const light = new THREE.SpotLight(spot.colour, cd, 7, angle, 1, 2);
  light.position.copy(V(x, y, zUnder - 0.01));
  light.target.position.copy(V(x, y, 0));
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.near = 0.02;
  light.shadow.camera.far = 4;
  light.shadow.bias = -0.0006;
  light.shadow.normalBias = 0.004;
  light.shadow.radius = 2.5;
  light.userData = { channel, base: cd, id, plan: [x, y, zUnder] };
  g.add(light, light.target);
  lights.push(light);
}

/** U 形边吊靠房间一侧的边线。圆弧圆心固定，缩进 o 时半径变成 R + o（同心） */
export function uPath(W, L, wS, wB, wD, R, o, n) {
  const s = wS - o, b = wB - o, d = wD - o, r = R + o;
  const c1 = [wS + R, wB + R], c2 = [wS + R, L - wD - R];
  const pts = [[W, b]];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 - (Math.PI / 2) * (i / n);
    pts.push([c1[0] + r * Math.cos(a), c1[1] + r * Math.sin(a)]);
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (Math.PI / 2) * (i / n);
    pts.push([c2[0] + r * Math.cos(a), c2[1] + r * Math.sin(a)]);
  }
  pts.push([W, L - d]);
  return pts;
}

export function arc(c, r, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return pts;
}

/* ------------------------------------------------------------------ */
/*  客厅                                                               */
/* ------------------------------------------------------------------ */

export function buildLivingCeiling(data, M, optKey) {
  const g = new THREE.Group();
  g.name = 'living-ceiling-' + optKey;
  const lights = [];
  const Lc = data.ceiling.living;
  const c = Lc.common;
  const opt = Lc.options[optKey];
  const W = Lc.x[1], LEN = Lc.y[1];
  const H = data.heights.ceiling;
  const old = data.ceiling.oldBox;
  const strip = data.lights.strip;
  const wE = c.endBand;
  const R = c.cornerRadius;
  const base = { c, strip, channel: 'cove', ledMat: 'led', top: H };

  if (opt.kind === 'u') {
    // A / B / D / E2：一圈 U 形灯槽，转角 R0.30
    const wS = opt.sofaWidth;
    coveBand(g, M, lights, {
      ...base, under: opt.under,
      path: (o, n) => uPath(W, LEN, wS, wE, wE, R, o, n),
      closure: [[W, LEN], [0, LEN], [0, 0], [W, 0]],
    });
    if (opt.lower) {
      // E2：只加宽下半截，直的，一直到阳台墙
      g.add(box(opt.lower.x[0], opt.lower.x[1], 0, LEN, opt.lower.z[0], opt.lower.z[1], M.get('bulk_new')));
    } else if (opt.keepOldBox) {
      // B：旧边吊保留，露在新边吊下面
      g.add(box(old.x[0], old.x[1], 0, LEN, old.z[0], old.z[1], M.get('bulk_old')));
    }
  } else if (opt.kind === 'wash') {
    // C：旧边吊 + 挡板，灯带藏在旧边吊底下朝墙往下洗墙
    g.add(box(old.x[0], old.x[1], 0, LEN, old.z[0], old.z[1], M.get('bulk_old')));
    const bf = opt.baffle;
    g.add(box(bf.x[0], bf.x[1], 0, LEN, bf.z[0], bf.z[1], M.get('bulk_new')));
    const x0 = bf.x[1];
    coveBand(g, M, lights, {
      ...base, under: opt.under,
      path: (o) => [[W, wE - o], [x0, wE - o]],
      closure: [[x0, 0], [W, 0]],
    });
    coveBand(g, M, lights, {
      ...base, under: opt.under,
      path: (o) => [[x0, LEN - wE + o], [W, LEN - wE + o]],
      closure: [[W, LEN], [x0, LEN]],
    });
    // 洗墙灯带
    const ws = opt.wash;
    g.add(box(ws.x - 0.006, ws.x + 0.006, 0.02, LEN - 0.02, ws.z, ws.z + 0.008, M.get('led_wash'), { cast: false, receive: false }));
    const t = ws.tiltDeg * DEG;
    const w = 0.02;
    const nits = (data.lights.wash.lumensPerMetre) / (Math.PI * w);
    const light = new THREE.RectAreaLight(strip.colour, nits, LEN - 0.04, w);
    light.position.copy(V(ws.x, LEN / 2, ws.z - 0.004));
    // 出光方向：朝墙（−x）并往下倾 tilt
    light.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(Math.sin(t), -Math.cos(t), 0),
      new THREE.Vector3(Math.cos(t), Math.sin(t), 0),
    ));
    light.userData = { channel: 'wash', base: nits };
    g.add(light);
    lights.push(light);
  } else if (opt.kind === 'e1') {
    // E1：旧的整条加宽成 22 cm 整块，侧面一条上照铝槽
    const bx = opt.block;
    const wS = opt.sofaWidth;
    g.add(box(bx.x[0], bx.x[1], 0, LEN, bx.z[0], bx.z[1], M.get('bulk_new')));
    coveBand(g, M, lights, {
      ...base, under: opt.under, makeLights: false,
      path: (o, n) => uPath(W, LEN, wS, wE, wE, R, o, n),
      closure: [[W, LEN], [0, LEN], [0, 0], [W, 0]],
    });
    const ch = opt.channel;
    const c1 = [wS + R, wE + R], c2 = [wS + R, LEN - wE - R];
    const zb = ch.z[0], zt = ch.z[1];
    const alu = M.get('alu_channel');
    const ledM = M.get('led');
    // 直段
    g.add(box(wS, wS + ch.out, c1[1], c2[1], zb, zb + 0.004, alu));
    g.add(box(wS + ch.out - 0.004, wS + ch.out, c1[1], c2[1], zb + 0.004, zt, alu));
    g.add(box(wS + 0.008, wS + 0.022, c1[1], c2[1], zb + 0.004, zb + 0.008, ledM, { cast: false, receive: false }));
    // 两个 R0.30 转角：铝槽跟着弯到阳台端、餐厅端
    const ring = (cc, a0, a1, r0, r1, za, zc, mat, o = {}) =>
      g.add(prism([...arc(cc, r0, a0, a1, 12), ...arc(cc, r1, a0, a1, 12).reverse()], za, zc, mat, o));
    for (const [cc, a0, a1] of [[c1, -Math.PI, -Math.PI / 2], [c2, Math.PI / 2, Math.PI]]) {
      ring(cc, a0, a1, R - ch.out, R, zb, zb + 0.004, alu);
      ring(cc, a0, a1, R - ch.out, R - ch.out + 0.004, zb + 0.004, zt, alu);
      ring(cc, a0, a1, R - 0.022, R - 0.008, zb + 0.004, zb + 0.008, ledM, { cast: false, receive: false });
    }
    // 面光源：两端走灯槽，沙发墙一侧走铝槽
    // 转角处的面光源是一段段直线：半径取大一点、分 3 段、做窄一点，
    // 保证每段的中点都还在铝槽里面（面光源不投阴影，露到槽外会把铝槽外侧照亮）
    const yb = wE - c.lipThickness - c.ledFromLip;
    const rl = R - 0.010;
    const xl = wS + 0.015;
    stripLights(g, lights, [[W, yb], [c1[0], yb]], opt.under + c.troughFloor + 0.008, { strip, channel: 'cove' });
    stripLights(g, lights, [[c2[0], LEN - yb], [W, LEN - yb]], opt.under + c.troughFloor + 0.008, { strip, channel: 'cove' });
    stripLights(g, lights, arc(c1, rl, -Math.PI / 2, -Math.PI, 3), ch.ledZ, { strip, channel: 'cove', width: 0.01 });
    stripLights(g, lights, [[xl, c1[1]], [xl, c2[1]]], ch.ledZ, { strip, channel: 'cove' });
    stripLights(g, lights, arc(c2, rl, Math.PI, Math.PI / 2, 3), ch.ledZ, { strip, channel: 'cove', width: 0.01 });
  }

  // 射灯 + 检修口
  const spotsAt = [];
  if (opt.spotZ != null) {
    c.spots.y.forEach((y, i) => {
      addSpot(g, M, lights, c.spots.fromWall, y, opt.spotZ, {
        spot: data.lights.spot, beam: c.spots.beam, channel: 'spot', glowMat: 'spot_glow', id: 'S' + (i + 1),
      });
      spotsAt.push([c.spots.fromWall, y, opt.spotZ]);
    });
    const hs = c.hatch.size;
    let x1 = Math.min(0.25, (opt.sofaWidth ?? 0.35) - 0.01);
    let x0 = x1 - hs[0];
    if (opt.kind === 'u' && opt.keepOldBox && !opt.lower) { x0 = old.x[1] + 0.01; x1 = x0 + hs[0]; }
    g.add(box(x0, x1, c.hatch.y - hs[1] / 2, c.hatch.y + hs[1] / 2, opt.spotZ - 0.003, opt.spotZ, M.get('hatch'), { cast: false }));
  }

  return { group: g, lights, info: { key: optKey, opt, under: opt.under, spots: spotsAt, endUnder: opt.under } };
}

/** 不随做法变化的部分：餐厅以后的旧边吊、餐厅端横向边吊、入户走廊低吊顶 */
export function buildFixedCeiling(data, M) {
  const g = new THREE.Group();
  g.name = 'fixed-ceiling';
  const lights = [];
  const old = data.ceiling.oldBox;
  const LEN = data.ceiling.living.y[1];
  g.add(box(old.x[0], old.x[1], LEN, old.y[1], old.z[0], old.z[1], M.get('bulk_old')));
  const t = data.ceiling.diningTransverse;
  g.add(box(t.x[0], t.x[1], t.y[0], t.y[1], t.z[0], t.z[1], M.get('bulk_old')));

  // 入户走廊低吊顶（从上面看时跟楼板一起隐藏）
  const foyer = new THREE.Group();
  foyer.name = 'foyer-ceiling';
  const f = data.ceiling.foyer;
  foyer.add(box(f.rect[0], f.rect[2], f.rect[1], f.rect[3], f.z, data.heights.ceiling, M.get('ceiling')));
  for (const [x, y] of f.downlights) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 32), M.get('spot_trim'));
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(V(x, y, f.z - 0.0015));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.035, 32), M.get('downlight_glow'));
    disc.rotation.x = Math.PI / 2;
    disc.position.copy(V(x, y, f.z - 0.001));
    foyer.add(ring, disc);
    const light = new THREE.SpotLight('#ffe2bd', 420, 5, 52 * DEG, 0.9, 2);
    light.position.copy(V(x, y, f.z - 0.01));
    light.target.position.copy(V(x, y, 0));
    light.userData = { channel: 'general', base: 420 };
    foyer.add(light, light.target);
    lights.push(light);
  }
  return { group: g, foyer, lights };
}

/* ------------------------------------------------------------------ */
/*  主卧                                                               */
/* ------------------------------------------------------------------ */

export function buildMasterCeiling(data, M, beam) {
  const g = new THREE.Group();
  g.name = 'master-ceiling';
  const lights = [];
  const m = data.ceiling.master;
  const c = { ...data.ceiling.living.common, cornerRadius: m.cornerRadius };
  const U = m.size.u, VV = m.size.v;
  const R = m.cornerRadius;
  const map = ([u, v]) => [m.headWallX - u, m.windowWallY + v];
  const cc = [m.headBand + R, m.windowBand + R];
  const pathUV = (o, n) => [
    [U, m.windowBand - o],
    ...arc(cc, R + o, -Math.PI / 2, -Math.PI, n),
    [m.headBand - o, VV],
  ];
  coveBand(g, M, lights, {
    c, strip: data.lights.strip, channel: 'cove_master', ledMat: 'led_master',
    under: m.under, top: data.heights.ceiling,
    path: (o, n) => pathUV(o, n).map(map),
    closure: [[0, VV], [0, 0], [U, 0]].map(map),
  });
  const spotsAt = [];
  for (const s of m.spots) {
    const [x, y] = map([s.u, s.v]);
    addSpot(g, M, lights, x, y, m.under, {
      spot: data.lights.spot, beam, channel: 'spot_master', glowMat: 'spot_glow_master', id: s.id,
    });
    spotsAt.push([x, y, m.under, s.id]);
  }
  const hs = m.hatch.size;
  const [hx0, hy0] = map([0.01 + hs[0], m.hatch.v - hs[1] / 2]);
  const [hx1, hy1] = map([0.01, m.hatch.v + hs[1] / 2]);
  g.add(box(hx0, hx1, hy0, hy1, m.under - 0.003, m.under, M.get('hatch'), { cast: false }));
  return { group: g, lights, info: { spots: spotsAt, under: m.under, beam } };
}
