/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         5.11 台灣服飾型錄 — 設定檔 (config.js)              ║
 * ║  ⚠️  只需修改這個檔案，其他檔案不需要動                       ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const CONFIG = {

  // ─── 🔑 Google Sheet 設定 ──────────────────────────────────────
  // 試算表網址：https://docs.google.com/spreadsheets/d/【這段是ID】/edit
  SHEET_ID: '1ygNIOJKnggUK47VQeOfPpnlDDNsZzPipTorkxjJja1A',
  SHEET_PRODUCTS: 'products',   // 工作表分頁名稱

  // ─── 📘 Facebook 粉專連結 ──────────────────────────────────────
  FB_URL: 'https://www.facebook.com/511Taipei/',

  // ─── 🏷️ 網站名稱 ──────────────────────────────────────────────
  SITE_NAME: '5.11 Tactical Store Taipei',
  SITE_SUBTITLE: '商品型錄',

  // ─── 🔘 FB 詢問按鈕文字 ───────────────────────────────────────
  FB_BUTTON_TEXT: '前往 FB 粉專詢問'

  // ✅ 分類不用在這裡設定！
  // 網站會自動從 Google Sheet 的 main_category / sub_category 欄位讀取
  // 在 Sheet 裡新增分類 → 網站自動出現；刪除分類 → 網站自動消失
};
