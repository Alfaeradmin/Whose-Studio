const state = {
  overview: null,
  system: null,
  draft: [],
  page: 'dashboard',
  session: null,
  requests: [],
  selectedRequest: null,
  opsTab: 'open',
  pendingKey: null,
  submitting: false
};

const meta = {
  dashboard: ['Tổng quan', 'Dữ liệu vận hành, trạng thái đồng bộ và các tác vụ nhanh'],
  operations: ['Công việc', 'Gọi hàng và các công việc vận hành'],
  orders: ['Đơn hàng', 'Đơn hàng và hóa đơn từ KiotViet — đang phát triển'],
  warehouse: ['Thao tác kho', 'Nhập hàng, xuất hàng và kiểm kho'],
  inventory: ['Tồn kho', 'Tồn KiotViet theo chi nhánh'],
  transfers: ['Chuyển kho', 'Phiếu chuyển đọc trực tiếp từ KiotViet'],
  stocktake: ['Kiểm kho', 'Delta ledger và quy trình cân bằng tồn'],
  returns: ['Đổi / Trả', 'Phiếu trả hàng và lineage bán hàng'],
  products: ['Sản phẩm', 'Danh mục sản phẩm từ KiotViet'],
  productSync: ['Sản phẩm', 'Danh mục sản phẩm Whose và dữ liệu từ KiotViet'],
  employees: ['Nhân viên & Tài khoản', 'Tài khoản, chức vụ, vị trí và phạm vi thao tác'],
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
  const primaryPages = new Set(['dashboard', 'operations', 'warehouse', 'inventory']);
  document.querySelectorAll('.mobile-tab[data-mobile-page]').forEach((el) => {
    el.classList.toggle('active', el.dataset.mobilePage === page || (page==='stocktake'&&el.dataset.mobilePage==='warehouse'));
  });
  const more = document.getElementById('mobileMore');
  if (more) more.classList.toggle('active', !primaryPages.has(page));
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('mobileBackdrop')?.classList.remove('show');
  document.querySelector('.mobile-menu')?.setAttribute('aria-expanded', 'false');
}

