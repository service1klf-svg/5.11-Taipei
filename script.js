/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         5.11 台灣服飾型錄 — 主程式 (script.js)              ║
 * ║  讀取 Google Sheet → 渲染頁面 → 處理互動                     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════
//  快取：把抓到的資料存起來，避免重複請求
// ═══════════════════════════════════════════════════════════════
let cachedProducts = null;

/**
 * 把 Google Sheets GViz JSON 格式轉成普通陣列
 * Google Sheets 回傳：google.visualization.Query.setResponse({...})
 */
function parseGViz(raw) {
  const json = JSON.parse(raw.replace(/^[^(]+\(/, '').replace(/\);?\s*$/, ''));
  const cols = json.table.cols.map(c => c.label || c.id);
  const rows = json.table.rows || [];

  return rows.map(row => {
    const obj = {};
    cols.forEach((col, i) => {
      const cell = row.c && row.c[i];
      obj[col] = (cell && cell.v !== null && cell.v !== undefined)
        ? String(cell.v).trim()
        : '';
    });
    return obj;
  }).filter(row => row.model || row.name); // 過濾空列
}

/**
 * 從 Google Sheet 抓商品資料（有快取就直接用）
 */
async function loadProducts() {
  if (cachedProducts) return cachedProducts;

  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(CONFIG.SHEET_PRODUCTS)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`無法讀取工作表（狀態碼 ${resp.status}）`);
  const text = await resp.text();
  cachedProducts = parseGViz(text);
  return cachedProducts;
}

/**
 * 依 model 把多個顏色的列合併成單一商品物件
 * 回傳：{ model, name, main_category, sub_category, material, description, variants[] }
 * 每個 variant：{ color, imgs[] }
 */
function groupByModel(products) {
  const map = new Map();

  products.forEach(row => {
    const model = (row.model || '').trim();
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

    // 蒐集圖片 img1～img10
    const imgs = [];
    for (let i = 1; i <= 10; i++) {
      const url = (row[`img${i}`] || '').trim();
      if (url) imgs.push(url);
    }

    map.get(model).variants.push({
      color: (row.color || '').trim(),
      imgs,
    });
  });

  return Array.from(map.values());
}

/**
 * 顏色名稱 → 近似 CSS 色碼（用於顯示色塊）
 */
const COLOR_MAP = {
  '黑色': '#111', '黑': '#111', 'black': '#111',
  '白色': '#f0f0f0', '白': '#f0f0f0', 'white': '#f0f0f0',
  '深藍': '#1a3a5c', '海軍藍': '#1a2f4e', '藍色': '#2155a0', '藍': '#2155a0', 'navy': '#1a2f4e',
  '灰色': '#666', '深灰': '#444', '淺灰': '#aaa', '灰': '#666',
  '橘色': '#e85d04', '橘': '#e85d04',
  '棕色': '#5a3e28', '棕': '#5a3e28', '沙色': '#c4a882', '土色': '#7a6040',
  '綠色': '#2d5a27', '深綠': '#1a3a1a', '橄欖': '#4f5320', '軍綠': '#4b5320',
  '紅色': '#8b1a1a', '紅': '#8b1a1a',
  '卡其': '#c4a048', '卡其色': '#c4a048',
  '紫色': '#5a2d82', '紫': '#5a2d82',
  '黃色': '#d4a800', '黃': '#d4a800',
};
function colorToCSS(name) {
  const lc = (name || '').toLowerCase().trim();
  for (const [key, val] of Object.entries(COLOR_MAP)) {
    if (lc.includes(key.toLowerCase())) return val;
  }
  return '#4a4a4a';
}

/** 安全顯示 HTML，防止 XSS */
function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════════
//  Router（Hash 路由）
//  #/           → 首頁
//  #/cat/tops   → 小分類列表
//  #/list/tops/襯衫 → 商品列表
//  #/product/72175  → 商品詳細
// ═══════════════════════════════════════════════════════════════
window.addEventListener('hashchange', () => App.route());

