/* Whose inventory workspace: server-side search, branch scope, scanner and exception summary. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  let timer = null;
  let closeCamera = null;
  const format = value => Number(value).toLocaleString('vi-VN');

  function createPanel() {
    const page = byId('inventory');
    if (!page || byId('whoseInventorySearch')) return;
    const panel = document.createElement('section');
    panel.className = 'ws-toolkit';
    panel.innerHTML = `
      <div class="ws-toolkit-head">
        <div><strong>Tìm kiếm tồn kho</strong><p>Tìm trên toàn bộ dữ liệu Whose, không chỉ trang đang xem</p></div>
        <span id="whoseInventoryCount" role="status" aria-live="polite"></span>
      </div>
      <div class="ws-toolkit-fields">
        <label for="whoseInventorySearch">SKU / tên sản phẩm
          <input id="whoseInventorySearch" type="search" placeholder="Gõ hoặc quét barcode / SKU" autocomplete="off">
        </label>
        <label for="whoseInventoryBranch">Chi nhánh
          <select id="whoseInventoryBranch"><option value="">Tất cả chi nhánh</option></select>
        </label>
        <button id="whoseInventoryScan" type="button">Quét camera</button>
        <button id="whoseInventoryAnalyze" type="button">Báo cáo toàn kho</button>
      </div>
      <output id="whoseInventoryAnalysis" aria-live="polite"></output>`;
    page.insertBefore(panel, page.querySelector('.table-wrap'));
    const search = byId('whoseInventorySearch');
    const branch = byId('whoseInventoryBranch');
    const count = byId('whoseInventoryCount');
    const scan = byId('whoseInventoryScan');
    const output = byId('whoseInventoryAnalysis');

    function submitSearch() {
      window.dispatchEvent(new CustomEvent('whose:inventory-filter', {
        detail: { query: search.value.trim(), branch: branch.value }
      }));
    }
    function scheduleSearch() {
      clearTimeout(timer);
      timer = setTimeout(submitSearch, 220);
    }
    search.addEventListener('input', scheduleSearch);
    search.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); clearTimeout(timer); submitSearch(); }
    });
    branch.addEventListener('change', () => { clearTimeout(timer); submitSearch(); });

    window.addEventListener('whose:inventory-data', event => {
      const data = event.detail || {};
      if (Array.isArray(data.branches)) {
        const names = data.branches.filter(name => typeof name === 'string');
        const current = branch.value;
        branch.replaceChildren(new Option('Tất cả chi nhánh', ''),
          ...names.map(name => new Option(name, name)));
        branch.value = names.includes(current) ? current : '';
      }
      const total = Number(data.total);
      if (Number.isSafeInteger(total)) {
        count.textContent = format(total) + ' kết quả trên toàn bộ dữ liệu';
      }
    });

    byId('whoseInventoryAnalyze').addEventListener('click', async () => {
      output.textContent = 'Đang đọc báo cáo tồn kho…';
      try {
        const params = new URLSearchParams({ view: 'summary', branch: branch.value });
        const response = await authorizedFetch('/api/kiot-inventory-sync?' + params, { cache: 'no-store' });
        if (!response.ok) throw new Error('Báo cáo chưa khả dụng');
        const report = await response.json();
        const prefix = branch.value || 'Toàn bộ chi nhánh';
        output.textContent = prefix + ' · ' + format(report.rows) + ' dòng'
          + ' · Tồn âm: ' + format(report.negative)
          + ' · Tồn bằng 0: ' + format(report.zero)
          + ' · Khả dụng 0–2: ' + format(report.lowAvailable)
          + ' · Dữ liệu quá 24 giờ: ' + format(report.stale);
      } catch {
        output.textContent = 'Chưa đọc được báo cáo. Có thể thử lại.';
      }
    });

    const supported = 'BarcodeDetector' in window
      && Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    scan.disabled = !supported;
    if (!supported) scan.title = 'Trình duyệt chưa hỗ trợ quét camera. Có thể dùng đầu đọc hoặc nhập SKU.';
    scan.addEventListener('click', async () => {
      if (!supported || closeCamera) return;
      const overlay = document.createElement('div');
      overlay.className = 'ws-scan-overlay';
      overlay.innerHTML = '<div class="ws-scan-dialog" role="dialog" aria-modal="true" aria-label="Quét mã sản phẩm">'
        + '<header><strong>Quét SKU / barcode</strong><button type="button" aria-label="Đóng camera">Đóng</button></header>'
        + '<video autoplay muted playsinline aria-label="Camera quét mã"></video>'
        + '<p>Đưa barcode vào giữa khung hình. Camera chỉ mở trong phiên quét này.</p></div>';
      document.body.append(overlay);
      const video = overlay.querySelector('video');
      const button = overlay.querySelector('button');
      let stream = null, loop = null, reading = false;
      function cleanup() {
        if (loop !== null) clearInterval(loop);
        if (stream) for (const track of stream.getTracks()) track.stop();
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('visibilitychange', onHidden);
        closeCamera = null;
        search.focus();
      }
      function onKey(e) { if (e.key === 'Escape') cleanup(); }
      function onHidden() { if (document.hidden) cleanup(); }
      closeCamera = cleanup;
      button.addEventListener('click', cleanup);
      overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(); });
      document.addEventListener('keydown', onKey);
      document.addEventListener('visibilitychange', onHidden);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false,
          video: { facingMode: { ideal: 'environment' } } });
        if (!overlay.isConnected) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream;
        await video.play();
        const detector = new BarcodeDetector();
        loop = setInterval(async () => {
          if (reading || video.readyState < 2) return;
          reading = true;
          try {
            const codes = await detector.detect(video);
            const value = typeof codes?.[0]?.rawValue === 'string' ? codes[0].rawValue.trim() : '';
            if (value && value.length <= 80) {
              search.value = value;
              cleanup();
              clearTimeout(timer);
              submitSearch();
            }
          } catch {} finally { reading = false; }
        }, 220);
      } catch {
        cleanup();
        output.textContent = 'Không thể mở camera. Kiểm tra quyền truy cập hoặc sử dụng đầu đọc barcode.';
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createPanel);
  else createPanel();
})();
