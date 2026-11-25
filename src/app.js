// 主程序：把数据变成场景，管理状态（做法 / 场景 / 视角 / 显示开关），按需渲染。
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { Materials } from './materials.js';
import { buildShell, buildCurtains } from './shell.js';
import { buildLivingCeiling, buildMasterCeiling, buildFixedCeiling } from './ceiling.js';
import { buildItem } from './furniture.js';
import { Lighting } from './lighting.js';
import { ViewControls } from './controls.js';
import { Annotations } from './annotations.js';
import { disposeGroup } from './geo.js';

export class App extends EventTarget {
  constructor(canvas, labelRoot, data) {
    super();
    this.canvas = canvas;
    this.data = data;
    this.baseData = JSON.parse(JSON.stringify(data));

    this.state = {
      option: data.ceiling.living.default,
      scene: data.lights.defaultScene,
      view: 'overview',
      masterBeam: data.ceiling.master.beam,
      general: true,
      show: { furniture: true, frames: true, curtains: true, dims: false, labels: true, colourCode: false, slab: 'auto' },
      clipZ: 3,
      exposure: 0,
    };
    this.outside = true;
    this.needsRender = true;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    this.renderer = renderer;
    RectAreaLightUniformsLib.init();

    this.labelRenderer = new CSS2DRenderer({ element: labelRoot });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#12141a');
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 3);

    this.M = new Materials();
    if (data.finishes) {
      this.M.setFloor(data.finishes.floor);
      this.M.setWall(data.finishes.wall);
    }
    this.lighting = new Lighting(this.scene, renderer, data, this.M);
    this.controls = new ViewControls(this.camera, canvas, () => this.invalidate());
    this.controls.onModeChange = () => this.emit('mode');

    this.groups = {};
    this.buildAll();
    this.annotations = new Annotations(this);
    this.annotations.rebuild();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.applyLights();
    this.gotoView(this.state.view, false);

