/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          5.11 台灣服飾型錄 — 核心程式碼 (script.js)           ║
 * ║    已修正中文變數錯誤，並整合圓形色塊與白色外框功能            ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

(function() {
  const G_SHEET_API = 'https://docs.google.com/spreadsheets/d/';
  const G_SHEET_POST = '/gviz/tq?tqx=out:json&tq=&sheet=';
  let productData = [];
  let categoryMap = {};
  const elements = {
    currentModel: '',
    currentVariant: ''
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    elements.app = document.getElementById('app');
    elements.breadcrumb = document.getElementById('breadcrumb');
    showLoading(true);
    await fetchData();
    initLightbox();
    buildNav();
    showLoading(false);
    window.addEventListener('hashchange', router);
    router();
  }

  async function fetchData() {
    const url = `${G_SHEET_API}${CONFIG.SHEET_ID}${G_SHEET_POST}${CONFIG.SHEET_PRODUCTS}`;
    try {
      const response = await fetch(url);
      const text = await response.text();
      const json = JSON.parse(text.slice(47, -2));
      parseSheetData(json);
    } catch (e) {
      showError('讀取 Google Sheet 資料失敗，請檢查網址與權限。');
    }
  }

  function parseSheetData(json) {
    const cols = json.table.cols.map(c => c.label.toLowerCase().replace(/\s/g, ''));
    json.table.rows.forEach(r => {
      const p = {};
      r.c.forEach((val, i) => { if(cols[i]) p[cols[i]] = val ? val.v : ''; });
      if (!p.main_category || !p.product_name) return;

      p.color_dots = [];
      if (p.variants) {
        p.variants.split(',').forEach(v => {
          let name = v.trim();
          let hex = '#5a5c5f';
          const match = name.match(/#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})/);
          if (match) {
            hex = match[0];
            name = name.replace(hex, '').trim();
          }
          p.color_dots.push({ n: name, s: hex });
        });
      }
      productData.push(p);
      const main = p.main_category.trim();
      const sub = p.sub_category ? p.sub_category.trim() : '其他';
      if (!categoryMap[main]) categoryMap[main] = { subs: {} };
      if (!categoryMap[main].subs[sub]) categoryMap[main].subs[sub] = 0;
      categoryMap[main].subs[sub]++;
    });
  }

  function router() {
    elements.app.innerHTML = '';
    const hash = window.location.hash.slice(2);
    const path = hash.split('/').map(v => decodeURIComponent(v));
    if (!hash || path[0] === '') renderHomePage();
    else if (path.length === 2) renderCategoryPage(path[0], path[1]);
    else if (path.length > 2) renderProductDetailPage(path[2]);
    else renderMainPage(path[0]);
  }

  function renderProductDetailPage(id) {
    const p = productData.find(v => v.item_num == id);
    if (!p) return;
    const div = document.createElement('div');
    div.className = 'product-detail fade-in';
    let varsHTML = p.color_dots.map(v => `
      <button class="color-btn" data-model="${p.product_name}" data-variant="${v.n}">
        <div class="color-btn-swatch" style="background-color:${v.s}"></div>
        ${v.n}
      </button>`).join('');
    
    div.innerHTML = `
      <div><img src="${p.images.split(',')[0]}"></div>
      <div>
        <h1>${p.product_name}</h1>
        <div class="color-options">${varsHTML}</div>
        <a id="ask-btn" href="#" class="btn-fb">前往 FB 粉專詢問</a>
      </div>
    `;
    elements.app.appendChild(div);
    document.getElementById('ask-btn').addEventListener('click', (e) => {
      e.preventDefault();
      const text = encodeURIComponent(`我想詢問: ${p.product_name} | 顏色: ${elements.currentVariant}`);
      location.href = `${CONFIG.FB_URL}?text=${text}`;
    });
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('.color-btn');
    if (btn) {
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      elements.currentVariant = btn.dataset.variant;
    }
  });

  function showLoading(b) { document.getElementById('loading-screen').style.display = b ? 'flex' : 'none'; }
  function showError(msg) { elements.app.innerHTML = `<p>${msg}</p>`; }
  function renderHomePage() { elements.app.innerHTML = '<h1>目錄</h1>' + Object.keys(categoryMap).map(m => `<a href="#/${m}">${m}</a>`).join(''); }
  function renderMainPage(m) { elements.app.innerHTML = `<h1>${m}</h1>` + Object.keys(categoryMap[m].subs).map(s => `<a href="#/${m}/${s}">${s}</a>`).join(''); }
  function renderCategoryPage(m, s) { elements.app.innerHTML = `<h1>${s}</h1>` + productData.filter(p=>p.main_category==m && p.sub_category==s).map(p => `<a href="#/${m}/${s}/${p.item_num}">${p.product_name}</a>`).join(''); }
  function buildNav() { document.querySelector('.footer-brand').innerText = CONFIG.SITE_NAME; }
  function initLightbox() {}
})();
