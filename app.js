const state = {
  overview: null,
  system: null,
  draft: [],
  page: 'dashboard'
};

const meta = {
  dashboard: ['Dashboard', 'Tổng quan dữ liệu thật và trạng thái hệ thống'],
  operations: ['Store ↔ Warehouse', 'Giao tiếp vận hành giữa cửa hàng và kho'],
  inventory: ['Tồn kho', 'Tồn KiotViet theo chi nhánh'],
  transfers: ['Chuyển kho', 'Phiếu chuyển đọc trực tiếp từ KiotViet'],
  stocktake: ['Kiểm kho', 'Delta ledger và quy trình cân bằng tồn'],
  returns: ['Đổi / Trả', 'Phiếu trả hàng và lineage bán hàng'],
  products: ['Sản phẩm', 'Danh mục sản phẩm từ KiotViet'],
  employees: ['Nhân viên & quyền', 'Tài khoản, chức vụ, vị trí và phạm vi thao tác'],
  kiot: ['Đồng bộ KiotViet', 'Kết nối read-only, độ trễ và reconciliation'],
  settings: ['Cài đặt', 'Trạng thái nền tảng và các nguyên tắc vận hành']
};

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[c]));

const fmt = (value) => value == null || Number.isNaN(Number(value))
  ? '—'
  : new Intl.NumberFormat('vi-VN').format(Number(value));

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function status(text, kind = 'gray') {
  return '<span class="status st-' + kind + '">' + esc(text) + '</span>';
}

function errorSummary(connectivity) {
  const failed = Object.entries(connectivity || {}).filter(([, v]) => !v?.ok);
  if (!failed.length) return null;
  const unique = [...new Set(failed.map(([, v]) => v.error).filter(Boolean))];
  return unique.slice(0, 2).join(' · ');
}

function setMobileNavState(page) {
  const primaryPages = new Set(['dashboard', 'operations', 'stocktake', 'inventory']);
  document.querySelectorAll('.mobile-tab[data-mobile-page]').forEach((el) => {
    el.classList.toggle('active', el.dataset.mobilePage === page);
  });
  const more = document.getElementById('mobileMore');
  if (more) more.classList.toggle('active', !primaryPages.has(page));
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('mobileBackdrop')?.classList.remove('show');
}

function navigate(page) {
  state.page = page;
  document.querySelectorAll('.page').forEach((el) => el.classList.toggle('active', el.id === page));
  document.querySelectorAll('.nav-item[data-page]').forEach((el) => el.classList.toggle('active', el.dataset.page === page));
  document.getElementById('pageTitle').textContent = meta[page][0];
  document.getElementById('pageSub').textContent = meta[page][1];
  setMobileNavState(page);
  closeSidebar();
  requestAnimationFrame(() => document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'auto' }));
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const isOpen = sidebar.classList.toggle('open');
  document.getElementById('mobileBackdrop')?.classList.toggle('show', isOpen);
}

function renderSystemBanner() {
  const host = document.getElementById('systemBanner');
  if (!state.system) {
    host.className = 'banner warn';
    host.innerHTML = '<div><strong>Đang đọc trạng thái hệ thống…</strong><p>Kiểm tra Vercel, KiotViet và Supabase.</p></div>';
    return;
  }

  const supabaseReady = state.system.integrations?.supabase?.ready;
  const kiotConfigured = state.system.integrations?.kiotviet?.clientIdConfigured &&
    state.system.integrations?.kiotviet?.clientSecretConfigured &&
    state.system.integrations?.kiotviet?.retailerConfigured;

  if (!supabaseReady) {
    host.className = 'banner warn';
    host.innerHTML = '<div><strong>Nền Whose Studio đã lên Vercel; database riêng chưa được tạo.</strong><p>Auth, nhân viên, Store ↔ Warehouse, kiểm kho và realtime đang chờ Supabase riêng. Không dùng chung database ALFAER WMS.</p></div>' +
      '<div>' + status('Supabase pending', 'amber') + '</div>';
  } else if (!kiotConfigured) {
    host.className = 'banner warn';
    host.innerHTML = '<div><strong>Supabase sẵn sàng, KiotViet thiếu cấu hình.</strong><p>Hệ thống nội bộ có thể chạy nhưng chưa đọc được dữ liệu KiotViet.</p></div>';
  } else {
    host.className = 'banner ok';
    host.innerHTML = '<div><strong>Nền tảng đã kết nối đủ hạ tầng.</strong><p>Trạng thái chi tiết nằm trong Đồng bộ KiotViet và Cài đặt.</p></div>' +
      '<div>' + status('Infrastructure ready', 'green') + '</div>';
  }
}

