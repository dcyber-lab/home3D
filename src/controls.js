// 相机：两种操作方式。
//   环绕（orbit）：从外面看全屋，拖动旋转、滚轮缩放、右键平移。
//   漫游（walk） ：站在屋里看，拖动转头、滚轮/WASD 走动、双击地面走过去。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { V } from './geo.js';

const DEG = Math.PI / 180;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class ViewControls {
  constructor(camera, dom, onChange) {
    this.camera = camera;
    this.dom = dom;
    this.onChange = onChange;
    this.mode = 'orbit';
    this.hfov = null;               // 漫游视角用水平视角；环绕用竖直视角
    this.vfov = 40;
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.tween = null;
    this.blocked = false;           // 编辑器拖家具时暂停相机操作
    this.pointers = new Map();
    this.pinch = 0;
    this.onModeChange = () => {};
    camera.rotation.order = 'YXZ';

    this._bindWalk();
    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.12;
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.03;
    this.orbit.minDistance = 0.6;
    this.orbit.maxDistance = 70;
    this.orbit.zoomToCursor = true;
    this.orbit.addEventListener('change', () => this.onChange());
  }

  setBlocked(b) {
    this.blocked = b;
    this.orbit.enabled = !b && this.mode === 'orbit' && !this.tween;
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === 'walk') this._syncAngles();
    this.orbit.enabled = mode === 'orbit' && !this.blocked;
    this.onModeChange(mode);
  }

  _syncAngles() {
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
  }

  _applyAngles() {
    this.pitch = Math.max(-88 * DEG, Math.min(88 * DEG, this.pitch));
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.onChange();
  }

  /** 根据窗口比例重新算竖直视角 */
  updateFov() {
    const cam = this.camera;
    // 视角按“没被面板挡住的那块区域”来算
    const aspect = this.viewAspect || cam.aspect;
    let v;
    if (this.hfov) {
      v = 2 * Math.atan(Math.tan((this.hfov * DEG) / 2) / aspect) / DEG;
      v = Math.max(32, Math.min(86, v));
    } else {
      v = aspect < 1 ? Math.min(72, this.vfov / Math.max(aspect, 0.5)) : this.vfov;
    }
    const k = this.viewScaleY || 1;         // 可见高度 / 画布高度
    cam.fov = Math.min(115, 2 * Math.atan(Math.tan((v * DEG) / 2) / k) / DEG);
    cam.updateProjectionMatrix();
  }

  /** 跳到一个预设视角。preset: { mode, pos:[x,y,z], target:[x,y,z], hfov | fov } （文档坐标） */
  goto(preset, animate = true) {
    const pos = V(...preset.pos);
    const target = V(...preset.target);
    this.setMode(preset.mode || 'walk');
    this.hfov = preset.hfov || null;
    this.vfov = preset.fov || 40;
    const fromFov = this.camera.fov;
    this.updateFov();
    const toFov = this.camera.fov;
    this.flyTo(pos, target, animate ? 0.9 : 0, fromFov, toFov);
  }

  flyTo(pos, target, duration = 0.8, fromFov = this.camera.fov, toFov = this.camera.fov) {
    const cam = this.camera;
    const m = new THREE.Matrix4().lookAt(pos, target, new THREE.Vector3(0, 1, 0));
    // 正上方往下看时 lookAt 会退化，换一个 up
    if (Math.abs(pos.x - target.x) < 1e-6 && Math.abs(pos.z - target.z) < 1e-6) m.lookAt(pos, target, new THREE.Vector3(0, 0, -1));
    const q1 = new THREE.Quaternion().setFromRotationMatrix(m);
    const done = () => {
      cam.position.copy(pos);
      cam.quaternion.copy(q1);
      cam.fov = toFov;
      cam.updateProjectionMatrix();
      this.orbit.target.copy(target);
      if (this.mode === 'walk') this._syncAngles();
      this.tween = null;
      this.orbit.enabled = this.mode === 'orbit' && !this.blocked;
      if (this.mode === 'orbit') this.orbit.update();
      this.onChange();
    };
    if (duration <= 0) { done(); return; }
    this.orbit.enabled = false;
    this.tween = { start: performance.now(), duration, p0: cam.position.clone(), q0: cam.quaternion.clone(), p1: pos, q1, f0: fromFov, f1: toFov, done };
  }

  /** 每帧调用 */
  update(dt) {
    const cam = this.camera;
    if (this.tween) {
      // 按真实时间走：机器慢的时候跳帧，不拖慢动作
      const tw = this.tween;
      const t = (performance.now() - tw.start) / 1000 / tw.duration;
      if (t >= 1) { tw.done(); return; }
      const k = ease(t);
      cam.position.lerpVectors(tw.p0, tw.p1, k);
      cam.quaternion.slerpQuaternions(tw.q0, tw.q1, k);
      cam.fov = tw.f0 + (tw.f1 - tw.f0) * k;
      cam.updateProjectionMatrix();
      this.onChange();
      return;
    }
    if (this.mode === 'orbit') {
      this.orbit.update();
      return;
    }
    if (this.keys.size) {
      const sp = (this.keys.has('shift') ? 3.2 : 1.6) * dt;
      const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const mv = new THREE.Vector3();
      if (this.keys.has('w') || this.keys.has('arrowup')) mv.add(f);
      if (this.keys.has('s') || this.keys.has('arrowdown')) mv.sub(f);
      if (this.keys.has('d')) mv.add(r);
      if (this.keys.has('a')) mv.sub(r);
      if (this.keys.has('e')) mv.y += 1;
      if (this.keys.has('q')) mv.y -= 1;
      let turned = false;
      if (this.keys.has('arrowleft')) { this.yaw += 1.4 * dt; turned = true; }
      if (this.keys.has('arrowright')) { this.yaw -= 1.4 * dt; turned = true; }
      if (mv.lengthSq() > 0) {
        cam.position.addScaledVector(mv.normalize(), sp);
        cam.position.y = Math.max(0.25, Math.min(2.55, cam.position.y));
        this.onChange();
      }
      if (turned) this._applyAngles();
    }
  }

  /** 漫游时沿视线水平方向前进 dist 米 */
  walkForward(dist) {
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.camera.position.addScaledVector(f, dist);
    this.onChange();
  }

  /** 走到地面上的一点（保持视线方向和眼睛高度） */
  walkTo(point) {
    const cam = this.camera;
    const pos = new THREE.Vector3(point.x, Math.max(1.2, Math.min(1.7, cam.position.y)), point.z);
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    this.flyTo(pos, pos.clone().add(dir), 0.7);
  }

  _bindWalk() {
    const dom = this.dom;
    dom.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'walk' || this.blocked || this.tween) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) this.pinch = this._pinchDist();
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (this.mode !== 'walk' || !this.pointers.has(e.pointerId) || this.blocked) return;
      const p = this.pointers.get(e.pointerId);
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 1) {
        const k = (this.camera.fov * DEG) / dom.clientHeight;
        this.yaw += dx * k;
        this.pitch += dy * k;
        this._applyAngles();
      } else if (this.pointers.size === 2) {
        const d = this._pinchDist();
        this.walkForward((d - this.pinch) * 0.006);
        this.pinch = d;
      }
    });
    const up = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 2) this.pinch = this._pinchDist();
    };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', (e) => {
      if (this.mode !== 'walk' || this.tween) return;
      e.preventDefault();
      const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      this.walkForward(-delta * 0.0018);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'q', 'e', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        if (this.mode === 'walk') {
          this.keys.add(k);
          if (k.startsWith('arrow')) e.preventDefault();
          this.onChange();
        }
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _pinchDist() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  get busy() {
    return !!this.tween || (this.mode === 'walk' && this.keys.size > 0);
  }
}
