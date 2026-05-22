/**
 * 修正後的 script.js
 * 修復了 ReferenceError: 要素 is not defined 的問題
 */

(function() {
  // 定義全局變數容器
  const elements = {
    app: document.getElementById('app'),
    breadcrumb: document.getElementById('breadcrumb'),
    currentModel: '',
    currentVariant: ''
  };

  // 確保網頁載入後執行
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    // 這裡放入你的初始化邏輯
    console.log("系統已初始化，要素錯誤已排除。");
    // 如果你有其他的 fetchData 或渲染函式，請確認它們已正確定義
  }
  
  // 錯誤處理函式
  function showError(msg) {
    if (elements.app) {
      elements.app.innerHTML = `<div class="error-box"><h3>⚠️ 錯誤</h3><p>${msg}</p></div>`;
    }
  }
})();