function renderDashboard() {
  const d = state.overview || {};
  const totals = d.totals || {};
  const inv = d.inventory || {};
  document.getElementById('metricProducts').textContent = fmt(totals.products);
  document.getElementById('metricOrders').textContent = fmt(totals.orders);
  document.getElementById('metricInvoices').textContent = fmt(totals.invoices);
  document.getElementById('metricTransfers').textContent = fmt(totals.transfers);
  document.getElementById('metricReturns').textContent = fmt(totals.returns);
  document.getElementById('metricInventory').textContent = fmt(totals.productOnHands ?? inv.inventoryRows);
  document.getElementById('metricNegative').textContent = fmt(inv.negative);

  const connectivity = d.connectivity || {};
  const err = errorSummary(connectivity);
  const banner = document.getElementById('kiotBanner');
  if (!state.overview) {
    banner.className = 'banner warn';
    banner.innerHTML = '<div><strong>Chưa có phản hồi KiotViet.</strong><p>Đang tải dữ liệu.</p></div>';
  } else if (err) {
    banner.className = 'banner error';
    banner.innerHTML = '<div><strong>KiotViet chưa kết nối thành công.</strong><p>' + esc(err) + '</p></div>' +
      '<div>' + status('Connection error', 'red') + '</div>';
  } else {
    banner.className = 'banner ok';
    banner.innerHTML = '<div><strong>KiotViet read-only đang hoạt động.</strong><p>Dữ liệu trên dashboard được đọc trực tiếp; Whose chưa ghi ngược KiotViet.</p></div>' +
      '<div>' + status('Read-only', 'green') + '</div>';
  }

  const rows = Object.entries(connectivity);
  document.getElementById('connectivityRows').innerHTML = rows.length
    ? rows.map(([name, v]) => '<tr><td class="strong">' + esc(name) + '</td><td>' +
        status(v.ok ? 'OK' : 'Lỗi', v.ok ? 'green' : 'red') + '</td><td>' + fmt(v.ms) +
        ' ms</td><td class="muted">' + esc(v.error || '') + '</td></tr>').join('')
    : '<tr><td colspan="4"><div class="empty"><b>Chưa có dữ liệu</b><span>Connectivity sẽ xuất hiện sau khi API trả về.</span></div></td></tr>';

  const branchRows = d.branches || [];
  document.getElementById('branchRows').innerHTML = branchRows.length
    ? branchRows.map((b) => '<tr><td class="strong">' + esc(b.branchName || b.name || b.id) + '</td><td class="mono">' +
        esc(b.id) + '</td><td>' + esc(b.address || '') + '</td><td>' +
        status(b.isActive === false ? 'Ngừng' : 'Hoạt động', b.isActive === false ? 'gray' : 'green') + '</td></tr>').join('')
    : '<tr><td colspan="4"><div class="empty"><b>Chưa đọc được chi nhánh</b><span>Kiểm tra kết nối KiotViet.</span></div></td></tr>';
}

function renderProducts() {
  const rows = state.overview?.samples?.products || [];
  document.getElementById('productRows').innerHTML = rows.length
    ? rows.map((p) => '<tr><td><div class="sku"><div class="sku-img">SKU</div><div><b>' + esc(p.code || p.id) +
        '</b><br><span class="muted">' + esc(p.name || '') + '</span></div></div></td><td>' +
        esc(p.branchName || p.branchId || '—') + '</td><td>' + esc(p.status ?? '—') + '</td><td>' +
        esc(p.purchaseDate || '—') + '</td></tr>').join('')
    : '<tr><td colspan="4"><div class="empty"><b>Chưa có sản phẩm</b><span>Dữ liệu sẽ đến từ KiotViet khi credential hợp lệ.</span></div></td></tr>';
}