function navigate(page) {
  state.page = page;
  document.querySelectorAll('.page').forEach((el) => el.classList.toggle('active', el.id === page));
  document.querySelectorAll('.nav-item[data-page]').forEach((el) => {
    const current = el.dataset.page === page || (page==='stocktake'||page==='transfers'||page==='returns')&&el.dataset.page==='warehouse' || page==='kiot'&&el.dataset.page==='settings';
    el.classList.toggle('active', current);
    if (current) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
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
  document.querySelector('.mobile-menu')?.setAttribute('aria-expanded', String(isOpen));
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
    host.innerHTML = '<div><strong>Cấu hình hạ tầng đã sẵn sàng.</strong><p>Đây là kiểm tra cấu hình, không thay thế xác thực API KiotViet. Xem kết quả đọc từng nhóm dữ liệu ở Tổng quan.</p></div>' +
      '<div>' + status('Đã cấu hình', 'blue') + '</div>';
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
  const dbMetric = document.getElementById('metricDatabase');
  if (dbMetric) dbMetric.textContent = state.system?.integrations?.supabase?.ready ? 'Schema ready' : 'Pending';

  const connectivity = d.connectivity || {};
  const health = d.connectionStatus || {};
  const successes = Object.values(connectivity).filter(v => v?.ok === true).length;
  const failures = Object.entries(connectivity).filter(([,v]) => v?.ok !== true);
  const checkCount = Object.keys(connectivity).length;
  const healthState = health.state || (successes ? (failures.length ? 'partial' : 'connected') : 'unavailable');
  const err = errorSummary(connectivity);
  const banner = document.getElementById('kiotBanner');
  if (!state.overview) {
    banner.className = 'banner warn';
    banner.innerHTML = '<div><strong>Chưa xác định trạng thái KiotViet.</strong><p>Chưa có kết quả kiểm tra API; không đồng nghĩa với sai khóa hoặc mất kết nối.</p></div>';
  } else if (healthState === 'connected') {
    banner.className = 'banner ok';
    banner.innerHTML = '<div><strong>KiotViet kết nối thành công.</strong><p>Đã đọc được ' + successes + '/' + checkCount + ' nhóm dữ liệu. Chế độ chỉ đọc; Whose không tự điều chỉnh tồn kho.</p></div>' +
      '<div>' + status('Kết nối tốt', 'green') + '</div>';
  } else if (healthState === 'partial') {
    const failedNames = failures.map(([name]) => name);
    banner.className = 'banner warn';
    banner.innerHTML = '<div><strong>KiotViet đã kết nối — một số API chưa đọc được.</strong><p>' +
      'Đã đọc được ' + successes + '/' + checkCount + ' nhóm dữ liệu. Cần kiểm tra: ' +
      esc(failedNames.slice(0, 5).join(', ') + (failedNames.length > 5 ? '…' : '')) +
      '. Xem mã lỗi cụ thể trong bảng kết nối phía dưới.</p></div>' +
      '<div>' + status('Một phần dữ liệu lỗi', 'amber') + '</div>';
  } else if (healthState === 'authentication_failed') {
    banner.className = 'banner error';
    banner.innerHTML = '<div><strong>KiotViet từ chối xác thực API.</strong><p>' +
      esc(err || 'Không thể cấp access token.') + ' Kiểm tra cấu hình và quyền API; không tự tạo khóa mới.</p></div>' +
      '<div>' + status('Lỗi xác thực', 'red') + '</div>';
  } else {
    banner.className = 'banner error';
    banner.innerHTML = '<div><strong>Chưa đọc được API KiotViet.</strong><p>' +
      esc(err || 'Chưa có tài nguyên nào trả kết quả thành công.') +
      ' Cần kiểm tra chi tiết từng API; chưa thể quy kết do bộ khóa.</p></div>' +
      '<div>' + status('Chưa khả dụng', 'red') + '</div>';
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

function branchName(id) {
  return state.session?.branches?.find(x => x.id === id)?.name || 'Chi nhánh';
}
function renderBranchChoices() {
  const a = document.getElementById('originBranch');
  const b = document.getElementById('destinationBranch');
  const oldA = a.value, oldB = b.value;
  const rows = state.session?.branches || [];
  const mine = new Set((state.session?.memberships || [])
    .filter(m => ['admin', 'manager', 'warehouse', 'store'].includes(m.role))
    .map(m => m.branch_id));
  if (state.session?.is_global_admin === true) {
    rows.filter(x => x.is_active !== false).forEach(x => mine.add(x.id));
  }
  a.innerHTML = '<option value="">Chọn kho gửi</option>' +
    rows.filter(x => mine.has(x.id) && x.is_active !== false)
      .map(x => '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>').join('');
  b.innerHTML = '<option value="">Chọn kho nhận</option>' +
    rows.filter(x => x.is_active !== false)
      .map(x => '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>').join('');
  if (mine.has(oldA)) a.value = oldA;
  else if (mine.size === 1) a.value = [...mine][0];
  if (rows.some(x => x.id === oldB)) b.value = oldB;
}
function renderRequestList() {
  const host = document.getElementById('requestList');
  const statuses = state.opsTab === 'open' ? ['submitted', 'assigned', 'rejected'] :
    state.opsTab === 'progress' ? ['accepted', 'picking', 'handed_over'] :
    ['completed', 'cancelled'];
  const q = (document.getElementById('requestSearch')?.value || '').trim().toLowerCase();
  const rows = state.requests.filter(x => statuses.includes(x.status) &&
    [x.id, x.note, branchName(x.origin_branch_id), branchName(x.destination_branch_id)]
      .some(s => String(s || '').toLowerCase().includes(q)));
  host.innerHTML = rows.length ? rows.map(r =>
    '<div class="thread ' + (state.selectedRequest?.id === r.id ? 'is-selected' : '') +
    '" data-request-id="' + esc(r.id) + '" tabindex="0" role="button">' +
    '<b>' + esc(branchName(r.origin_branch_id)) + ' → ' + esc(branchName(r.destination_branch_id)) +
    '</b><small>' + esc(r.id.slice(0,8).toUpperCase()) + ' · ' + esc(r.status) +
    ' · ' + esc(new Date(r.created_at).toLocaleString('vi-VN')) +
    '</small><small>' + esc(r.note || 'Yêu cầu kho') + '</small></div>'
  ).join('') :
    '<div class="thread placeholder"><b>Chưa có yêu cầu</b><small>Danh sách sẽ hiển thị khi có giao dịch thật.</small></div>';
  host.querySelectorAll('[data-request-id]').forEach(el => {
    el.onclick = () => openRequest(el.dataset.requestId);
    el.onkeydown = ev => { if (ev.key === 'Enter') openRequest(el.dataset.requestId); };
  });
}
function renderOperations() {
  const ready = Boolean(state.system?.integrations?.supabase?.ready);
  document.getElementById('operationsState').innerHTML = ready ?
    status('Backend kết nối', 'green') : status('Chờ kết nối', 'amber');
  if (state.session) renderBranchChoices();
  const source = document.getElementById('originBranch')?.value;
  const dest = document.getElementById('destinationBranch')?.value;
  const enabled = ready && state.session && state.draft.length > 0 &&
    source && dest && source !== dest && !state.submitting;
  document.getElementById('sendRequest').disabled = !enabled;
  if (state.selectedRequest) return;
  const empty = document.getElementById('opsEmpty');
  empty.innerHTML = ready
    ? ((state.session?.branches || []).length === 0
      ? '<b>Admin đã được xác thực.</b><span>Chưa có chi nhánh Whose thực tế. Đồng bộ danh sách chi nhánh từ KiotViet trước khi tạo yêu cầu; hệ thống không tự sinh kho mẫu.</span>'
      : '<b>Giao tiếp cửa hàng – kho</b><span>Chọn phiếu bên trái để xem chi tiết hoặc thêm SKU bên dưới và chọn tuyến để tạo yêu cầu.</span>')
    : '<b>Backend chưa sẵn sàng.</b><span>Kiểm tra cấu hình Supabase.</span>';
  renderRequestList();
}
async function openRequest(id) {
  const found = state.requests.find(x => x.id === id);
  if (!found) return;
  state.selectedRequest = found;
  renderRequestList();
  const empty = document.getElementById('opsEmpty');
  empty.innerHTML = '<b>Đang đọc nội dung yêu cầu…</b>';
  try {
    const res = await authorizedFetch('/api/backend?resource=request_lines&request_id=' +
      encodeURIComponent(id));
    if (!res.ok) throw new Error('request fetch failed');
    const { rows } = await res.json();
    if (state.selectedRequest?.id !== id) return;
    empty.innerHTML = '<div class="request-detail"><div class="request-heading">' +
      esc(branchName(found.origin_branch_id)) + ' → ' + esc(branchName(found.destination_branch_id)) +
      '</div>' + (rows || []).map(x => '<div class="request-line"><b>' +
        esc(x.sku) + '</b><span>SL: ' + esc(x.requested_qty) + '</span></div>').join('') +
      '<div class="request-meta">Mã phiếu: ' + esc(found.id) + '<br>Trạng thái: ' +
      esc(found.status) + '<br>Ghi chú: ' + esc(found.note || 'Không có') +
      '</div></div>';
  } catch {
    empty.innerHTML = '<b>Không thể tải chi tiết yêu cầu.</b><span>Thử mở lại phiếu.</span>';
  }
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
  if (!state.session) return;
  const refresh = document.getElementById('refresh');
  refresh.disabled = true;
  try {
    const [systemRes, overviewRes, requestRes] = await Promise.all([
      fetch('/api/system', { cache: 'no-store' }),
      authorizedFetch('/api/overview', { cache: 'no-store' }),
      authorizedFetch('/api/backend?resource=requests&limit=100', { cache: 'no-store' })
    ]);
    if (overviewRes.status === 401 || overviewRes.status === 403 ||
        requestRes.status === 401 || requestRes.status === 403) {
      lockApp('Phiên đăng nhập không còn quyền truy cập. Vui lòng đăng nhập lại.');
      return;
    }
    state.system = systemRes.ok ? await systemRes.json() : null;
    state.overview = overviewRes.ok ? await overviewRes.json() : null;
    state.requests = requestRes.ok ? ((await requestRes.json()).rows || []) : [];
    if (!overviewRes.ok) toast('Không thể tải dữ liệu KiotViet');
    if (!requestRes.ok) toast('Không thể tải yêu cầu kho');
    renderAll();
  } catch {
    toast('Không thể tải dữ liệu, vui lòng thử lại');
    renderAll();
  } finally {
    refresh.disabled = false;
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
    state.pendingKey = null;
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
      state.pendingKey = null;
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

const AUTH_SESSION_KEY = 'whose-studio-auth-v1';

function setAuthenticated(session) {
  state.session = session;
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  document.body.classList.add('is-authenticated');
  document.getElementById('authScreen').classList.add('is-hidden');
  document.getElementById('appRoot').classList.remove('is-locked');
  document.getElementById('staffName').textContent = session.user?.email || 'Nhân viên';
  document.getElementById('staffRole').textContent = session.is_global_admin === true
    ? 'Quản trị toàn hệ thống'
    : ((session.memberships || [])
      .map(m => m.role).filter((x, i, arr) => arr.indexOf(x) === i).join(', ') || 'Whose staff');
  renderBranchChoices();
  renderDraft();
}
function lockApp(message = '') {
  state.session = null;
  state.overview = null;
  state.requests = [];
  state.draft = [];
  state.selectedRequest = null;
  state.pendingKey = null;
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  document.body.classList.remove('is-authenticated');
  document.getElementById('appRoot').classList.add('is-locked');
  document.getElementById('authScreen').classList.remove('is-hidden');
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').textContent = message;
}
let refreshInFlight = null;
async function refreshAuth() {
  if (refreshInFlight) return refreshInFlight;
  if (!state.session?.refresh_token) throw new Error('No session');
  refreshInFlight = (async () => {
    const res = await fetch('/api/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refresh', refresh_token: state.session.refresh_token }),
      cache: 'no-store'
    });
    if (!res.ok) { lockApp('Phiên đăng nhập đã hết hạn.'); throw new Error('Refresh failed'); }
    setAuthenticated(await res.json());
  })();
  try { return await refreshInFlight; }
  finally { refreshInFlight = null; }
}
async function authorizedFetch(url, init = {}) {
  if (!state.session?.access_token) throw new Error('Authentication required');
  if (Number(state.session.expires_at || 0) * 1000 < Date.now() + 45000) await refreshAuth();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', 'Bearer ' + state.session.access_token);
  return fetch(url, { ...init, headers });
}
async function restoreAuth() {
  let stored = null;
  try { stored = JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY) || 'null'); } catch {}
  if (!stored?.access_token || !stored?.refresh_token) { lockApp(); return; }
  state.session = stored;
  try {
    let r = await authorizedFetch('/api/auth', { cache: 'no-store' });
    // Expired access tokens are expected; renew with the existing refresh token.
    if (r.status === 401) {
      await refreshAuth();
      r = await authorizedFetch('/api/auth', { cache: 'no-store' });
    }
    if (r.status === 401 || r.status === 403) {
      lockApp('Phiên đăng nhập không còn hợp lệ.');
      return;
    }
    if (!r.ok) throw new Error('SESSION_CHECK_UNAVAILABLE');
    const staff = await r.json();
    setAuthenticated({ ...state.session, ...staff });
    await loadData();
  } catch {
    // Keep valid cached credentials during temporary network/server failures.
    // Never delete a session simply because a request timed out during F5.
    if (state.session?.access_token && state.session?.refresh_token) {
      setAuthenticated(state.session);
      toast('Kết nối tạm gián đoạn. Có thể bấm Làm mới để thử lại.');
    } else lockApp('Vui lòng đăng nhập lại.');
  }
}
async function sendWhoseRequest() {
  if (state.submitting || !state.session) return;
  const origin = document.getElementById('originBranch').value;
  const destination = document.getElementById('destinationBranch').value;
  if (!origin || !destination || origin === destination || !state.draft.length) {
    toast('Chọn kho gửi, kho nhận và ít nhất một SKU');
    return;
  }
  const payload = {
    origin_branch_id: origin,
    destination_branch_id: destination,
    idempotency_key: state.pendingKey || crypto.randomUUID(),
    note: document.getElementById('requestNote').value.trim(),
    lines: state.draft.map(d => ({ sku: String(d.code || d.sku || '').trim(), qty: d.qty }))
  };
  if (payload.lines.some(x => !x.sku)) { toast('SKU không hợp lệ'); return; }
  state.pendingKey = payload.idempotency_key;
  state.submitting = true;
  renderOperations();
  try {
    const response = await authorizedFetch('/api/backend?resource=requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        lockApp('Bạn không có quyền gửi yêu cầu trên kho đã chọn.');
      } else toast('Không thể gửi yêu cầu. Thử lại sẽ không tạo trùng.');
      return;
    }
    const { id } = await response.json();
    state.draft = [];
    state.pendingKey = null;
    document.getElementById('requestNote').value = '';
    renderDraft();
    toast('Đã gửi yêu cầu · ' + String(id).slice(0,8).toUpperCase());
    const list = await authorizedFetch('/api/backend?resource=requests&limit=100');
    if (list.ok) state.requests = ((await list.json()).rows || []);
    state.opsTab = 'open';
    state.selectedRequest = null;
    document.querySelectorAll('#opsTabs button').forEach(el => el.classList.toggle('active',el.dataset.opsTab === 'open'));
    renderOperations();
    if (state.requests.some(x => x.id === id)) await openRequest(id);
  } catch { toast('Mất kết nối. Có thể thử lại mà không tạo phiếu trùng.'); }
  finally { state.submitting = false; renderOperations(); }
}

