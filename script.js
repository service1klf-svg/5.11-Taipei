/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         5.11 台灣服飾型錄 — 主程式 (script.js)              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════
//  快取
// ═══════════════════════════════════════════════════════════════
let cachedProducts  = null;   // 所有商品原始資料
let cachedGrouped   = null;   // 依 model 合併後的商品
let cachedStructure = null;   // 分類結構 { '上衣': ['襯衫','T恤',...], ... }

// ═══════════════════════════════════════════════════════════════
//  資料讀取
// ═══════════════════════════════════════════════════════════════

/** 解析 Google Sheets GViz JSON 回傳格式 */
function parseGViz(raw) {
  const json = JSON.parse(raw.replace(/^[^(]+\(/, '').replace(/\);?\s*$/, ''));
  const cols = json.table.cols.map(c => c.label || c.id);
  return (json.table.rows || []).map(row => {
    const obj = {};
    cols.forEach((col, i) => {
      const cell = row.c?.[i];
      obj[col] = (cell && cell.v != null) ? String(cell.v).trim() : '';
    });
    return obj;
  }).filter(r => r.model || r.name);
}

/** 抓商品資料（有快取就直接用） */
async function loadProducts() {
  if (cachedProducts) return cachedProducts;
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(CONFIG.SHEET_PRODUCTS)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`無法讀取工作表（HTTP ${resp.status}）`);
  cachedProducts = parseGViz(await resp.text());
  return cachedProducts;
}

/**
 * 從原始資料建立分類結構
 * 回傳：{ '上衣': ['襯衫','T恤',...], '外套': ['外套'], ... }
 * 順序依照 Sheet 裡第一次出現的順序
 */
function buildStructure(products) {
  if (cachedStructure) return cachedStructure;
  const structure = {};   // { mainCat: Set(subCats) }
  const mainOrder = [];   // 大分類出現順序

  products.forEach(row => {
    const main = row.main_category?.trim();
    const sub  = row.sub_category?.trim();
    if (!main) return;

    if (!structure[main]) {
      structure[main] = [];
      mainOrder.push(main);
    }
    if (sub && !structure[main].includes(sub)) {
      structure[main].push(sub);
    }
  });

  // 依出現順序重組
  cachedStructure = {};
  mainOrder.forEach(main => { cachedStructure[main] = structure[main]; });
  return cachedStructure;
}

/**
 * 依 model 合併多個顏色列 → 單一商品物件
 * { model, name, main_category, sub_category, material, description, variants[] }
 * variant: { color, imgs[] }
 */
function groupByModel(products) {
  if (cachedGrouped && products === cachedProducts) return cachedGrouped;

  const map = new Map();
  products.forEach(row => {
    const model = row.model?.trim();
    if (!model) return;

    if (!map.has(model)) {
      map.set(model, {
        model,
        name:          row.name          || '',
        main_category: row.main_category || '',
        sub_category:  row.sub_category  || '',
        material:      row.material      || '',
        description:   row.description   || '',
        variants: []
      });
    }
    const imgs = [];
    for (let i = 1; i <= 10; i++) {
      const u = row[`img${i}`]?.trim();
      if (u) imgs.push(u);
    }
    map.get(model).variants.push({ color: row.color?.trim() || '', imgs });
  });

  cachedGrouped = Array.from(map.values());
  return cachedGrouped;
}

// ═══════════════════════════════════════════════════════════════
//  工具
// ═══════════════════════════════════════════════════════════════

/** 顏色名稱 → CSS 色碼 */
const COLOR_MAP = {
  '黑':'#1a1a1a','白':'#f0f0f0','深藍':'#1a3a5c','海軍藍':'#1a2f4e',
  '藍':'#2155a0','navy':'#1a2f4e','灰':'#666','深灰':'#3a3a3a',
  '淺灰':'#aaa','橘':'#e85d04','棕':'#5a3e28','沙':'#c4a882',
  '土':'#7a6040','綠':'#2d5a27','深綠':'#1a3a1a','橄欖':'#4f5320',
  '軍綠':'#4b5320','紅':'#8b1a1a','卡其':'#c4a048','紫':'#5a2d82','黃':'#d4a800',
};
function colorToCSS(name) {
  const lc = (name || '').toLowerCase();
  for (const [k, v] of Object.entries(COLOR_MAP)) {
    if (lc.includes(k.toLowerCase())) return v;
  }
  return '#4a4a4a';
}

