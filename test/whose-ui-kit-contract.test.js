const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const home=read('index.html'),reset=read('reset-password.html');
const auth=read('ui-auth-minimal.css'),shell=read('ws-shell.css');
const css=read('calling-chat-box.css'),calling=read('calling-chat-box.html');
const js=read('calling-chat-box.js'),nav=read('calling-navigation.js');

test('active stylesheet/script order is consistent with the actually mounted Whose shell',()=>{
 const cssOrder=['ui-auth-minimal.css','products-new.css','calling-chat-box.css','ws-shell.css'].map(x=>home.indexOf(x));
 assert.ok(cssOrder.every(x=>x>0),'missing active stylesheet');
 assert.ok(cssOrder.every((x,i)=>i===0||x>cssOrder[i-1]));
 const jsOrder=['auth-shell.js','request-type.js','calling-chat-box.js','calling-navigation.js','warehouse-context.js'].map(x=>home.indexOf(x));
 assert.ok(jsOrder.every(x=>x>0),'missing active JS');
 assert.ok(jsOrder.every((x,i)=>i===0||x>jsOrder[i-1]));
 assert.doesNotMatch(home,/src="\/app\.js"/);
});
test('responsive shell has tokens, reduced motion and touch-sized controls',()=>{
 for(const token of ['--ws-ink:','--ws-border:','--ws-surface:','--ws-accent:','--ws-motion:'])
  assert.ok(shell.includes(token),'missing theme token '+token);
 assert.match(shell,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(auth,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/overflow-y:auto/);
});
test('IDs remain unique and logout can be accessed on mobile',()=>{
 for(const page of [home,calling,reset]){
  const ids=[...page.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(ids.length,new Set(ids).size,'duplicate DOM id');
 }
 assert.match(home,/id="logoutBtn"/);
 assert.match(read('auth-shell.js'),/document\.getElementById\('logoutBtn'\)/);
 assert.match(shell,/#appRoot \.workspace-logout/);
 assert.match(shell,/@media\(max-width:800px\)/);
});
test('native scroll areas require no wheel interceptors',()=>{
 for(const pattern of [/\.wc-inbox-list\{[^}]*overflow-y:auto/,/\.wc-messages\{[^}]*overflow:auto/,
  /\.wc-detail-rail\{[^}]*overflow:auto/,/\.wc-create-main\{[^}]*overflow:auto/])
  assert.match(css,pattern);
 assert.doesNotMatch(js,/addEventListener\(['"]wheel['"]/);
});
test('phone workflow displays just one active pane instead of overlapping the inbox',()=>{
 for(const name of ['inbox','chat','detail'])assert.ok(calling.includes('data-wc-pane="'+name+'"'));
 assert.match(css,/\.wc-page\[data-mobile-pane="inbox"\] \.wc-chat/);
 assert.match(css,/\.wc-page\[data-mobile-pane="chat"\] \.wc-inbox/);
 assert.match(css,/\.wc-page\[data-mobile-pane="detail"\] \.wc-chat/);
 assert.match(js,/function showPane\(next\)/);
 assert.match(js,/showPane\('inbox'\)/);
});
test('stock diagnostics do not mistake an observation for verified live inventory',()=>{
 assert.match(home,/id="productsTotal">—/);
 assert.match(home,/id="productsPhotos">—/);
 assert.match(read('sync-health.js'),/CHƯA XÁC MINH/);
 assert.match(read('api/kiot-sync-health.js'),/staff\.is_global_admin!==true/);
 assert.doesNotMatch([auth,shell,css].join('\n'),/@import|url\(\s*['"]?https?:\/\//i);
});
test('local SVG registry avoids remote icons and dynamic markup injection',()=>{
 for(const name of ['ws-i-brand','ws-i-messages','ws-i-menu','ws-i-logout'])assert.ok(home.includes('id="'+name+'"'));
 assert.match(nav,/\.classList\.toggle/);
 assert.doesNotMatch(js,/innerHTML\s*=\s*[^;]*\+/);
});
