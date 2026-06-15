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

/**
 * CSV 解析：處理引號、逗號、換行等標準 CSV 格式
 * 改用 CSV 而非 GViz JSON，避免型別推斷造成英數混合型號被略過
 */
function parseCSVLine(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(field); field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (values[i] || '').trim(); });
    return obj;
  }).filter(r => r.model || r.name);
}

/** 抓商品資料（改用 CSV 格式，完全無型別推斷問題） */
async function loadProducts() {
  if (cachedProducts) return cachedProducts;
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(CONFIG.SHEET_PRODUCTS)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`無法讀取工作表（HTTP ${resp.status}）`);
  cachedProducts = parseCSV(await resp.text());
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
/**
 * 解析 color 欄位，支援單色與雙色：
 *   單色：「黑色|#1a1a1a」         → 純色色塊
 *   雙色：「黑/軍綠|#1a1a1a|#4b5320」 → 斜切雙色色塊
 *   無色碼：「黑色」               → 預設深灰
 * 回傳 { name, css }，css 可為純色碼或 linear-gradient(...)
 */
function parseColor(raw) {
  const str = (raw || '').trim();
  if (str.includes('|')) {
    const parts = str.split('|').map(s => s.trim());
    const name  = parts[0];
    const c1    = parts[1] || '#4a4a4a';
    const c2    = parts[2] || '';
    // 有第二個色碼 → 斜切漸層
    const css = c2
      ? `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)`
      : c1;
    return { name, css };
  }
  return { name: str, css: '#4a4a4a' };
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

    const render = () => {
      const variant = product.variants[activeColorIdx] || product.variants[0];
      const imgs    = variant.imgs || [];
      window.lightboxImgs = imgs;

      // 滑動器：每張圖一個 item
      const sliderItems = imgs.map((url, i) => `
        <div class="img-slider-item">
          <img src="${esc(url)}"
               alt="${esc(product.name)} 圖${i+1}"
               loading="lazy"
               onerror="this.style.opacity=0.15"
               onclick="Lightbox.open(window.lightboxImgs,${i})" />
        </div>`).join('');

      const sliderHtml = imgs.length > 0
        ? `<div class="img-slider" id="img-slider">
            <div class="img-slider-track" id="img-slider-track">${sliderItems}</div>
            ${imgs.length > 1 ? `
              <button class="slider-btn slider-prev" id="slider-prev">&#8249;</button>
              <button class="slider-btn slider-next" id="slider-next">&#8250;</button>
              <div class="slider-dots">
                ${imgs.map((_,i) => `<span class="slider-dot${i===0?' active':''}" data-idx="${i}"></span>`).join('')}
              </div>` : ''}
           </div>`
        : `<div class="img-slider-empty">📦</div>`;

      const colorBtns = product.variants.map((v, i) => {
        const c = parseColor(v.color);
        return `<button class="color-btn ${i === activeColorIdx ? 'active' : ''}"
                onclick="App.selectColor(${i})">
          <span class="color-btn-swatch" style="background:${c.css}"></span>
          ${esc(c.name || '標準色')}
        </button>`;
      }).join('');

      const materialHtml = product.material ? `
        <div class="divider"></div>
        <div class="label">材質</div>
        <p class="material-text">${esc(product.material)}</p>` : '';

      const descHtml = product.description ? `
        <div class="divider"></div>
        <div class="label">商品說明</div>
        <p class="description-text">${esc(product.description)}</p>` : '';

      // 渲染 HTML 後初始化滑動器
      const _imgs = imgs; // 給 init 用
      document.getElementById('detail-inner').innerHTML = `
        <div class="product-images">
          ${sliderHtml}
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
            ${esc(CONFIG.FB_BUTTON_TEXT)}
          </a>
        </div>`;
      Slider.init(_imgs); // 每次切換顏色都重新初始化
    };

    this.$app.innerHTML = `
      <button class="back-btn" onclick="history.back()">返回</button>
      <div class="product-detail fade-in" id="detail-inner"></div>`;

    render();

    this.selectColor = (idx) => {
      activeColorIdx = idx;
      render(); // render 後 Slider.init 會自動從第一張開始
    };
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
//  Slider（商品詳細頁圖片滑動器）
//  支援：左右箭頭按鈕、指示點、手機觸控滑動、點圖片開燈箱
// ═══════════════════════════════════════════════════════════════
const Slider = {
  imgs: [],
  idx:  0,

  /** 初始化，每次切換顏色或進入商品頁都呼叫 */
  init(imgs) {
    this.imgs = imgs || [];
    this.idx  = 0;
    this._update();
    this._attachEvents();
  },

  /** 往前 / 後移動 */
  move(dir) {
    if (!this.imgs.length) return;
    this.idx = (this.idx + dir + this.imgs.length) % this.imgs.length;
    this._update();
  },

  /** 跳到指定張 */
  goTo(idx) {
    this.idx = idx;
    this._update();
  },

  /** 更新 track 位置與指示點狀態 */
  _update() {
    const track = document.getElementById('img-slider-track');
    if (!track) return;
    track.style.transform = `translateX(-${this.idx * 100}%)`;
    document.querySelectorAll('.slider-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === this.idx);
    });
  },

  /** 綁定按鈕、點擊指示點、觸控滑動 */
  _attachEvents() {
    // 左右按鈕
    const prev  = document.getElementById('slider-prev');
    const next  = document.getElementById('slider-next');
    const track = document.getElementById('img-slider-track');
    if (prev) prev.onclick = () => this.move(-1);
    if (next) next.onclick = () => this.move(1);

    // 指示點
    document.querySelectorAll('.slider-dot').forEach((dot, i) => {
      dot.onclick = () => this.goTo(i);
    });

    // 觸控滑動（手機）
    if (!track) return;
    let startX = 0;
    track.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
    }, { passive: true });
    track.addEventListener('touchend', e => {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) this.move(diff > 0 ? 1 : -1);
    }, { passive: true });
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
