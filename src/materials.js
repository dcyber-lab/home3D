// 材质库。所有材质都在这里按名字取，方便全局换色、换地板。
import * as THREE from 'three';

/** 家具可选的面料 / 木色 */
export const FINISHES = {
  leather_black: { label: '黑色皮', color: '#1d1d20', roughness: 0.42 },
  leather_tan:   { label: '棕色皮', color: '#8b5b38', roughness: 0.5 },
  fabric_grey:   { label: '灰色布', color: '#9a9995', roughness: 0.96 },
  fabric_beige:  { label: '米色布', color: '#cfc2ac', roughness: 0.96 },
  fabric_dark:   { label: '深灰布', color: '#4a4b4f', roughness: 0.96 },
  fabric_green:  { label: '墨绿布', color: '#4f6152', roughness: 0.96 },
  fabric_brown:  { label: '深棕布', color: '#5b4336', roughness: 0.96 },
  walnut:        { label: '胡桃木', color: '#6a4731', roughness: 0.55, wood: true },
  oak_light:     { label: '浅橡木', color: '#cdae84', roughness: 0.6, wood: true },
  wood_dark:     { label: '深木色', color: '#40302a', roughness: 0.55, wood: true },
  white:         { label: '白色', color: '#f0eee9', roughness: 0.55 },
  black:         { label: '黑色', color: '#161617', roughness: 0.5 },
  grey:          { label: '灰色', color: '#8d9095', roughness: 0.45, metalness: 0.35 },
  green:         { label: '绿植', color: '#4d7a45', roughness: 0.8 },
  glass:         { label: '玻璃', color: '#cfe0e2', roughness: 0.08, opacity: 0.28 },
  rug_dots:      { label: '黑白点地毯', color: '#efe9dc', roughness: 1 },
  rug_plain:     { label: '素色地毯', color: '#b9b2a6', roughness: 1 },
};

/** 地板可选 */
export const FLOOR_FINISHES = {
  oak_light:  { label: '浅橡木', color: '#d6bb95' },
  oak_honey:  { label: '蜜色橡木', color: '#c39a69' },
  grey_oak:   { label: '灰橡木', color: '#b3aa9c' },
  walnut:     { label: '胡桃木', color: '#7a573d' },
};