/** 防 XSS */
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
                      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════════
//  Router  (#/ | #/cat/上衣 | #/list/上衣/襯衫 | #/product/MODEL)
// ═══════════════════════════════════════════════════════════════
window.addEventListener('hashchange', () => App.route());

// ═══════════════════════════════════════════════════════════════
//  App
// ═══════════════════════════════════════════════════════════════
const App = {
  $app: null,

  init() {
    this.$app = document.getElementById('app');
    const fb = document.getElementById('footer-fb-link');
    if (fb) fb.href = CONFIG.FB_URL;
    Lightbox.init();
    this.route();
  },

  showLoading() {
    this.$app.innerHTML = `
      <div class="loading-screen">
        <div class="loading-spinner"></div>
        <p>載入中...</p>
      </div>`;
  },

  showError(msg) {
    this.$app.innerHTML = `
      <div class="error-box">
        <h3>⚠️ 無法載入資料</h3>
        <p>${esc(msg)}</p>
        <p style="margin-top:12px;font-size:12px;">
          請確認：<br>
          1. config.js 的 SHEET_ID 是否正確<br>
          2. Google Sheet 是否已「發布到網路」<br>
          3. 工作表名稱是否為 products
        </p>
      </div>`;
  },

  async route() {
    const hash  = location.hash.replace(/^#\/?/, '');
    const parts = hash ? hash.split('/') : [];
    const page  = parts[0] || '';

    try {
      if (!page)               await this.renderHome();
      else if (page === 'cat') await this.renderCategory(decodeURIComponent(parts[1] || ''));
      else if (page === 'list') await this.renderProductList(
        decodeURIComponent(parts[1] || ''),
        decodeURIComponent(parts[2] || '')
      );
      else if (page === 'product') await this.renderProductDetail(decodeURIComponent(parts[1] || ''));
      else                         await this.renderHome();
    } catch (err) {
      console.error(err);
      this.showError(err.message);
    }
    window.scrollTo(0, 0);
  },

  // ──────────────────────────────────────────────────────────────
  //  頁面 1：首頁（大分類，從 Sheet 自動讀取）
  // ──────────────────────────────────────────────────────────────
  async renderHome() {
    this.showLoading();
    const products  = await loadProducts();
    const structure = buildStructure(products);
    const grouped   = groupByModel(products);

    // 計算各大分類商品數
    const countMap = {};
    grouped.forEach(p => {
      countMap[p.main_category] = (countMap[p.main_category] || 0) + 1;
    });

    this.setBreadcrumb([]);

    const cards = Object.keys(structure).map(mainCat => {
      const count   = countMap[mainCat] || 0;
      const subCount = structure[mainCat].length;
      return `
        <a class="cat-card fade-in" href="#/cat/${encodeURIComponent(mainCat)}">
          <div class="cat-card-name">${esc(mainCat)}</div>
          <div class="cat-card-meta">${subCount} 個小分類・${count} 項商品</div>
          <span class="cat-card-arrow">›</span>
        </a>`;
    }).join('');

    const isEmpty = Object.keys(structure).length === 0;

    this.$app.innerHTML = `
      <div class="home-header fade-in">
        <h1>商品<br>型錄</h1>
        <p>PRODUCT CATALOG</p>
      </div>
      ${isEmpty
        ? `<div class="empty-state"><p>尚未有商品資料，請先在 Google Sheet 新增商品</p></div>`
        : `<div class="category-grid">${cards}</div>`
      }`;
  },

  // ──────────────────────────────────────────────────────────────
  //  頁面 2：小分類列表（從 Sheet 自動讀取）
  // ──────────────────────────────────────────────────────────────
  async renderCategory(mainCat) {
    this.showLoading();
    const products  = await loadProducts();
    const structure = buildStructure(products);

    if (!structure[mainCat]) { await this.renderHome(); return; }

    const grouped = groupByModel(products.filter(p => p.main_category === mainCat));
    const subCount = {};
    grouped.forEach(p => {
      subCount[p.sub_category] = (subCount[p.sub_category] || 0) + 1;
    });

    this.setBreadcrumb([{ label: mainCat, href: `#/cat/${encodeURIComponent(mainCat)}` }]);

    const cards = structure[mainCat].map(sub => `
      <a class="sub-card fade-in"
         href="#/list/${encodeURIComponent(mainCat)}/${encodeURIComponent(sub)}">
        <span class="sub-card-name">${esc(sub)}</span>
        <span class="sub-card-count">${subCount[sub] || '—'}</span>
      </a>`).join('');

    this.$app.innerHTML = `
      <button class="back-btn" onclick="history.back()">返回分類</button>
      <div class="page-title fade-in">${esc(mainCat)}</div>
      <div class="page-subtitle">選擇小分類</div>
      <div class="sub-grid">${cards}</div>`;
  },

  // ──────────────────────────────────────────────────────────────
  //  頁面 3：商品列表
  // ──────────────────────────────────────────────────────────────
  async renderProductList(mainCat, subCat) {
    this.showLoading();
    const products = await loadProducts();
    const grouped  = groupByModel(
      products.filter(p => p.main_category === mainCat && p.sub_category === subCat)
    );

    this.setBreadcrumb([
      { label: mainCat, href: `#/cat/${encodeURIComponent(mainCat)}` },
      { label: subCat }
    ]);

    if (grouped.length === 0) {
      this.$app.innerHTML = `
        <button class="back-btn" onclick="history.back()">返回</button>
        <div class="page-title fade-in">${esc(subCat)}</div>
        <div class="empty-state"><p>此分類尚無商品</p></div>`;
      return;
    }

    const cards = grouped.map(p => {
      const imgSrc = p.variants[0]?.imgs[0] || '';
      const dots   = p.variants.filter(v => v.color)
        .map(v => `<span class="color-dot" style="background:${colorToCSS(v.color)}" title="${esc(v.color)}"></span>`)
        .join('');
      const colorLabel = p.variants.filter(v => v.color).map(v => esc(v.color)).join(' / ');

      return `
        <a class="product-card fade-in" href="#/product/${encodeURIComponent(p.model)}">
          <div class="product-card-img-wrap">
            ${imgSrc
              ? `<img src="${esc(imgSrc)}" alt="${esc(p.name)}" loading="lazy"
                      onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
              : ''}
            <div class="img-placeholder" style="${imgSrc ? 'display:none' : ''}">📦</div>
          </div>
          <div class="product-card-info">
            <div class="product-card-model">${esc(p.model)}</div>
            <div class="product-card-name">${esc(p.name)}</div>
            ${dots ? `<div class="color-dots">${dots}</div>` : ''}
            ${colorLabel ? `<div class="color-label">${colorLabel}</div>` : ''}
          </div>
        </a>`;
    }).join('');

    this.$app.innerHTML = `
      <button class="back-btn" onclick="history.back()">返回</button>
      <div class="page-title fade-in">${esc(subCat)}</div>
      <div class="page-subtitle">${grouped.length} 項商品</div>
      <div class="product-grid">${cards}</div>`;
  },

  // ──────────────────────────────────────────────────────────────
  //  頁面 4：商品詳細頁
  // ──────────────────────────────────────────────────────────────
  async renderProductDetail(model) {
    this.showLoading();
    const products = await loadProducts();
    const product  = groupByModel(products).find(p => p.model === model);

    if (!product) {
      this.$app.innerHTML = `
        <button class="back-btn" onclick="history.back()">返回</button>
        <div class="error-box"><h3>找不到商品 ${esc(model)}</h3></div>`;
      return;
    }

    const main = product.main_category;
    const sub  = product.sub_category;
    this.setBreadcrumb([
      { label: main, href: `#/cat/${encodeURIComponent(main)}` },
      { label: sub,  href: `#/list/${encodeURIComponent(main)}/${encodeURIComponent(sub)}` },
      { label: product.model }
    ]);

    let activeColorIdx = 0;
    let activeImg = product.variants[0]?.imgs[0] || '';

    const render = () => {
      const variant = product.variants[activeColorIdx] || product.variants[0];
      const imgs    = variant.imgs || [];
      window.lightboxImgs = imgs;

      const mainImgHtml = activeImg
        ? `<img src="${esc(activeImg)}" alt="${esc(product.name)}" onerror="this.style.opacity=0.2">`
        : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:64px;opacity:0.15">📦</div>`;

      const thumbs = imgs.map((url, i) => `
        <img class="thumb-item ${url === activeImg ? 'active' : ''}"
             src="${esc(url)}" alt="圖 ${i+1}" loading="lazy"
             onclick="App.selectImg('${esc(url)}')"
             onerror="this.style.display='none'" />`).join('');

      const colorBtns = product.variants.map((v, i) => `
        <button class="color-btn ${i === activeColorIdx ? 'active' : ''}"
                onclick="App.selectColor(${i})">
          <span class="color-btn-swatch" style="background:${colorToCSS(v.color)}"></span>
          ${esc(v.color || '標準色')}
        </button>`).join('');

      const materialHtml = product.material ? `
        <div class="divider"></div>
        <div class="label">材質</div>
        <p class="material-text">${esc(product.material)}</p>` : '';

      const descHtml = product.description ? `
        <div class="divider"></div>
        <div class="label">商品說明</div>
        <p class="description-text">${esc(product.description)}</p>` : '';

      document.getElementById('detail-inner').innerHTML = `
        <div class="product-images">
          <div class="main-img-wrap" onclick="Lightbox.open(window.lightboxImgs,0)">
            ${mainImgHtml}
          </div>
          <div class="thumb-list">${thumbs}</div>
        </div>

        <div class="product-info">
          <div class="product-info-model">${esc(product.model)}</div>
          <div class="product-info-name">${esc(product.name)}</div>

          ${product.variants.length > 0 ? `
            <div class="label">顏色</div>
            <div class="color-options">${colorBtns}</div>` : ''}

          ${materialHtml}
          ${descHtml}
          <div class="divider"></div>

          <a class="btn-fb" href="${esc(CONFIG.FB_URL)}" target="_blank" rel="noopener">
            📘 ${esc(CONFIG.FB_BUTTON_TEXT)}
          </a>
        </div>`;
    };

    this.$app.innerHTML = `
      <button class="back-btn" onclick="history.back()">返回</button>
      <div class="product-detail fade-in" id="detail-inner"></div>`;

    render();

    this.selectColor = (idx) => {
      activeColorIdx = idx;
      activeImg = product.variants[idx]?.imgs[0] || '';
      render();
    };
    this.selectImg = (url) => { activeImg = url; render(); };
  },

  setBreadcrumb(items) {
    const $bc = document.getElementById('breadcrumb');
    if (!$bc) return;
    if (!items.length) { $bc.innerHTML = ''; return; }
    $bc.innerHTML = [
      `<a href="#/">首頁</a>`,
      ...items.map((item, i) => {
        const isLast = i === items.length - 1;
        return `<span class="sep">›</span>` + (isLast || !item.href
          ? `<span class="current">${esc(item.label)}</span>`
          : `<a href="${esc(item.href)}">${esc(item.label)}</a>`);
      })
    ].join('');
  }
};

