// Password recovery tokens live only in this page's memory and are stripped
// from browser URL/history immediately. Never log, persist or transmit them
// except as HTTPS Authorization bearer to the dedicated Whose auth endpoint.
(() => {
  'use strict';
  const requestForm = document.getElementById('requestForm');
  const completeForm = document.getElementById('completeForm');
  const info = document.getElementById('resetInfo');
  const title = document.getElementById('resetTitle');
  const notice = document.getElementById('resetNotice');
  const error = document.getElementById('resetError');
  const fragment = new URLSearchParams(location.hash.slice(1));
  const accessToken = fragment.get('type') === 'recovery' ? fragment.get('access_token') : null;
  const wasRedirectError = Boolean(fragment.get('error') || fragment.get('error_description'));

  // Remove the URL fragment before any further network requests occur.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);

  if (accessToken && /^[A-Za-z0-9._~-]+$/.test(accessToken) && accessToken.length > 16) {
    requestForm.hidden = true;
    completeForm.hidden = false;
    title.textContent = 'Tạo mật khẩu mới';
    info.textContent = 'Liên kết được xác nhận. Hãy chọn mật khẩu mạnh cho tài khoản Whose Studio.';
  } else if (wasRedirectError) {
    error.textContent = 'Liên kết đã hết hạn hoặc không hợp lệ. Hãy yêu cầu email mới.';
  }

  async function send(body, bearer) {
    const headers = { 'Content-Type': 'application/json' };
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    const response = await fetch('/api/password', {
      method: 'POST', headers, cache: 'no-store', body: JSON.stringify(body)
    });
    let payload = {};
    try { payload = await response.json(); } catch {}
    return { ok: response.ok, status: response.status, payload };
  }

  requestForm.onsubmit = async (event) => {
    event.preventDefault();
    error.textContent = '';
    notice.textContent = '';
    const btn = document.getElementById('requestBtn');
    btn.disabled = true;
    try {
      const response = await send({
        action: 'request',
        email: document.getElementById('resetEmail').value.trim()
      });
      if (response.ok) notice.textContent =
        'Nếu email hợp lệ, bạn sẽ nhận được liên kết đặt mật khẩu. Hãy mở email trên cùng trình duyệt đã đăng nhập Vercel Preview.';
      else if (response.status === 429)
        error.textContent = 'Có quá nhiều lượt yêu cầu. Vui lòng chờ rồi thử lại.';
      else error.textContent = 'Không gửi được yêu cầu. Kiểm tra email và cấu hình Supabase Auth.';
    } catch { error.textContent = 'Mất kết nối, vui lòng thử lại.'; }
    finally { btn.disabled = false; }
  };
  completeForm.onsubmit = async (event) => {
    event.preventDefault();
    error.textContent = '';
    notice.textContent = '';
    if (!accessToken) { error.textContent = 'Cần mở liên kết xác nhận từ email.'; return; }
    const password = document.getElementById('newPassword').value;
    const verify = document.getElementById('confirmPassword').value;
    if (password.length < 12 || password.length > 128 || password !== verify) {
      error.textContent = 'Mật khẩu phải dài ít nhất 12 ký tự và hai lần nhập phải khớp.';
      return;
    }
    const btn = document.getElementById('completeBtn');
    btn.disabled = true;
    try {
      const response = await send({ action: 'complete', password }, accessToken);
      if (response.ok) {
        completeForm.hidden = true;
        title.textContent = 'Đã thiết lập mật khẩu';
        info.textContent = 'Bạn có thể quay lại trang đăng nhập Whose Studio bằng email và mật khẩu mới.';
        notice.textContent = 'Đã lưu mật khẩu thành công.';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
      } else {
        error.textContent = response.status === 401 || response.status === 403
          ? 'Liên kết xác nhận đã hết hạn hoặc tài khoản không được phép.'
          : 'Không thể cập nhật mật khẩu. Hãy yêu cầu email khôi phục mới.';
      }
    } catch { error.textContent = 'Mất kết nối. Vui lòng thử lại hoặc yêu cầu email mới.'; }
    finally { btn.disabled = false; }
  };
})();