document.getElementById('loginForm').onsubmit = async ev => {
  ev.preventDefault();
  const button = document.getElementById('loginSubmit');
  button.disabled = true;
  const error = document.getElementById('loginError');
  error.textContent = '';
  try {
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value
      }), cache: 'no-store'
    });
    const data = await r.json();
    if (!r.ok) {
      error.textContent = data.error === 'STAFF_NOT_ONBOARDED'
        ? 'Tài khoản chưa được quản trị viên gán chi nhánh và quyền truy cập.'
        : 'Không thể đăng nhập. Kiểm tra tài khoản, mật khẩu và quyền nhân viên.';
      return;
    }
    setAuthenticated(data);
    document.getElementById('loginPassword').value = '';
    await loadData();
  } catch { error.textContent = 'Không kết nối được hệ thống. Vui lòng thử lại.'; }
  finally { button.disabled = false; }
};
document.getElementById('logoutBtn').onclick = async () => {
  const bearer = state.session?.access_token;
  lockApp();
  if (!bearer) return;
  try {
    await fetch('/api/auth', {
      method: 'POST', headers: { Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }), cache: 'no-store'
    });
  } catch {}
};
// Keep logout accessible when the mobile header hides its duplicate action.
document.getElementById('drawerLogoutBtn').onclick = () => document.getElementById('logoutBtn').click();
document.getElementById('addSku').onclick = () => {
  const input = document.getElementById('productInput');
  const sku = input.value.trim();
  if (!/^[A-Za-z0-9_.-]{2,100}$/.test(sku)) {
    toast('Nhập mã SKU hợp lệ hoặc chọn trong danh sách gợi ý');
    return;
  }
  const found = state.draft.find(x => String(x.code || x.sku).toLowerCase() === sku.toLowerCase());
  if (found) found.qty += 1;
  else state.draft.push({ sku, code: sku, qty: 1 });
  state.pendingKey = null;
  input.value = '';
  document.getElementById('suggestions').classList.remove('show');
  renderDraft();
};
document.getElementById('originBranch').onchange = () => { state.pendingKey = null; renderOperations(); };
document.getElementById('destinationBranch').onchange = () => { state.pendingKey = null; renderOperations(); };
document.getElementById('requestNote').oninput = () => { state.pendingKey = null; };
document.getElementById('requestSearch').oninput = renderRequestList;
document.querySelectorAll('#opsTabs button').forEach(el => el.onclick = () => {
  state.opsTab = el.dataset.opsTab;
  state.selectedRequest = null;
  document.querySelectorAll('#opsTabs button').forEach(b => b.classList.toggle('active', b === el));
  renderOperations();
});


