// Minimal Kiot branch diagnostics; do not return upstream text or secrets.
const MESSAGE = Object.freeze({
  KIOT_TOKEN_DENIED: 'Không thể lấy token KiotViet. Cần kiểm tra HTTP status và thông tin kết nối API.',
  KIOT_TOKEN_INVALID_CLIENT: 'KiotViet báo invalid_client: Client ID/Client Secret không đúng cặp, bị thu hồi hoặc cấu hình không hợp lệ.',
  KIOT_TOKEN_SCOPE: 'KiotViet không chấp nhận PublicApi.Access. Kiểm tra loại gian hàng và quyền kết nối API.',
  KIOT_TOKEN_UNAUTHORIZED_CLIENT: 'KiotViet không cấp quyền client_credentials cho kết nối này.',
  KIOT_TOKEN_REQUEST_INVALID: 'KiotViet không chấp nhận định dạng yêu cầu cấp token.',
  KIOT_TOKEN_PROVIDER_UNAVAILABLE: 'Máy chủ xác thực KiotViet hiện không sẵn sàng.',
  KIOT_TOKEN_THROTTLED: 'KiotViet giới hạn yêu cầu cấp token. Hãy chờ rồi thử lại.',
  KIOT_BRANCH_UNAUTHORIZED: 'KiotViet từ chối quyền xem chi nhánh. Kiểm tra Retailer và phạm vi token.',
  KIOT_BRANCH_BAD_REQUEST: 'KiotViet từ chối tham số lấy danh sách chi nhánh.',
  KIOT_BRANCH_UNAVAILABLE: 'KiotViet chưa phản hồi được danh sách chi nhánh.',
  KIOT_BRANCH_PAGINATION: 'Phân trang KiotViet không nhất quán; dữ liệu chưa được nhập.',
  KIOT_BRANCH_FORMAT: 'Cấu trúc dữ liệu chi nhánh KiotViet không đúng dự kiến.',
  KIOT_BRANCH_DATA: 'Danh sách KiotViet có mã hoặc thông tin chi nhánh không hợp lệ.',
  KIOT_BRANCH_UNKNOWN: 'Không thể xác minh danh sách chi nhánh KiotViet.'
});
function issue(code,page=0) {
  const err=new Error(code);
  err.code=Object.hasOwn(MESSAGE,code)?code:'KIOT_BRANCH_UNKNOWN';
  err.page=page+1;
  return err;
}
function classifyFailure(value) {
  const s=typeof value==='string'?value:'';
  const token=s.match(/KiotViet token failed \((\d{3})\): ([a-z_]+)/);
  if(token) {
    const status=Number(token[1]),oauth=token[2];
    if(status===429) return 'KIOT_TOKEN_THROTTLED';
    if(oauth==='invalid_client')return 'KIOT_TOKEN_INVALID_CLIENT';
    if(oauth==='invalid_scope')return 'KIOT_TOKEN_SCOPE';
    if(oauth==='unauthorized_client')return 'KIOT_TOKEN_UNAUTHORIZED_CLIENT';
    if(oauth==='invalid_request'||oauth==='unsupported_grant_type')return 'KIOT_TOKEN_REQUEST_INVALID';
    if(status>=500)return 'KIOT_TOKEN_PROVIDER_UNAVAILABLE';
    return 'KIOT_TOKEN_DENIED';
  }
  if(/KiotViet token failed \(\d{3}\)/.test(s)) return 'KIOT_TOKEN_DENIED';
  const request=s.match(/KiotViet GET \/branches failed \((\d{3})\)/);
  if(request) {
    const status=Number(request[1]);
    if(status===401||status===403)return 'KIOT_BRANCH_UNAUTHORIZED';
    if(status===400||status===422)return 'KIOT_BRANCH_BAD_REQUEST';
    return 'KIOT_BRANCH_UNAVAILABLE';
  }
  if(s.includes('Missing environment variable'))return 'KIOT_TOKEN_DENIED';
  return 'KIOT_BRANCH_UNAVAILABLE';
}
function safeDetails(err){
  const code=err?.code&&Object.hasOwn(MESSAGE,err.code)?err.code:'KIOT_BRANCH_UNKNOWN';
  return {code,message:MESSAGE[code],page:Number.isInteger(err?.page)?err.page:null,
    upstreamStatus:Number.isInteger(err?.upstreamStatus)?err.upstreamStatus:null};
}
module.exports={issue,classifyFailure,safeDetails};