/** 墙面可选 */
export const WALL_FINISHES = {
  warm_white: { label: '暖白', color: '#efe9df' },
  cream:      { label: '奶油', color: '#e9dfcc' },
  greige:     { label: '浅灰褐', color: '#d8d0c4' },
  light_grey: { label: '浅灰', color: '#dcdcd9' },
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(w, h, draw, { repeat = true, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 木地板：浅色木板拼缝 + 木纹，颜色靠材质的 color 来染（所以换地板只改颜色） */
function plankTexture() {
  return canvasTexture(1024, 1024, (g, W, H) => {
    const r = rng(7);
    const cols = 16;            // 2 m 宽里 16 条 = 每条 12.5 cm
    const cw = W / cols;
    for (let i = 0; i < cols; i++) {
      const off = Math.floor(r() * H);
      const len = H / 2;        // 每块长 1 m
      for (let k = -2; k < 3; k++) {
        const y0 = off + k * len;
        const tone = 222 + Math.floor(r() * 30);
        const warm = Math.floor(r() * 8);
        g.fillStyle = `rgb(${tone},${tone - 3 - warm},${tone - 10 - warm * 2})`;
        g.fillRect(i * cw, y0, cw, len);
        // 木纹
        for (let n = 0; n < 16; n++) {
          const x = i * cw + r() * cw;
          const a = 0.03 + r() * 0.06;
          g.strokeStyle = `rgba(95,70,45,${a})`;
          g.lineWidth = 0.6 + r() * 1.4;
          g.beginPath();
          let yy = y0;
          g.moveTo(x, yy);
          let xx = x;
          while (yy < y0 + len) {
            yy += 40 + r() * 60;
            xx += (r() - 0.5) * 5;
            g.lineTo(xx, yy);
          }
          g.stroke();
        }
        // 端头拼缝
        g.fillStyle = 'rgba(70,50,35,0.35)';
        g.fillRect(i * cw, y0, cw, 1.5);
      }
      // 长边拼缝
      g.fillStyle = 'rgba(70,50,35,0.3)';
      g.fillRect(i * cw, 0, 1.5, H);
    }
  });
}

/** 通用木纹（家具用），同样靠 color 染色 */
function grainTexture() {
  return canvasTexture(512, 512, (g, W, H) => {
    const r = rng(21);
    g.fillStyle = '#f2ece4';
    g.fillRect(0, 0, W, H);
    for (let n = 0; n < 220; n++) {
      const y = r() * H;
      g.strokeStyle = `rgba(80,55,35,${0.04 + r() * 0.1})`;
      g.lineWidth = 0.5 + r() * 2;
      g.beginPath();
      g.moveTo(0, y);
      let yy = y;
      for (let x = 0; x <= W; x += 32) {
        yy += (r() - 0.5) * 4;
        g.lineTo(x, yy);
      }
      g.stroke();
    }
  });
}

/** 浅灰白大理石纹瓷砖，一张 = 1.2 m，里面是两块 0.6 × 1.2 */
function marbleTexture() {
  return canvasTexture(1024, 1024, (g, W, H) => {
    const r = rng(3);
    g.fillStyle = '#eceae6';
    g.fillRect(0, 0, W, H);
    for (let n = 0; n < 26; n++) {
      let x = r() * W, y = r() * H;
      const a = 0.05 + r() * 0.12;
      g.strokeStyle = `rgba(120,122,126,${a})`;
      g.lineWidth = 0.6 + r() * 3.2;
      g.beginPath();
      g.moveTo(x, y);
      const dir = r() * Math.PI * 2;
      for (let k = 0; k < 9; k++) {
        x += Math.cos(dir + (r() - 0.5) * 1.4) * (40 + r() * 70);
        y += Math.sin(dir + (r() - 0.5) * 1.4) * (40 + r() * 70);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(150,150,150,0.55)';
    g.fillRect(0, 0, 2, H);
    g.fillRect(W / 2, 0, 2, H);
    g.fillRect(0, 0, W, 2);
  });
}

/** 普通方砖，颜色在调用处染 */
function tileTexture(seed = 5) {
  return canvasTexture(256, 256, (g, W, H) => {
    const r = rng(seed);
    g.fillStyle = '#f4f4f2';
    g.fillRect(0, 0, W, H);
    for (let n = 0; n < 900; n++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.035})`;
      g.fillRect(r() * W, r() * H, 3, 3);
    }
    g.fillStyle = 'rgba(90,90,90,0.5)';
    g.fillRect(0, 0, W, 2);
    g.fillRect(0, 0, 2, H);
  });
}

/** 长虹玻璃：竖条纹 */
function flutedTexture() {
  return canvasTexture(256, 8, (g, W, H) => {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const x0 = (i / n) * W;
      const grad = g.createLinearGradient(x0, 0, x0 + W / n, 0);
      grad.addColorStop(0, '#9fb0b0');
      grad.addColorStop(0.5, '#f4fbfa');
      grad.addColorStop(1, '#8c9c9c');
      g.fillStyle = grad;
      g.fillRect(x0, 0, W / n + 1, H);
    }
  });
}

export class Materials {
  constructor() {
    this.cache = new Map();
    this.tex = {};
    this.floorFinish = 'oak_light';
    this.wallFinish = 'warm_white';
    this.colourCode = false;
  }

  texture(name) {
    if (!this.tex[name]) {
      const make = {
        plank: plankTexture,
        grain: grainTexture,
        marble: marbleTexture,
        tile: () => tileTexture(5),
        fluted: flutedTexture,
      }[name];
      this.tex[name] = make();
    }
    return this.tex[name];
  }

  std(params) {
    return new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...params });
  }

  /** 固定用途的材质 */
  get(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    let m;
    switch (name) {
      case 'wall':        m = this.std({ color: WALL_FINISHES[this.wallFinish].color, roughness: 0.94 }); break;
      case 'wall_cap':    m = this.std({ color: '#44464b', roughness: 1 }); break;
      case 'ceiling':     m = this.std({ color: '#f4f2ed', roughness: 0.96 }); break;
      case 'bulk_new':    m = this.std({ color: '#f4f2ed', roughness: 0.96 }); break;
      case 'bulk_old':    m = this.std({ color: '#f4f2ed', roughness: 0.96 }); break;
      case 'base':        m = this.std({ color: '#b5b1aa', roughness: 0.95 }); break;
      case 'floor_wood':  m = this.std({ color: FLOOR_FINISHES[this.floorFinish].color, map: this.texture('plank'), roughness: 0.62 }); break;
      case 'floor_marble': m = this.std({ color: '#ffffff', map: this.texture('marble'), roughness: 0.28 }); break;
      case 'floor_tile':  m = this.std({ color: '#d9d7d1', map: this.texture('tile'), roughness: 0.5 }); break;
      case 'floor_tile_dark': m = this.std({ color: '#a6a39c', map: this.texture('tile'), roughness: 0.5 }); break;
      case 'floor_balcony': m = this.std({ color: '#b9b4aa', map: this.texture('tile'), roughness: 0.8 }); break;
      case 'skirting':    m = this.std({ color: '#3a302a', roughness: 0.6 }); break;
      case 'door_walnut': m = this.std({ color: '#5a3b29', map: this.texture('grain'), roughness: 0.5 }); break;
      case 'door_entry':  m = this.std({ color: '#3a3b3f', roughness: 0.55 }); break;
      case 'door_white':  m = this.std({ color: '#efede8', roughness: 0.6 }); break;
      case 'frame_black': m = this.std({ color: '#1a1a1c', roughness: 0.5, metalness: 0.4 }); break;
      case 'frame_alu':   m = this.std({ color: '#5d6166', roughness: 0.45, metalness: 0.6 }); break;
      case 'metal':       m = this.std({ color: '#b9bbbe', roughness: 0.35, metalness: 0.9 }); break;
      case 'glass':       m = this.std({ color: '#cfe2e6', roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false }); break;
      case 'glass_frosted': m = this.std({ color: '#e8f0f0', roughness: 0.6, transparent: true, opacity: 0.75, depthWrite: false, emissive: '#dfeaf0', emissiveIntensity: 0 }); break;
      case 'glass_fluted': m = this.std({ color: '#dfe8e6', map: this.texture('fluted'), roughness: 0.25, transparent: true, opacity: 0.72, depthWrite: false }); break;
      case 'curtain_sheer': m = this.std({ color: '#f5f3ee', roughness: 1, transparent: true, opacity: 0.9, side: THREE.DoubleSide, emissive: '#fff4e2', emissiveIntensity: 0 }); break;
      case 'curtain_blackout': m = this.std({ color: '#8f8f8e', roughness: 1, side: THREE.DoubleSide }); break;
      case 'led':         m = this.std({ color: '#111111', emissive: '#ffd2a0', emissiveIntensity: 0 }); break;
      case 'led_wash':    m = this.std({ color: '#111111', emissive: '#ffd2a0', emissiveIntensity: 0 }); break;
      case 'led_master':  m = this.std({ color: '#111111', emissive: '#ffd2a0', emissiveIntensity: 0 }); break;
      case 'led_cabinet': m = this.std({ color: '#111111', emissive: '#ffd2a0', emissiveIntensity: 0 }); break;
      case 'spot_trim':   m = this.std({ color: '#f1efea', roughness: 0.5 }); break;
      case 'spot_glow':   m = this.std({ color: '#222222', emissive: '#ffd9a8', emissiveIntensity: 0 }); break;
      case 'spot_glow_master': m = this.std({ color: '#222222', emissive: '#ffd9a8', emissiveIntensity: 0 }); break;
      case 'downlight_glow': m = this.std({ color: '#222222', emissive: '#ffe2bd', emissiveIntensity: 0 }); break;
      case 'hatch':       m = this.std({ color: '#dedbd4', roughness: 0.9 }); break;
      case 'alu_channel': m = this.std({ color: '#e6e6e4', roughness: 0.5 }); break;
      case 'screen':      m = this.std({ color: '#0b0c0e', roughness: 0.2, metalness: 0.2 }); break;
      case 'leaf':        m = this.std({ color: '#5c8f50', roughness: 0.75, side: THREE.DoubleSide }); break;
      case 'leaf_dark':   m = this.std({ color: '#47753f', roughness: 0.75, side: THREE.DoubleSide }); break;
      case 'pot':         m = this.std({ color: '#d8d2c8', roughness: 0.8 }); break;
      case 'bedding':     m = this.std({ color: '#e9e6e0', roughness: 1 }); break;
      case 'pillow':      m = this.std({ color: '#f3f1ec', roughness: 1 }); break;
      case 'mattress':    m = this.std({ color: '#dedad2', roughness: 1 }); break;
      case 'counter_top': m = this.std({ color: '#e7e5e0', roughness: 0.3 }); break;
      case 'steel':       m = this.std({ color: '#a9adb1', roughness: 0.3, metalness: 0.85 }); break;
      case 'ceramic':     m = this.std({ color: '#f6f6f4', roughness: 0.15 }); break;
      case 'art_a':       m = this.std({ color: '#d9d2c4', roughness: 1 }); break;
      case 'art_b':       m = this.std({ color: '#7b5a44', roughness: 1 }); break;
      case 'art_c':       m = this.std({ color: '#2f3a44', roughness: 1 }); break;
      case 'paper':       m = this.std({ color: '#f1eee7', roughness: 1 }); break;
      case 'select':      m = new THREE.LineBasicMaterial({ color: '#ff9f2e', depthTest: false, transparent: true }); break;
      default:
        console.warn('未知材质', name);
        m = this.std({ color: '#ff00ff' });
    }
    m.name = name;
    this.cache.set(name, m);
    return m;
  }

  /** 家具面料：finish:<key> */
  finish(key) {
    const name = 'finish:' + key;
    if (this.cache.has(name)) return this.cache.get(name);
    const f = FINISHES[key] || FINISHES.white;
    const p = { color: f.color, roughness: f.roughness ?? 0.8, metalness: f.metalness ?? 0 };
    if (f.wood) p.map = this.texture('grain');
    if (f.opacity) { p.transparent = true; p.opacity = f.opacity; p.depthWrite = false; }
    const m = this.std(p);
    m.name = name;
    this.cache.set(name, m);
    return m;
  }

  setFloor(key) {
    if (!FLOOR_FINISHES[key]) return;
    this.floorFinish = key;
    this.get('floor_wood').color.set(FLOOR_FINISHES[key].color);
  }

  setWall(key) {
    if (!WALL_FINISHES[key]) return;
    this.wallFinish = key;
    this.get('wall').color.set(WALL_FINISHES[key].color);
  }

  /** 新旧分色：旧边吊灰蓝、新做的暖黄，给施工队看哪块是新做的 */
  setColourCode(on) {
    this.colourCode = on;
    this.get('bulk_old').color.set(on ? '#8fa0b3' : '#f4f2ed');
    this.get('bulk_new').color.set(on ? '#ecd9a6' : '#f4f2ed');
  }
}
