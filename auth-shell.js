'use strict';
const KEY='whose-studio-auth-v1';
const authScreen=document.getElementById('authScreen');
const appRoot=document.getElementById('appRoot');
const error=document.getElementById('loginError');
let session=null;
window.whoseSession=()=>session;
window.whoseAccessToken=async()=>{
 if(!session?.access_token)return null;
 if(Number(session.expires_at||0)*1000<Date.now()+45000&&session.refresh_token){
  try{const renewed=await authPost({action:'refresh',refresh_token:session.refresh_token});showApp(renewed)}catch{showLogin('Phiên đăng nhập đã hết hạn.');return null}
 }
 return session?.access_token||null;
};
function showApp(data){
  session=data;
  sessionStorage.setItem(KEY,JSON.stringify(data));
  authScreen.hidden=true;
  appRoot.hidden=false;
  if(typeof window.whoseProductsInit==='function')window.whoseProductsInit(data);
  window.dispatchEvent(new Event('whose:authenticated'));
}
function showLogin(message=''){
  session=null;sessionStorage.removeItem(KEY);
  window.dispatchEvent(new Event('whose:logged-out'));
  window.whoseCallingClose?.();
  appRoot.hidden=true;authScreen.hidden=false;
  error.textContent=message;
  document.getElementById('loginPassword').value='';
}
async function authPost(payload){
  const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok){const e=new Error(data.error||'AUTH_FAILED');e.status=r.status;throw e}
  return data;
}
async function restore(){
  let saved=null;try{saved=JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{}
  if(!saved?.access_token||!saved?.refresh_token){showLogin();return}
  try{
    if(Number(saved.expires_at||0)*1000<Date.now()+45000){
      saved=await authPost({action:'refresh',refresh_token:saved.refresh_token});
    }
    const r=await fetch('/api/auth',{headers:{Authorization:'Bearer '+saved.access_token},cache:'no-store'});
    if(!r.ok)throw new Error('INVALID_SESSION');
    const staff=await r.json();
    showApp({...saved,...staff});
  }catch{showLogin('Phiên đăng nhập đã hết hạn.')}
}
document.getElementById('loginForm').addEventListener('submit',async ev=>{
  ev.preventDefault();
  const btn=document.getElementById('loginSubmit');
  btn.disabled=true;error.textContent='';
  try{
    const data=await authPost({action:'login',email:document.getElementById('loginEmail').value,password:document.getElementById('loginPassword').value});
    showApp(data);document.getElementById('loginPassword').value='';
  }catch(e){
    error.textContent=e.message==='STAFF_NOT_ONBOARDED'
      ?'Tài khoản chưa được quản trị viên gán quyền truy cập.'
      :'Không thể đăng nhập. Kiểm tra tài khoản, mật khẩu và quyền nhân viên.';
  }finally{btn.disabled=false}
});
document.getElementById('logoutBtn').addEventListener('click',async()=>{
  const old=session;showLogin();
  if(old?.access_token){
    try{await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+old.access_token},body:JSON.stringify({action:'logout'}),cache:'no-store'})}catch{}
  }
});
restore();