    this.clock = new THREE.Clock();
    this.frames = 0;
    let streak = 0, slow = 0, last = 0;
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.controls.update(dt);
      if (!this.needsRender) { streak = 0; return; }
      this.needsRender = false;
      this.updateCutaway();
      this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
      this.frames++;
      // 连续拖动时如果太卡（低于约 20 帧），自动把渲染分辨率降一档
      const now = performance.now();
      if (streak > 0 && now - last > 50) slow++;
      streak++;
      last = now;
      if (streak >= 24) {
        const pr = this.renderer.getPixelRatio();
        if (slow > 16 && pr > 1) {
          this.renderer.setPixelRatio(Math.max(1, pr - 0.5));
          this.resize();
        }
        streak = 0; slow = 0;
      }
    };
    loop();
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  invalidate(shadows = false) {
    this.needsRender = true;
    if (shadows) this.renderer.shadowMap.needsUpdate = true;
  }

  /* ---------------- 建模 ---------------- */

  buildAll() {
    const { data, M, scene } = this;
    for (const g of Object.values(this.groups)) { scene.remove(g); disposeGroup(g); }
    this.groups = {};

    const shell = buildShell(data, M);
    this.shell = shell;
    this.groups.shell = shell.root;
    scene.add(shell.root);

    const fixed = buildFixedCeiling(data, M);
    this.groups.fixedCeiling = fixed.group;
    this.groups.foyerCeiling = fixed.foyer;
    scene.add(fixed.group, fixed.foyer);
    this.lighting.setLights('fixed', fixed.lights);

    this.groups.living = new THREE.Group();
    this.groups.master = new THREE.Group();
    this.groups.curtains = new THREE.Group();
    this.groups.furniture = new THREE.Group();
    this.groups.furniture.name = 'furniture';
    scene.add(this.groups.living, this.groups.master, this.groups.curtains, this.groups.furniture);

    this.rebuildLiving(false);
    this.rebuildMaster(false);
    this.rebuildFurniture(false);
    this.invalidate(true);
  }

  rebuildLiving(apply = true) {
    const g = this.groups.living;
    disposeGroup(g);
    const built = buildLivingCeiling(this.data, this.M, this.state.option);
    g.add(built.group);
    this.livingInfo = built.info;
    this.lighting.setLights('living', built.lights);
    // 客厅窗帘的顶跟着阳台端边吊底走
    const cg = this.groups.curtains;
    disposeGroup(cg);
    cg.add(buildCurtains(this.data, this.M, { livingBand: built.info.endUnder }));
    cg.visible = this.state.show.curtains;
    if (apply) {
      this.applyLights();
      if (this.annotations) this.annotations.rebuild();
    }
  }

  rebuildMaster(apply = true) {
    const g = this.groups.master;
    disposeGroup(g);
    const built = buildMasterCeiling(this.data, this.M, this.state.masterBeam);
    g.add(built.group);
    this.masterInfo = built.info;
    this.lighting.setLights('master', built.lights);
    if (apply) {
      this.applyLights();
      if (this.annotations) this.annotations.rebuild();
    }
  }

  rebuildFurniture(apply = true) {
    const g = this.groups.furniture;
    disposeGroup(g);
    const lights = [];
    for (const item of this.data.furniture) {
      const obj = buildItem(item, this.M);
      if (item.type === 'frames' && !this.state.show.frames) obj.visible = false;
      if (obj.userData.lights) lights.push(...obj.userData.lights);
      g.add(obj);
    }
    g.visible = this.state.show.furniture;
    this.lighting.setLights('furniture', lights);
    if (apply) this.applyLights();
  }

  /** 只重建一件家具（编辑时用） */
  rebuildItem(item) {
    const g = this.groups.furniture;
    const old = g.children.find((c) => c.userData.item === item);
    if (old) {
      g.remove(old);
      old.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    const obj = buildItem(item, this.M);
    if (item.type === 'frames' && !this.state.show.frames) obj.visible = false;
    g.add(obj);
    const lights = [];
    for (const c of g.children) if (c.userData.lights) lights.push(...c.userData.lights);
    this.lighting.setLights('furniture', lights);
    this.applyLights();
    return obj;
  }

  /* ---------------- 状态 ---------------- */

  applyLights() {
    const opt = this.data.ceiling.living.options[this.state.option];
    this.lighting.exposureBias = this.state.exposure;
    this.lighting.apply({
      scene: this.state.scene,
      general: this.state.general,
      outside: this.outside,
      hasSpots: opt.spotZ != null,
    });
    this.invalidate(true);
  }

  setOption(key) {
    if (!this.data.ceiling.living.options[key]) return;
    this.state.option = key;
    this.rebuildLiving();
    this.emit('state');
  }

  setScene(key) {
    if (!this.data.scenes[key]) return;
    this.state.scene = key;
    this.applyLights();
    this.emit('state');
  }

  setMasterBeam(deg) {
    this.state.masterBeam = deg;
    this.rebuildMaster();
    this.emit('state');
  }

  setGeneral(on) {
    this.state.general = on;
    this.applyLights();
    this.emit('state');
  }

  setExposure(stops) {
    this.state.exposure = stops;
    this.applyLights();
  }

  setShow(key, value) {
    const s = this.state.show;
    s[key] = value;
    if (key === 'furniture') this.groups.furniture.visible = value;
    if (key === 'curtains') this.groups.curtains.visible = value;
    if (key === 'frames') {
      for (const c of this.groups.furniture.children) {
        if (c.userData.item.type === 'frames') c.visible = value && !c.userData.item.hidden;
      }
    }
    if (key === 'colourCode') this.M.setColourCode(value);
    if (key === 'dims' || key === 'labels') this.annotations.sync();
    this.invalidate(true);
    this.emit('state');
  }

  setClip(z) {
    this.state.clipZ = z;
    this.clipPlane.constant = z;
    this.renderer.clippingPlanes = z < 2.95 ? [this.clipPlane] : [];
    this.invalidate();
  }

  gotoView(id, animate = true) {
    const preset = this.data.cameras.find((c) => c.id === id);
    if (!preset) return;
    this.state.view = id;
    this.controls.goto(preset, animate);
    this.emit('state');
  }

  /* ---------------- 自动剖切：相机在屋外时，把挡视线的楼板和近侧外墙隐藏 ---------------- */

  updateCutaway() {
    const cam = this.camera.position;
    const H = this.data.heights.ceiling;
    const above = cam.y > H + 0.02;
    const outside = above || cam.x < -0.25 || cam.x > 9.05 || cam.z < -2.0 || cam.z > 10.7;
    let changed = false;
    const set = (obj, vis) => { if (obj.visible !== vis) { obj.visible = vis; changed = true; } };
    const slabMode = this.state.show.slab;
    const showSlab = slabMode === 'auto' ? !above : slabMode;
    set(this.shell.slabs, showSlab);
    set(this.groups.foyerCeiling, showSlab);
    const v = new THREE.Vector3();
    const test = (g) => {
      if (!g.userData.out) return;
      const d = v.copy(cam).sub(g.userData.outAt).dot(g.userData.out);
      set(g, !(outside && d > 0.15));
    };
    for (const g of this.shell.walls.children) test(g);
    test(this.shell.balcony);
    if (outside !== this.outside) {
      this.outside = outside;
      this.applyLights();
      this.annotations.sync();
      this.emit('outside');
    }
    if (changed) this.renderer.shadowMap.needsUpdate = true;
  }

  /** 面板挡住的区域（像素）。画面中心会让到没被挡住的那一块去 */
  setInsets(insets) {
    this.insets = { left: 0, bottom: 0, ...insets };
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const { left = 0, bottom = 0 } = this.insets || {};
    this.renderer.setSize(w, h, false);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.controls.viewAspect = Math.max(0.3, (w - left) / Math.max(1, h - bottom));
    this.controls.viewScaleY = Math.max(0.3, (h - bottom) / h);
    if (left || bottom) this.camera.setViewOffset(w, h, -left / 2, bottom / 2, w, h);
    else this.camera.clearViewOffset();
    this.controls.updateFov();
    this.invalidate();
  }

  /** 截图（PNG dataURL） */
  snapshot() {
    this.updateCutaway();
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/png');
  }
}