// ═══════════════════════════════════════════════════════════════
//  App 主程式
// ═══════════════════════════════════════════════════════════════
const App = {
  $app: null,

  init() {
    this.$app = document.getElementById('app');
    const footerFb = document.getElementById('footer-fb-link');
    if (footerFb) footerFb.href = CONFIG.FB_URL;
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
    const hash = location.hash.replace(/^#/, '') || '/';
    const parts = hash.split('/').filter(Boolean);
    const page = parts[0] || '';

    try {
      if (!page)              await this.renderHome();
      else if (page === 'cat')     await this.renderCategory(parts[1] || '');
      else if (page === 'list')    await this.renderProductList(parts[1] || '', decodeURIComponent(parts[2] || ''));
      else if (page === 'product') await this.renderProductDetail(decodeURIComponent(parts[1] || ''));
      else                         await this.renderHome();
    } catch (err) {
      console.error(err);
      this.showError(err.message);
    }
    window.scrollTo(0, 0);
  },

  // ──────────────────────────────────────────────────────────────
  //  頁面 1：首頁（大分類卡片）
  // ──────────────────────────────────────────────────────────────
  async renderHome() {
    this.showLoading();
    const products = await loadProducts();

    // 計算各大分類商品數
    const countMap = {};
    groupByModel(products).forEach(p => {
      countMap[p.main_category] = (countMap[p.main_category] || 0) + 1;
    });

    this.setBreadcrumb([]);

    const cards = CONFIG.CATEGORIES.map(cat => {
      const count = countMap[cat.name] || 0;
      return `
        <a class="cat-card fade-in" href="#/cat/${esc(cat.id)}">
          <div class="cat-card-icon">${cat.icon}</div>
          <div class="cat-card-name">${esc(cat.name)}</div>
          <div class="cat-card-en">${esc(cat.nameEn)}</div>
          <div class="cat-card-count">${count > 0 ? `${count} 項商品` : '即將上架'}</div>
          <span class="cat-card-arrow">›</span>
        </a>`;
    }).join('');

    this.$app.innerHTML = `
      <div class="home-header fade-in">
        <h1>商品<br>型錄</h1>
        <p>PRODUCT CATALOG</p>
      </div>
      <div class="category-grid">${cards}</div>`;
  },

  // ──────────────────────────────────────────────────────────────
  //  頁面 2：小分類列表
  // ──────────────────────────────────────────────────────────────
  async renderCategory(catId) {
    this.showLoading();
    const products = await loadProducts();

    const cat = CONFIG.CATEGORIES.find(c => c.id === catId);
    if (!cat) { await this.renderHome(); return; }

    // 計算各小分類商品數
    const subCount = {};
    groupByModel(products.filter(p => p.main_category === cat.name))
      .forEach(p => { subCount[p.sub_category] = (subCount[p.sub_category] || 0) + 1; });

    this.setBreadcrumb([{ label: cat.name, href: `#/cat/${catId}` }]);

    const cards = cat.subs.map(sub => `
      <a class="sub-card fade-in" href="#/list/${esc(catId)}/${encodeURIComponent(sub)}">
        <span class="sub-card-name">${esc(sub)}</span>
        <span class="sub-card-count">${subCount[sub] || '—'}</span>
      </a>`).join('');

    this.$app.innerHTML = `
      <button class="back-btn" onclick="history.back()">返回分類</button>
      <div class="page-title fade-in">${esc(cat.name)} <span>${esc(cat.nameEn)}</span></div>
      <div class="page-subtitle">選擇小分類</div>
      <div class="sub-grid">${cards}</div>`;
  },

  // ──────────────────────────────────────────────────────────────
  //  頁面 3：商品列表
  // ──────────────────────────────────────────────────────────────
  async renderProductList(catId, subName) {
    this.showLoading();
    const products = await loadProducts();

    const cat = CONFIG.CATEGORIES.find(c => c.id === catId);
    const catName = cat ? cat.name : catId;

    const grouped = groupByModel(
      products.filter(p => p.main_category === catName && p.sub_category === subName)
    );

    this.setBreadcrumb([
      { label: catName, href: `#/cat/${catId}` },
      { label: subName }
    ]);

    if (grouped.length === 0) {
      this.$app.innerHTML = `
        <button class="back-btn" onclick="history.back()">返回</button>
        <div class="page-title fade-in">${esc(subName)}</div>
        <div class="empty-state"><p>此分類尚無商品</p></div>`;
      return;
    }

    const cards = grouped.map(p => {
      const firstVariant = p.variants[0] || {};
      const imgSrc = firstVariant.imgs?.[0] || '';

      // 顏色色塊
      const dots = p.variants
        .filter(v => v.color)
        .map(v => `<span class="color-dot" style="background:${colorToCSS(v.color)}" title="${esc(v.color)}"></span>`)
        .join('');
      const colorLabel = p.variants.filter(v => v.color).map(v => esc(v.color)).join(' / ');

      return `
        <a class="product-card fade-in" href="#/product/${encodeURIComponent(p.model)}">
          <div class="product-card-img-wrap">
            ${imgSrc
              ? `<img src="${esc(imgSrc)}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
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
      <div class="page-title fade-in">${esc(subName)}</div>
      <div class="page-subtitle">${grouped.length} 項商品</div>
      <div class="product-grid">${cards}</div>`;
  },

  // ──────────────────────────────────────────────────────────────
  //  頁面 4：商品詳細頁
  // ──────────────────────────────────────────────────────────────
  async renderProductDetail(model) {
    this.showLoading();
    const products = await loadProducts();

    const product = groupByModel(products).find(p => p.model === model);
    if (!product) {
      this.$app.innerHTML = `
        <button class="back-btn" onclick="history.back()">返回</button>
        <div class="error-box"><h3>找不到商品 ${esc(model)}</h3></div>`;
      return;
    }

    const cat = CONFIG.CATEGORIES.find(c => c.name === product.main_category);
    const catId = cat ? cat.id : '';
    this.setBreadcrumb([
      { label: product.main_category, href: `#/cat/${catId}` },
      { label: product.sub_category,  href: `#/list/${catId}/${encodeURIComponent(product.sub_category)}` },
      { label: product.model }
    ]);

    // 詳細頁的狀態
    let activeColorIdx = 0;
    let activeImg = product.variants[0]?.imgs[0] || '';

    const render = () => {
      const variant = product.variants[activeColorIdx] || product.variants[0];
      const imgs = variant.imgs || [];
      window.lightboxImgs = imgs;

      // 主圖
      const mainImgHtml = activeImg
        ? `<img src="${esc(activeImg)}" alt="${esc(product.name)}" onerror="this.style.opacity=0.2">`
        : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:64px;opacity:0.15">📦</div>`;

      // 縮圖列
      const thumbs = imgs.map((url, i) => `
        <img class="thumb-item ${url === activeImg ? 'active' : ''}"
             src="${esc(url)}" alt="圖 ${i+1}" loading="lazy"
             onclick="App.selectImg('${esc(url)}')"
             onerror="this.style.display='none'" />`).join('');

      // 顏色按鈕
      const colorBtns = product.variants.map((v, i) => `
        <button class="color-btn ${i === activeColorIdx ? 'active' : ''}"
                onclick="App.selectColor(${i})">
          <span class="color-btn-swatch" style="background:${colorToCSS(v.color)}"></span>
          ${esc(v.color || '標準色')}
        </button>`).join('');

      // 材質
      const materialHtml = product.material
        ? `<div class="divider"></div>
           <div class="label">材質</div>
           <p class="material-text">${esc(product.material)}</p>`
        : '';

      // 描述
      const descHtml = product.description
        ? `<div class="divider"></div>
           <div class="label">商品說明</div>
           <p class="description-text">${esc(product.description)}</p>`
        : '';

      document.getElementById('detail-inner').innerHTML = `
        <!-- 左：圖片 -->
        <div class="product-images">
          <div class="main-img-wrap" onclick="Lightbox.open(window.lightboxImgs, 0)">
            ${mainImgHtml}
          </div>
          <div class="thumb-list">${thumbs}</div>
        </div>

        <!-- 右：資訊 -->
        <div class="product-info">
          <div class="product-info-model">${esc(product.model)}</div>
          <div class="product-info-name">${esc(product.name)}</div>

          ${product.variants.length > 0 ? `
            <div class="label">顏色</div>
            <div class="color-options">${colorBtns}</div>
          ` : ''}

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

    // 切換顏色
    this.selectColor = (idx) => {
      activeColorIdx = idx;
      activeImg = product.variants[idx]?.imgs[0] || '';
      render();
    };
    // 切換圖片
    this.selectImg = (url) => {
      activeImg = url;
      render();
    };
  },

  // 設定麵包屑
  setBreadcrumb(items) {
    const $bc = document.getElementById('breadcrumb');
    if (!$bc) return;
    if (!items.length) { $bc.innerHTML = ''; return; }
    const parts = [
      `<a href="#/">首頁</a>`,
      ...items.map((item, i) => {
        const isLast = i === items.length - 1;
        return `<span class="sep">›</span>` +
          (isLast || !item.href
            ? `<span class="current">${esc(item.label)}</span>`
            : `<a href="${esc(item.href)}">${esc(item.label)}</a>`);
      })
    ];
    $bc.innerHTML = parts.join('');
  }
};

// ═══════════════════════════════════════════════════════════════
//  Lightbox 燈箱
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

  open(imgs, idx = 0) {
    this.imgs = imgs || [];
    if (!this.imgs.length) return;
    this.idx = idx;
    this.show();
    document.getElementById('lightbox').classList.add('active');
    document.getElementById('lightbox-overlay').classList.add('active');
  },

  close() {
    document.getElementById('lightbox').classList.remove('active');
    document.getElementById('lightbox-overlay').classList.remove('active');
  },

  move(dir) {
    this.idx = (this.idx + dir + this.imgs.length) % this.imgs.length;
    this.show();
  },

  show() {
    document.getElementById('lightbox-img').src = this.imgs[this.idx];
    const counter = document.getElementById('lightbox-counter');
    counter.textContent = this.imgs.length > 1 ? `${this.idx + 1} / ${this.imgs.length}` : '';
    const showArrow = this.imgs.length > 1;
    document.getElementById('lightbox-prev').style.display = showArrow ? '' : 'none';
    document.getElementById('lightbox-next').style.display = showArrow ? '' : 'none';
  }
};

// ═══════════════════════════════════════════════════════════════
//  啟動
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => App.init());