function renderInventory() {
  const rows = state.overview?.samples?.productOnHands || [];
  const inv = state.overview?.inventory || {};
  document.getElementById('inventorySource').textContent = inv.source || '—';
  document.getElementById('inventoryRows').innerHTML = rows.length
    ? rows.map((p) => '<tr><td class="strong">' + esc(p.code || p.id) + '</td><td>' +
        esc(p.branchName || 'Theo nhiều chi nhánh') + '</td><td class="muted">Chi tiết tồn nằm trong inventories của KiotViet</td></tr>').join('')
    : '<tr><td colspan="3"><div class="empty"><b>Chưa đọc được productOnHands</b><span>Endpoint đã được tích hợp; chờ KiotViet xác thực thành công.</span></div></td></tr>';
}

function renderTransfers() {
  const rows = state.overview?.samples?.transfers || [];
  document.getElementById('transferRows').innerHTML = rows.length
    ? rows.map((r) => '<tr><td class="strong">' + esc(r.code || r.id) + '</td><td>' +
        esc(r.fromBranchId ?? '—') + ' → ' + esc(r.toBranchId ?? '—') + '</td><td>' +
        status(String(r.status ?? '—'), 'blue') + '</td><td>' + esc(r.purchaseDate || '—') + '</td></tr>').join('')
    : '<tr><td colspan="4"><div class="empty"><b>Chưa có phiếu chuyển</b><span>Whose đã có read model cho GET /transfers; hiện phụ thuộc kết nối KiotViet.</span></div></td></tr>';
}

function renderReturns() {
  const rows = state.overview?.samples?.returns || [];
  document.getElementById('returnRows').innerHTML = rows.length
    ? rows.map((r) => '<tr><td class="strong">' + esc(r.code || r.id) + '</td><td>' +
        esc(r.name || '—') + '</td><td>' + fmt(r.total) + '</td><td>' +
        status(String(r.status ?? '—'), 'blue') + '</td><td>' + esc(r.purchaseDate || '—') + '</td></tr>').join('')
    : '<tr><td colspan="5"><div class="empty"><b>Chưa có phiếu trả hàng</b><span>Whose đã tích hợp read-only GET /returns; chờ credential KiotViet hợp lệ.</span></div></td></tr>';
}

function renderOperations() {
  const ready = Boolean(state.system?.integrations?.supabase?.ready);
  const badge = document.getElementById('operationsState');
  badge.innerHTML = ready ? status('Backend connected', 'green') : status('Chờ Supabase', 'amber');
  document.getElementById('sendRequest').disabled = !ready || state.draft.length === 0;
  document.getElementById('opsEmpty').innerHTML = ready
    ? '<b>Chưa có yêu cầu thật.</b><span>Khi nhân viên tạo yêu cầu, thread sẽ xuất hiện realtime tại đây.</span>'
    : '<b>Giao diện đã sẵn sàng, backend nghiệp vụ chưa kích hoạt.</b><span>Cần Supabase riêng để lưu user, role, request, message, assignment và realtime.</span>';
}

function renderModules() {
  const modules = state.system?.modules || {};
  document.querySelectorAll('[data-module]').forEach((el) => {
    const value = modules[el.dataset.module] || 'unknown';
    const kind = value === 'available' || value === 'read-model-ready' ? 'green' :
      value.includes('waiting') ? 'amber' : value === 'disabled' ? 'gray' : 'blue';
    el.innerHTML = status(value, kind);
  });
}

function enhanceResponsiveTables() {
  document.querySelectorAll('.table').forEach((table) => {
    const labels = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    table.querySelectorAll('tbody tr').forEach((row) => {
      [...row.children].forEach((cell, index) => {
        if (cell.tagName === 'TD' && labels[index]) cell.dataset.label = labels[index];
      });
    });
  });
}

function renderAll() {
  renderSystemBanner();
  renderDashboard();
  renderProducts();
  renderInventory();
  renderTransfers();
  renderReturns();
  renderOperations();
  renderModules();
  enhanceResponsiveTables();
}