// ═══════════════════════════════════════════════════════════════
//  Lightbox
// ═══════════════════════════════════════════════════════════════
const Lightbox = {
  imgs: [], idx: 0,
  init() {
    document.getElementById('lightbox-overlay').addEventListener('click', () => this.close());
    document.getElementById('lightbox-close').addEventListener('click',   () => this.close());
    document.getElementById('lightbox-prev').addEventListener('click',    () => this.move(-1));
    document.getElementById('lightbox-next').addEventListener('click',    () => this.move(1));
    document.addEventListener('keydown', e => {
      if (!document.getElementById('lightbox').classList.contains('active')) return;
      if (e.key === 'ArrowLeft')  this.move(-1);
      if (e.key === 'ArrowRight') this.move(1);
      if (e.key === 'Escape')     this.close();
    });
  },
  open(imgs, idx=0) {
    this.imgs = imgs||[]; if (!this.imgs.length) return;
    this.idx = idx; this.show();
    document.getElementById('lightbox').classList.add('active');
    document.getElementById('lightbox-overlay').classList.add('active');
  },
  close() {
    document.getElementById('lightbox').classList.remove('active');
    document.getElementById('lightbox-overlay').classList.remove('active');
  },
  move(dir) { this.idx = (this.idx+dir+this.imgs.length)%this.imgs.length; this.show(); },
  show() {
    document.getElementById('lightbox-img').src = this.imgs[this.idx];
    document.getElementById('lightbox-counter').textContent =
      this.imgs.length > 1 ? `${this.idx+1} / ${this.imgs.length}` : '';
    const show = this.imgs.length > 1;
    document.getElementById('lightbox-prev').style.display = show ? '' : 'none';
    document.getElementById('lightbox-next').style.display = show ? '' : 'none';
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
