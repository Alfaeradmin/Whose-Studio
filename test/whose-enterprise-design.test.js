const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('index.html'),shell=read('ws-shell.css'),auth=read('ui-auth-minimal.css');
const calling=read('calling-chat-box.html'),callCSS=read('calling-chat-box.css');
const nav=read('calling-navigation.js'),reset=read('reset-password.html');

test('active auth, catalogue and calling screens are maintained; future screens remain noninteractive',()=>{
 for(const id of ['appRoot','authScreen','loginForm','loginEmail','loginPassword','logoutBtn','wsSidebar',
  'wsNavProducts','wsNavCalling','wrMount','productsGrid','productsSearch','wsWarehouseToggle']){
  assert.ok(html.includes('id="'+id+'"'),'Missing active component '+id);
 }
 assert.match(html,/src="\/auth-shell\.js/);
 assert.match(html,/src="\/calling-navigation\.js/);
 assert.match(reset,/src="\/reset-password\.js"/);
 assert.match(html,/class="ws-nav-unavailable"/);
 assert.equal((html.match(/class="ws-nav-link/g)||[]).length,2,'only tested operational screens are linked');
});
test('active design system covers sign-in and one-at-a-time mobile operations',()=>{
 assert.match(html,/href="\/ws-shell\.css/);
 assert.match(html,/href="\/ui-auth-minimal\.css/);
 assert.match(html,/href="\/calling-chat-box\.css/);
 assert.match(auth,/min-height:100dvh/);
 assert.match(shell,/@media\(max-width:800px\)/);
 assert.match(callCSS,/data-mobile-pane="inbox"/);
 assert.match(callCSS,/data-mobile-pane="chat"/);
 assert.match(callCSS,/data-mobile-pane="detail"/);
 assert.match(callCSS,/env\(safe-area-inset-bottom\)/);
 assert.match(callCSS,/font-size:16px/);
 assert.doesNotMatch([shell,auth,callCSS].join('\n'),/url\(\s*['"]?https?:\/\/|@import/i);
});
test('navigation and mobile panes are wired to real screens',()=>{
 assert.match(nav,/mark\(page\)/);
 assert.match(nav,/aria-current/);
 assert.match(nav,/window\.whoseCallingOpen/);
 assert.match(nav,/window\.whoseCallingClose/);
 for(const name of ['inbox','chat','detail'])assert.ok(calling.includes('data-wc-pane="'+name+'"'));
 assert.match(read('calling-chat-box.js'),/function showPane\(next\)/);
});
test('inventory and sales figures cannot be fabricated from visual placeholders',()=>{
 for(const id of ['productsTotal','productsPhotos','productsLastSync'])assert.ok(html.includes('id="'+id+'">—'));
 assert.match(html,/KiotViet chỉ đọc; không ghi tồn kho/);
 assert.match(read('sync-health.js'),/CHƯA XÁC MINH/);
 assert.match(read('lib/whose-sync-health.js'),/realtimeVerified:false/);
 assert.doesNotMatch(callCSS,/\bcontent:\s*["'](?:100|999|1,000)\b/);
});
