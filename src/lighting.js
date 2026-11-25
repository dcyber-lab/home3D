// 灯光：四个场景（晚上全开 / 只开射灯 / 只开灯带 / 白天）。
// 亮度用物理单位（射灯 = 坎德拉，灯带 = 尼特，环境光 = 勒克斯），同一个场景里各做法的曝光一致。
import * as THREE from 'three';
import { V } from './geo.js';

const EXPOSURE = { night: 0.0052, day: 0.00042 };

export class Lighting {
  constructor(scene, renderer, data, M) {
    this.scene = scene;
    this.renderer = renderer;
    this.data = data;
    this.M = M;
    this.sets = {};                 // 名字 → 灯的数组（吊顶重建时整组替换）
    this.exposureBias = 0;          // 用户调的曝光（档）

    this.ambient = new THREE.AmbientLight('#fff1e0', 0);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#8a8378', 0);
    this.fill = new THREE.HemisphereLight('#f4f1ea', '#77736c', 0);   // 从外面看全屋时补的光
    scene.add(this.ambient, this.hemi, this.fill);

    // 白天：从阳台 / 卧室窗一侧斜射进来的日光
    const sun = new THREE.DirectionalLight('#fff3e2', 0);
    sun.position.copy(V(4.4 - 3.2, 4.4 - 9.5, 8.6));
    sun.target.position.copy(V(4.4, 4.4, 0));
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera;
    sc.left = -8.5; sc.right = 8.5; sc.top = 8.5; sc.bottom = -8.5; sc.near = 1; sc.far = 30;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    scene.add(sun, sun.target);
    this.sun = sun;

    // 白天：门窗处的漫射天光（纱帘透进来的柔光），用面光源，离窗越远越暗
    this.daylight = [];
    const sky = (x0, x1, y, z0, z1) => {
      const l = new THREE.RectAreaLight('#f3f6ff', 0, x1 - x0, z1 - z0);
      l.position.copy(V((x0 + x1) / 2, y, (z0 + z1) / 2));
      l.lookAt(V((x0 + x1) / 2, y + 1, (z0 + z1) / 2));
      l.userData = { base: 1250 };
      scene.add(l);
      this.daylight.push(l);
    };
    for (const w of data.walls) {
      if (w.out !== '-y') continue;
      for (const o of w.openings || []) sky(o.at[0], o.at[1], w.y[1] + 0.2, o.z[0], o.z[1]);
    }

    // 反射补光（没有全局光照，用几盏不投影的点光源代替天花、墙面的反射）
    const pt = (x, y, z, dist = 6) => {
      const l = new THREE.PointLight('#ffe3c2', 0, dist, 2);
      l.position.copy(V(x, y, z));
      scene.add(l);
      return l;
    };
    this.bounce = {
      livingCove: [pt(1.5, 1.3, 2.0), pt(1.5, 3.3, 2.0)],
      livingSpot: [pt(0.95, 2.25, 1.25, 5)],
      masterCove: [pt(7.5, 0.5, 2.0, 5)],
      masterSpot: [pt(8.0, 0.66, 1.3, 4)],
    };

    // 其他房间的基础照明（文档里没有这些灯，默认开着只是为了看清户型，可以关）
    this.general = [
      pt(4.38, 0.1, 2.2, 5), pt(4.0, 2.36, 2.2, 4), pt(4.8, 6.2, 2.2, 5),
      pt(4.6, 4.3, 2.2, 3.5), pt(7.2, 4.1, 2.2, 3.5), pt(1.4, 5.9, 2.2, 5),
      pt(5.65, 2.36, 2.2, 3),
    ];
    for (const l of this.general) l.color.set('#fff0dc');
  }

  setLights(name, lights) {
    this.sets[name] = lights;
  }

  all() {
    return Object.values(this.sets).flat();
  }

  /**
   * state: { scene: 场景 id, general: 其他房间基础照明, outside: 相机在屋外,
   *          livingSpots: 当前做法装不装客厅射灯, hasWash: 当前做法有没有洗墙灯带 }
   * 主卧射灯只跟场景走，不受客厅射灯开关影响。
   */
  apply(state) {
    const sc = this.data.scenes[state.scene];
    const day = !!sc.day;
    const on = {
      spot: sc.spots && !!state.livingSpots,
      spot_master: sc.spots,
      cove: sc.cove,
      cove_master: sc.cove,
      wash: sc.wash,
      cabinet: sc.cove,
      general: state.general && !day,
    };
    for (const l of this.all()) {
      const k = on[l.userData.channel] ? 1 : 0;
      l.visible = k > 0;
      l.intensity = l.userData.base * k;
    }

    const M = this.M;
    M.get('led').emissiveIntensity = on.cove ? 16000 : 0;
    M.get('led_master').emissiveIntensity = on.cove_master ? 16000 : 0;
    M.get('led_wash').emissiveIntensity = on.wash ? 16000 : 0;
    M.get('led_cabinet').emissiveIntensity = on.cabinet ? 5000 : 0;
    M.get('spot_glow').emissiveIntensity = on.spot ? 9000 : 0;
    M.get('spot_glow_master').emissiveIntensity = on.spot_master ? 9000 : 0;
    M.get('downlight_glow').emissiveIntensity = on.general ? 6000 : 0;
    M.get('curtain_sheer').emissiveIntensity = day ? 820 : 0;
    M.get('glass_frosted').emissiveIntensity = day ? 900 : 0;

    const set = (arr, v) => { for (const l of arr) { l.intensity = v; l.visible = v > 0; } };
    const spotsOn = on.spot;
    const washOn = sc.wash && !!state.hasWash;
    set(this.bounce.livingCove, sc.cove ? 55 : 0);
    set(this.bounce.livingSpot, spotsOn ? 60 : washOn ? 45 : 0);
    set(this.bounce.masterCove, sc.cove ? 40 : 0);
    set(this.bounce.masterSpot, on.spot_master ? 28 : 0);
    set(this.general, on.general ? 150 : 0);

    for (const l of this.daylight) { l.intensity = day ? l.userData.base : 0; l.visible = day; }
    if (day) {
      this.sun.intensity = 9000;
      this.sun.visible = true;
      this.ambient.intensity = 950;
      this.ambient.color.set('#f6f4f0');
      this.hemi.intensity = 700;
      this.fill.intensity = state.outside ? 500 : 0;
      this.scene.background.set('#c9d6e2');
    } else {
      this.sun.intensity = 0;
      this.sun.visible = false;
      this.ambient.color.set('#ffe9d2');
      this.ambient.intensity = 3 + (sc.cove ? 13 : 0) + (spotsOn || washOn ? 6 : 0) + (on.general ? 4 : 0);
      this.hemi.intensity = 0;
      this.fill.intensity = state.outside ? 85 : 0;
      this.scene.background.set('#12141a');
    }
    this.hemi.visible = this.hemi.intensity > 0;
    this.fill.visible = this.fill.intensity > 0;
    this.renderer.toneMappingExposure = (day ? EXPOSURE.day : EXPOSURE.night) * Math.pow(2, this.exposureBias);
    this.renderer.shadowMap.needsUpdate = true;
  }
}