document.querySelectorAll('.nav-item[data-page]').forEach((el) => el.onclick = () => navigate(el.dataset.page));
document.querySelectorAll('[data-jump-to]').forEach((el) => {
  el.addEventListener('click', () => {
    if (state.session && meta[el.dataset.jumpTo]) navigate(el.dataset.jumpTo);
  });
});
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
    toast('Đã mở danh mục sản phẩm. Tìm kiếm toàn bộ đang được phát triển.');
  }
});

let kiotBranchPreview=null;
let kiotBranchBusy=false;
function showKiotBranchMessage(message){
  document.getElementById('kiotBranchSyncStatus').textContent=message;
}
function renderKiotBranchPreview(){
  const rows=document.getElementById('kiotDirectoryRows');
  const data=kiotBranchPreview?.branches||[];
  rows.innerHTML=data.length ? data.map(b=>'<tr>'+
    '<td><b>'+esc(b.name)+'</b></td>'+
    '<td>'+esc(b.code||'—')+'</td>'+
    '<td>'+esc(b.id)+'</td>'+
    '<td>'+esc(b.address||'—')+'</td>'+
    '<td>'+esc(b.isActive===true?'Đang hoạt động':b.isActive===false?'Ngừng hoạt động':'Chưa có thông tin')+'</td>'+
    '</tr>').join('') : '<tr><td colspan="5" class="muted">Chưa có dữ liệu chi nhánh được xác minh.</td></tr>';
}
function setKiotBranchBusy(busy){
  kiotBranchBusy=busy;
  document.getElementById('kiotPreviewBranches').disabled=busy;
  document.getElementById('kiotImportBranches').disabled=busy||!kiotBranchPreview?.branches?.length;
}
async function inspectKiotBranches(){
  if(kiotBranchBusy || !state.session?.is_global_admin)return;
  setKiotBranchBusy(true);
  kiotBranchPreview=null;
  showKiotBranchMessage('Đang kiểm tra danh sách chi nhánh thực tế…');
  try{
    const r=await authorizedFetch('/api/kiot-branches',{cache:'no-store'});
    if(!r.ok) {
      const issue=await r.json().catch(()=>({}));
      const details=typeof issue.message==='string'?issue.message:typeof issue.error==='string'?issue.error:'Không thể truy cập API chi nhánh Whose Studio.';
      const code=typeof issue.code==='string'?' ['+issue.code+(issue.upstreamStatus?' – Kiot HTTP '+issue.upstreamStatus:'')+(issue.page?' – trang '+issue.page:'')+']':' [Whose HTTP '+r.status+']';
      throw new Error(details+code);
    }
    const d=await r.json();
    if(!Array.isArray(d.branches)||d.total!==d.branches.length)throw new Error('KiotViet data incomplete');
    kiotBranchPreview=d;
    showKiotBranchMessage('Đã xác minh '+d.total+' chi nhánh thực từ KiotViet ('+d.pages+' trang). Bạn có thể ghi nhận danh mục nguồn vào Whose.');
  }catch(e){
    const detail=e instanceof Error?e.message:'Lỗi không xác định';
    showKiotBranchMessage(detail+' Chưa có dữ liệu nào được nhập.');
  }finally{renderKiotBranchPreview();setKiotBranchBusy(false);}
}
async function importKiotBranches(){
  if(kiotBranchBusy||!state.session?.is_global_admin||!kiotBranchPreview?.branches?.length)return;
  setKiotBranchBusy(true);
  showKiotBranchMessage('Đang đối chiếu lại KiotViet và ghi nhận danh mục nguồn…');
  try{
    const r=await authorizedFetch('/api/kiot-branches',{
      method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'
    });
    if(!r.ok)throw new Error('Import unsuccessful');
    const d=await r.json();
    if(!Number.isInteger(d.imported)||d.imported<1||d.imported!==d.total)throw new Error('Unverified import');
    showKiotBranchMessage('Đã ghi nhận '+d.imported+' chi nhánh KiotViet thực tế vào danh mục nguồn Whose. Chưa phân loại Store/Warehouse và không thay đổi tồn.');
  }catch{
    showKiotBranchMessage('Không thể xác nhận việc ghi nhận danh mục. Vui lòng kiểm tra lại trước khi thử.');
  }finally{setKiotBranchBusy(false);}
}
async function inspectKiotCredentialConfig(){
  const button=document.getElementById('kiotCredentialCheck');
  const status=document.getElementById('kiotCredentialCheckResult');
  if(!state.session?.is_global_admin){
    status.textContent='Chỉ Global Admin mới được kiểm tra cấu hình.';
    return;
  }
  button.disabled=true;
  status.textContent='Đang đối chiếu nội bộ Whose Studio…';
  try {
    const r=await authorizedFetch('/api/kiot-credential-check',{cache:'no-store'});
    if(!r.ok)throw new Error('Không thể xác minh cấu hình Whose (HTTP '+r.status+').');
    const data=await r.json();
    if(!data?.clientId||!data?.clientSecret)throw new Error('Cấu trúc kết quả không hợp lệ.');
    const id=data.clientId,secret=data.clientSecret;
    const lines=[];
    if(!id.present) lines.push('Client ID: chưa cấu hình.');
    else if(id.matchesLatestSuppliedExactly) lines.push('Client ID: KHỚP chính xác với Client ID mới ngày 12/10.');
    else if(id.matchesLatestSuppliedAfterTrim) lines.push('Client ID: khớp mã mới ngày 12/10 sau khi bỏ khoảng trắng thừa.');
    else lines.push('Client ID: KHÔNG KHỚP với Client ID mới ngày 12/10. Cần kiểm tra Vercel hoặc lần thay mã sau đó.');
    if(id.present&&!id.guidFormat)lines.push('Client ID: không đúng định dạng UUID.');
    if(id.extraOuterWhitespace)lines.push('Client ID: có khoảng trắng thừa ở đầu/cuối.');
    if(id.wrappedInQuotes)lines.push('Client ID: có dấu nháy bao ngoài.');
    if(id.hasLineBreak)lines.push('Client ID: có ký tự xuống dòng.');
    lines.push('Client Secret: '+(secret.present?'đã cấu hình (không thể xác minh đúng giá trị từ phép kiểm tra này).':'chưa cấu hình.'));
    if(secret.extraOuterWhitespace)lines.push('Client Secret: có khoảng trắng ở đầu/cuối.');
    if(secret.wrappedInQuotes)lines.push('Client Secret: có dấu nháy bao ngoài.');
    if(secret.hasLineBreak)lines.push('Client Secret: có ký tự xuống dòng.');
    lines.push('Tên gian hàng: '+(data.retailerConfigured?'đã cấu hình.':'chưa cấu hình.'));
    lines.push('Lưu ý: phép đối chiếu không thử cấp token và không xác nhận Secret là hợp lệ.');
    status.textContent=lines.join('\n');
  }catch(e){
    status.textContent=e instanceof Error?e.message:'Không thể hoàn tất đối chiếu.';
  }finally{
    button.disabled=false;
  }
}
document.getElementById('kiotCredentialCheck').onclick=inspectKiotCredentialConfig;

