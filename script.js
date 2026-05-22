/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          5.11 台灣服飾型錄 — 核心程式碼 (script.js)               ║
 * ║    ⚠️  此檔案包含網頁邏輯，除非您懂 JavaScript，否則請勿修改           ║
 * ║    功能：色碼智慧偵測、藏匿色碼文字、首頁目錄、分類頁、庫存查詢    ║
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
          
          // 智慧掃描文字裡的色碼
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

  // 頁面渲染：商品詳細頁
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
    
    if (p.color_dots && p.color_dots.length) {
      p.color_dots.forEach(v => {
        const status = v.c === '2' ? '庫存充足' : (v.c === '1' ? '少量現貨' : '目前無貨');
        varsHTML += `
          <button class="color-btn" data-model="${p.product_name}" data-variant="${v.n}">
            <div class="color-btn-swatch" style="background-color:${v.s || '#5a5c5f'}"></div>
            ${v.n} <span class="sub-card-count" style="margin-left:8px">${status}</span>
          </button>
        `;
      });
      hasVars = true;
    }
    
    if (!hasVars && p.color_list) {
      const colors = p.color_list.split(',').map(v => v.trim()).filter(v => v);
      colors.forEach(c => {
        let name = c;
        let swatchColor = '#5a5c5f';
        const hexMatch = c.match(/#
