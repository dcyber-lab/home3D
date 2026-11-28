// 入口。
//   index.html：可编辑的页面。读数据 → 套用本机保存的改动 → 建场景 → 建界面。
//   view.html ：给工人的只读页面。只按链接里的令牌显示，不读本机改动，没有任何修改入口。
import { App } from './app.js';
import { initUI } from './ui.js';
import { loadEdits } from './editor.js';
import { decodeShare, applyShare } from './share.js';

const viewMode = document.documentElement.dataset.mode === 'view';

function fail(loading, title, hint) {
  loading.replaceChildren();
  const p = document.createElement('p');
  p.className = 'error';
  p.textContent = title;
  const q = document.createElement('p');
  q.className = 'hint';
  q.textContent = hint;
  loading.append(p, q);
}

async function start() {
  const loading = document.getElementById('loading');
  let payload = null;
  if (viewMode) {
    // 令牌不对就停在这里：不会退回成可编辑的页面，也不会显示成别的方案
    try {
      payload = decodeShare(location.hash.slice(1));
    } catch (err) {
      fail(loading, '这个链接打不开：' + err.message, '请向业主重新要一个完整的链接。');
      return;
    }
    window.addEventListener('hashchange', () => location.reload());
  }
  try {
    const res = await fetch('data/home.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('读不到 data/home.json（' + res.status + '）');
    const base = await res.json();
    let app;
    if (viewMode) {
      let shared;
      try {
        shared = applyShare(base, payload);
      } catch (err) {
        fail(loading, '这个链接打不开：' + err.message, '请向业主重新要一个链接。');
        return;
      }
      app = new App(document.getElementById('scene'), document.getElementById('labels'), shared.data);
      app.baseData = base;
      app.readOnly = true;
      for (const [k, v] of Object.entries(shared.init.show)) if (app.state.show[k] !== v) app.setShow(k, v);
      if (app.state.general !== shared.init.general) app.setGeneral(shared.init.general);
      initUI(app, { readOnly: true, share: shared.info, initView: shared.init.view });
    } else {
      app = new App(document.getElementById('scene'), document.getElementById('labels'), loadEdits(base));
      app.baseData = base;
      initUI(app);
    }
    window.app = app;                 // 方便在控制台里调试
    loading.remove();
  } catch (err) {
    console.error(err);
    fail(loading, '模型没能加载：' + String(err.message || err),
      '如果是直接双击打开的网页文件，请改用本地服务器（例如 python3 -m http.server）。');
  }
}

start();