async function loadData() {
  const refresh = document.getElementById('refresh');
  refresh.disabled = true;
  try {
    const [systemRes, overviewRes] = await Promise.all([
      fetch('/api/system', { cache: 'no-store' }),
      fetch('/api/overview', { cache: 'no-store' })
    ]);
    state.system = await systemRes.json();
    state.overview = await overviewRes.json();
  } catch (error) {
    toast('Không thể tải trạng thái hệ thống');
  } finally {
    refresh.disabled = false;
    renderAll();
  }
}

function productSearchRows(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const source = state.overview?.samples?.products || [];
  return source.filter((p) => [p.code, p.name].some((v) => String(v || '').toLowerCase().includes(q))).slice(0, 8);
}

function renderDraft() {
  const host = document.getElementById('drafts');
  host.innerHTML = state.draft.map((item) => '<div class="draft"><b>' + esc(item.code || item.id) +
    '</b><button data-id="' + esc(item.id) + '" data-delta="-1">−</button><b>' + item.qty +
    '</b><button data-id="' + esc(item.id) + '" data-delta="1">+</button></div>').join('');
  host.querySelectorAll('button').forEach((button) => button.onclick = () => {
    const id = button.dataset.id;
    const item = state.draft.find((x) => String(x.id) === String(id));
    if (!item) return;
    item.qty += Number(button.dataset.delta);
    if (item.qty <= 0) state.draft = state.draft.filter((x) => String(x.id) !== String(id));
    renderDraft();
    renderOperations();
  });
  renderOperations();
}

function setupProductComposer() {
  const input = document.getElementById('productInput');
  const suggestions = document.getElementById('suggestions');
  input.addEventListener('input', () => {
    const rows = productSearchRows(input.value);
    if (!input.value.trim()) {
      suggestions.classList.remove('show');
      return;
    }
    suggestions.innerHTML = rows.length
      ? rows.map((p) => '<div class="srow" data-id="' + esc(p.id) + '"><div class="sku-img">SKU</div><div><b>' +
          esc(p.code || p.id) + '</b><small>' + esc(p.name || '') + '</small></div><div class="muted">Chọn</div></div>').join('')
      : '<div class="empty"><b>Không tìm thấy trong mẫu đã tải</b><span>Search full catalog sẽ dùng database mirror sau khi Supabase được tạo.</span></div>';
    suggestions.classList.add('show');
    suggestions.querySelectorAll('.srow').forEach((row) => row.onclick = () => {
      const product = (state.overview?.samples?.products || []).find((p) => String(p.id) === row.dataset.id);
      if (!product) return;
      const existing = state.draft.find((x) => String(x.id) === String(product.id));
      if (existing) existing.qty += 1;
      else state.draft.push({ ...product, qty: 1 });
      input.value = '';
      suggestions.classList.remove('show');
      renderDraft();
      if (navigator.vibrate) navigator.vibrate(10);
    });
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.composer-area')) suggestions.classList.remove('show');
  });
}

document.querySelectorAll('.nav-item[data-page]').forEach((el) => el.onclick = () => navigate(el.dataset.page));
document.querySelectorAll('.mobile-tab[data-mobile-page]').forEach((el) => {
  el.onclick = () => {
    navigate(el.dataset.mobilePage);
    if (navigator.vibrate) navigator.vibrate(7);
  };
});
document.getElementById('mobileMore')?.addEventListener('click', () => {
  toggleSidebar();
  if (navigator.vibrate) navigator.vibrate(7);
});
document.getElementById('mobileBackdrop')?.addEventListener('click', closeSidebar);
document.getElementById('refresh').onclick = loadData;
document.getElementById('globalSearch').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    navigate('products');
    toast('Search full catalog sẽ được nối với database mirror');
  }
});
document.getElementById('sendRequest').onclick = () => {
  if (!state.system?.integrations?.supabase?.ready) {
    toast('Cần Supabase trước khi gửi yêu cầu thật');
    return;
  }
  toast('Chưa mở ghi production ở bước nền');
};
setupProductComposer();
navigate('dashboard');
loadData();
