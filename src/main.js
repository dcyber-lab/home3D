// 入口：读数据 → 套用本机保存的改动 → 建场景 → 建界面。
import { App } from './app.js';
import { initUI } from './ui.js';
import { loadEdits } from './editor.js';

async function start() {
  const loading = document.getElementById('loading');
  try {
    const res = await fetch('data/home.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('读不到 data/home.json（' + res.status + '）');
    const base = await res.json();
    const data = loadEdits(base);
    const app = new App(document.getElementById('scene'), document.getElementById('labels'), data);
    app.baseData = base;
    window.app = app;                 // 方便在控制台里调试
    initUI(app);
    loading.remove();
  } catch (err) {
    console.error(err);
    loading.innerHTML = '<p class="error">模型没能加载：' + String(err.message || err) +
      '</p><p class="hint">如果是直接双击打开的 index.html，请改用本地服务器（例如 <code>python3 -m http.server</code>）。</p>';
  }
}

start();
