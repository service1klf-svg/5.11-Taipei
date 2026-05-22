/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         5.11 台灣服飾型錄 — 核心程式碼 (script.js)             ║
 * ║  ⚠️  此檔案包含網頁邏輯，除非您懂 JavaScript，否則請勿修改          ║
 * ║  功能：色碼智慧偵測、藏匿色碼文字、首頁目錄、分類頁、庫存查詢    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

(function() {
  const G_SHEET_API = 'https://docs.google.com/spreadsheets/d/';
  const G_SHEET_POST = '/gviz/tq?tqx=out:json&tq=&sheet=';
  let productData = [];
  let categoryMap = {};
  const currentPath = window.location.hash.slice(2);
  const elements = {};

  // 初始化流程
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    await cacheElements();
    showLoading(true);
    await fetchData();
    initLightbox();
    buildNav(productData);
    showLoading(false);
    window.addEventListener('hashchange', router);
    router();
  }

  // 抓取雲端試算表資料
  async function fetchData() {
    if (!CONFIG.SHEET_ID) {
      showError('請在 config.js 設定 Google Sheet ID');
      return;
    }
    const url = `${G_SHEET_API}${CONFIG.SHEET_ID}${G_SHEET_POST}${CONFIG.SHEET_PRODUCTS}`;
    try {
      const response = await fetch(url);
      const text = await response.text();
      const json = JSON.parse(text.slice(47, -2));
      parseSheetData(json);
    } catch (e) {
      showError(`讀取 Google Sheet 資料失敗。請確認：<br>1. 試算表已「公開發布至網路」<br>2. ID 正確<br>3. config.js 設定正確`);
      console.error(e);
    }
  }

  // 解析雲端資料
  function parseSheetData(json) {
    const cols = json.table.cols.map(c => c.label.toLowerCase().replace(/\s/g, ''));
    const rows = json.table.rows;
    const requiredCols = ['main_category', 'sub_category', 'product_name', 'images', 'item_num', 'variants'];

    rows.forEach(r => {
      const p = {};
      requiredCols.forEach(col => p[col] = '');
      p.color_dots = [];

      r.c.forEach((val, index) => {
        const colLabel = cols[index];
        if (!colLabel) return;
        const colVal = val ? val.v : '';
        p[colLabel] = colVal;
      });

      if (!p.main_category || !p.product_name) return;

      const main = p.main_category.trim();
      const sub = p.sub_category ? p.sub_category.trim() : '其他';

      // 智慧偵測並處理庫存變體
      if (p.variants) {
        const varArr = p.variants.split(',').map(v => v.trim()).filter(v => v);
        
        varArr.forEach(v => {
          const varLower = v.toLowerCase();
          let c = '0';
          if (varLower.includes('庫存充足') || varLower.includes('充分')) c = '2';
          else if (varLower.includes('少量') || varLower.includes('庫存不足') || varLower.includes('紧张')) c = '1';
          
          let name = v.replace(/(少量|庫存不足|庫存充足|充分|紧张)/i, '').trim();
          
          // 🛠️ 核心修正：智慧掃描文字裡的色碼
          let s = ''; 
          const hexMatch = v.match(/#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})/);
          if (hexMatch) {
            s = hexMatch[0];
            // 從名字中把偵測到的色碼徹底藏起來
            name = name.replace(s, '').trim();
          }

          p.color_dots.push({ n: name, c: c, s: s });
        });
      }

      if (!categoryMap[main]) {
        categoryMap[main] = { key: encodeURIComponent(main), subs: {} };
      }
      if (!categoryMap[main].subs[sub]) {
        categoryMap[main].subs[sub] = { key: encodeURIComponent(sub), count: 0 };
      }
      categoryMap[main].subs[sub].count++;

      p.main_key = categoryMap[main].key;
      p.sub_key = categoryMap[main].subs[sub].key;
      if (p.images) p.imagesArr = p.images.split(',').map(v => v.trim()).filter(v => v);
      
      productData.push(p);
    });
  }

  // 路由器
  function router() {
    elements.app.innerHTML = '';
    const hash = window.location.hash.slice(2);
    const path = hash.split('/').map(v => decodeURIComponent(v));
    buildBreadcrumb(path);

    if (!hash || path[0] === '') {
      renderHomePage();
    } else if (path.length === 2) {
      renderCategoryPage(path[0], path[1]);
    } else if (path.length === 1 && path[0] !== '') {
      renderMainPage(path[0]);
    } else if (path.length > 2) {
      renderProductDetailPage(path[2]);
    }
  }

  // 🛠️ 頁面渲染：商品詳細頁 (已修正支援藏匿色碼)
  function renderProductDetailPage(id) {
    const p = productData.find(v => v.item_num == id);
    if (!p) { showError('找不到商品'); return; }

    const div = document.createElement('div');
    div.className = 'product-detail fade-in';
    const mainImg = p.imagesArr && p.imagesArr.length ? p.imagesArr[0] : '';
    let imgsHTML = '';
    if (p.imagesArr && p.imagesArr.length > 1) {
      p.imagesArr.forEach((src, idx) => {
        imgsHTML += `<img src="${src}" class="thumb-item ${idx === 0 ? 'active' : ''}" data-index="${idx}" alt="縮圖 ${idx+1}">`;
      });
    }

    let varsHTML = '';
    let hasVars = false;
    
    // 如果有舊款顏色資料，優先顯示
    if (p.color_dots && p.color_dots.length) {
      p.color_dots.forEach(v => {
        const status = v.c === '2' ? '庫存充足' : (v.c === '1' ? '少量現貨' : '目前無貨');
        // 🛠️ 這裡使用了在設定檔中已抓取的藏匿色碼 logic
        varsHTML += `
          <button class="color-btn" data-model="${p.product_name}" data-variant="${v.n}">
            <div class="color-btn-swatch" style="background-color:${v.s || '#5a5c5f'}"></div>
            ${v.n} <span class="sub-card-count" style="margin-left:8px">${status}</span>
          </button>
        `;
      });
      hasVars = true;
    }
    
    // 如果有顏色清單資料，則顯示純按鈕
    if (!hasVars && p.color_list) {
      const colors = p.color_list.split(',').map(v => v.trim()).filter(v => v);
      colors.forEach(c => {
        // 🛠️ 這裡使用了最智慧掃描與藏匿 logic
        let name = c;
        let swatchColor = '#5a5c5f'; // 預設灰色色塊
        const hexMatch = c.match(/#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})/);
        
        if (hexMatch) {
          swatchColor = hexMatch[0];
          // 從名字中把偵測到的色碼徹底藏起來
          name = name.replace(swatchColor, '').trim();
        }

        varsHTML += `
          <button class="color-btn" data-model="${p.product_name}" data-variant="${name}">
            <div class="color-btn-swatch" style="background-color:${swatchColor}"></div>
            ${name}
          </button>
        `;
      });
      hasVars = true;
    }

    const matHTML = p.material ? `<p class="divider"></p><p class="label">材質說明</p><p class="material-text">${p.material}</p>` : '';
    const descHTML = p.description ? `<p class="divider"></p><p class="label">商品描述</p><p class="description-text fade-in hidden mt-16">${p.description}</p>` : '';

    div.innerHTML = `
      <div class="product-left">
        <div class="main-img-wrap fade-in">
          ${mainImg ? `<img id="main-product-img" src="${mainImg}" alt="${p.product_name}">` : ''}
        </div>
        ${imgsHTML ? `<div class="thumb-list mt-8">${imgsHTML}</div>` : ''}
      </div>
      <div class="product-right">
        <div class="product-right-head">
          <button class="back-btn" onclick="history.back()">${p.main_category}</button>
          <p class="product-info-model">${p.item_num || ''}</p>
          <h1 class="product-info-name">${p.product_name}</h1>
        </div>
        ${hasVars ? `<div class="color-options mt-24">${varsHTML}</div>` : ''}
        ${matHTML}
        ${descHTML}
        ${p.description ? `<button id="toggle-desc-btn" class="breadcrumb" style="border:none;background:none;font-weight:700;letter-spacing:1px;margin-top:20px;cursor:pointer">...展開完整描述</button>` : ''}
        <a id="询问按鈕" href="#" class="btn-fb mt-24">前往 FB 粉專詢問</a>
      </div>
    `;
    elements.app.appendChild(div);

    // 商品頁邏輯
    setTimeout(() => {
      const app = document.getElementById('app');
      const询按鈕 = app.querySelector('#询问按鈕');
      const toggleBtn = app.querySelector('#toggle-desc-btn');
      const descText = app.querySelector('.description-text');
      if(询按鈕)询按鈕.addEventListener('click', on询问);
      if(toggleBtn)toggleBtn.addEventListener('click', () => {
        descText.classList.toggle('hidden');
        toggleBtn.innerText = descText.classList.contains('hidden') ? '...展開完整描述' : '收起描述';
      });

      // 縮圖切換邏輯
      const thumbs = app.querySelectorAll('.thumb-item');
      thumbs.forEach(t => {
        t.addEventListener('click', () => {
          thumbs.forEach(v => v.classList.remove('active'));
          t.classList.add('active');
          document.getElementById('main-product-img').src = t.src;
        });
      });

      // FB 詢問連結邏輯
      function on询问(e) {
        if (!elements.currentModel && !elements.currentVariant) {
          elements.currentModel = p.product_name;
          elements.currentVariant = ' (通用型號)';
        }
        e.preventDefault();
        询按鈕.innerText = '正在傳送...';
        setTimeout(() => {
          let mStr = elements.currentModel || '';
          if (p.item_num) mStr = `[${p.item_num}] ${mStr}`;
          const m = encodeURIComponent(`您好，我想詢問：${mStr} | 顏色：${elements.currentVariant || '未選擇'}`);
          location.href = `${CONFIG.FB_URL}?messaging_ref=catalogue&text=${m}`;
          elements.currentVariant = '';
          要素.currentModel = '';
          询按鈕.innerText = CONFIG.FB_BUTTON_TEXT || '前往 FB 粉專詢問';
        }, 1200);
      }
    }, 100);
  }

  // 詢問邏輯 (針對首頁與分類頁的快速詢問)
  elements.currentVariant = '';
  要素.currentModel = '';
  document.addEventListener('click', e => {
    const btn = e.target.closest('.color-btn');
    if (btn) {
      // 找到按鈕的所有同層兄弟按鈕，移除 active
      const btns = btn.parentNode.querySelectorAll('.color-btn');
      btns.forEach(b => b.classList.remove('active'));
      // 把點擊的按鈕加上 active
      btn.classList.add('active');
      elements.currentModel = btn.dataset.model;
      elements.currentVariant = btn.dataset.variant;
    }
  });

  // 其他工具函式與渲染函式
  async function cacheElements() {
    elements.app = document.getElementById('app');
    elements.breadcrumb = document.getElementById('breadcrumb');
    document.title = CONFIG.SITE_NAME || '5.11 TACTICAL — 台灣服飾型錄';
  }
  function showLoading(b) {
    document.getElementById('loading-screen').className = b ? 'loading-screen' : 'loading-screen hidden';
  }
  function showError(msg) {
    showLoading(false);
    elements.app.innerHTML = `<div class="error-box fade-in"><h3>⚠️ 設定錯誤</h3><p>${msg}</p></div>`;
  }
  function buildNav(data) {
    const footer = document.querySelector('footer');
    footer.querySelector('.footer-brand').innerText = CONFIG.SITE_NAME;
    if (elements.fbLink) elements.fbLink.href = CONFIG.FB_URL;
  }
  function buildBreadcrumb(path) {
    elements.breadcrumb.innerHTML = `<a href="#/">${CONFIG.SITE_NAME}目錄</a>`;
    if (!path.length || path[0] === '') return;
    elements.breadcrumb.innerHTML += `<span class="sep">›</span><a href="#/${encodeURIComponent(path[0])}">${path[0]}</a>`;
    if (path.length > 1) {
      elements.breadcrumb.innerHTML += `<span class="sep">›</span><a href="#/${encodeURIComponent(path[0])}/${encodeURIComponent(path[1])}">${path[1]}</a>`;
    }
    if (path.length > 2) {
      elements.breadcrumb.innerHTML += `<span class="sep">›</span><span class="current">${productData.find(p=>p.item_num==path[2])?.product_name || '...'}</span>`;
    }
  }

  function renderMainPage(main) {
    const p = document.createElement('h1'); p.className = 'page-title'; p.innerText = main;
    const s = document.createElement('p'); s.className = 'page-subtitle'; s.innerText = productData.find(v => v.main_category == main)?.description || `${main} 分類下的所有細項商品`;
    elements.app.appendChild(p); elements.app.appendChild(s);
    const grid = document.createElement('div'); grid.className = 'category-grid sub-grid fade-in'; grid.innerHTML = categoryMap[main] ? Object.keys(categoryMap[main].subs).map(sub => `<a href="#/${encodeURIComponent(main)}/${encodeURIComponent(sub)}" class="sub-card"><span class="sub-card-name">${sub}</span><span class="sub-card-count">${categoryMap[main].subs[sub].count}</span></a>`).join('') : '<p>找不到此分類</p>'; elements.app.appendChild(grid);
  }
  function renderHomePage() {
    const h = document.createElement('div'); h.className = 'home-header fade-in'; h.innerHTML = `<h1>${CONFIG.SITE_NAME}</h1><p>${CONFIG.SITE_SUBTITLE}</p>`; elements.app.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'category-grid fade-in'; grid.innerHTML = Object.keys(categoryMap).map(main => `<a href="#/${encodeURIComponent(main)}" class="cat-card"><h3 class="cat-card-name">${main}</h3><p class="cat-card-meta">總計 ${Object.keys(categoryMap[main].subs).length} 個分類</p><span class="cat-card-arrow">→</span></a>`).join(''); elements.app.appendChild(grid);
  }
  function renderCategoryPage(main, sub) {
    const p = document.createElement('h1'); p.className = 'page-title'; h1.innerHTML = `<span>${main}</span> / ${sub}`;
    elements.app.appendChild(p);
    const grid = document.createElement('div'); grid.className = 'product-grid fade-in';
    const products = productData.filter(v => v.main_category == main && v.sub_category == sub);
    grid.innerHTML = products.length ? products.map(p => `
      <a href="#/${encodeURIComponent(main)}/${encodeURIComponent(sub)}/${p.item_num}" class="product-card">
        <div class="product-card-img-wrap">${p.imagesArr && p.imagesArr.length ? `<img src="${p.imagesArr[0]}" alt="${p.product_name}">` : ''}</div>
        <div class="product-card-info">
          <p class="product-card-model">${p.item_num || ''}</p>
          <p class="product-card-name">${p.product_name}</p>
        </div>
      </a>`).join('') : '<p class="empty-state">目前此分類下無商品資料</p>'; elements.app.appendChild(grid);
  }

  // Lightbox
  function initLightbox() {
    elements.lb = document.getElementById('lightbox'); elements.lbOver = document.getElementById('lightbox-overlay'); elements.lbImg = document.getElementById('lightbox-img'); elements.lbCount = document.getElementById('lightbox-counter'); document.getElementById('app').addEventListener('click', e => { const img = e.target.closest('#main-product-img'); if (img) showLB(img); }); elements.lbOver.addEventListener('click', closeLB); document.getElementById('lightbox-close').addEventListener('click', closeLB); elements.lb.addEventListener('click', e => { if (e.target.closest('#lightbox-prev')) navigateLB(-1); if (e.target.closest('#lightbox-next')) navigateLB(1); }); document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLB(); if (e.key === 'ArrowLeft') navigateLB(-1); if (e.key === 'ArrowRight') navigateLB(1); }); }
  let lbP, lbIdx; function showLB(img) { elements.lbImg.src = ''; elements.lbOver.classList.add('active'); elements.lb.classList.add('active'); const hash = window.location.hash.slice(2).split('/'); lbP = productData.find(v => v.item_num == hash[hash.length - 1]); lbIdx = lbP ? 0 : 0; elements.lbImg.src = img.src; updateLBMeta(); }
  function updateLBMeta() { if (lbP && lbP.imagesArr) elements.lbCount.innerText = `${lbIdx + 1} / ${lbP.imagesArr.length}`; else elements.lbCount.innerText = ''; }
  function closeLB() { elements.lbOver.classList.remove('active'); elements.lb.classList.remove('active'); elements.lbImg.src = ''; }
  function navigateLB(d) { if (lbP && lbP.imagesArr) { lbIdx = (lbIdx + d + lbP.imagesArr.length) % lbP.imagesArr.length; elements.lbImg.src = lbP.imagesArr[lbIdx]; updateLBMeta(); } }
})();