document.getElementById('kiotPreviewBranches').onclick=inspectKiotBranches;
document.getElementById('kiotImportBranches').onclick=importKiotBranches;
renderKiotBranchPreview();

document.getElementById('sendRequest').onclick = sendWhoseRequest;
setupProductComposer();
navigate('dashboard');
restoreAuth();


// Explicit admin action; one source page per request. No KiotViet writes.
async function syncKiotInventory() {
  const btn=document.getElementById('inventorySyncBtn');
  const message=document.getElementById('inventorySyncStatus');
  if(!btn||!message||!state.session?.is_global_admin)return;
  if(!window.confirm('Đồng bộ tồn KiotViet về Whose cho các chi nhánh đã ánh xạ? Chỉ cập nhật snapshot Whose; không chỉnh tồn KiotViet.'))return;
  btn.disabled=true;
  let total=null,done=0,stored=0,unmapped=0;
  try {
    for(let page=0;page<1000;page++){
      message.textContent='Đang nhập trang '+(page+1)+'…';
      const response=await authorizedFetch('/api/kiot-inventory-sync',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({page,confirm:'IMPORT_KIOT_INVENTORY'}),cache:'no-store'
      });
      if(!response.ok)throw new Error('Trang '+(page+1)+' chưa nhập thành công (HTTP '+response.status+').');
      const row=await response.json();
      if(total===null)total=row.total;
      if(row.total!==total||row.productRows!==Math.min(100,Math.max(0,total-page*100)))
        throw new Error('Tổng sản phẩm nguồn thay đổi trong quá trình đồng bộ.');
      done+=row.productRows;stored+=row.stored;unmapped+=row.unmappedBranchRows;
      message.textContent='Đã đọc '+fmt(done)+' / '+fmt(total)+' sản phẩm, lưu '+fmt(stored)+' dòng tồn.';
      if(!row.hasMore){
        message.textContent+=' Hoàn thành.'+(unmapped?' Bỏ qua '+fmt(unmapped)+' dòng ở chi nhánh chưa ánh xạ.':'');
        await loadData();
        return;
      }
    }
    throw new Error('Vượt giới hạn số trang.');
  }catch(e){message.textContent=(e.message||'Đồng bộ chưa hoàn thành')+' Có thể chạy lại an toàn.';}
  finally{btn.disabled=false;}
}
document.getElementById('inventorySyncBtn')?.addEventListener('click',syncKiotInventory);
