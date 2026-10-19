const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const view=require('../request-type');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('purpose classification preserves meaning without asserting a Kiot transaction',()=>{
 for(const [kind,label] of Object.entries(view.labels)){
  const value=view.formatPurpose(kind,'Khách đang đợi size M');
  assert.equal(view.classify(value).kind,kind);
  assert.equal(view.classify(value).label,label);
  assert.equal(view.classify(value).note,'Khách đang đợi size M');
 }
 assert.equal(view.classify('Hàng theo nhu cầu').kind,'other');
 assert.throws(()=>view.formatPurpose('unknown','test'),/Unsupported/);
 assert.throws(()=>view.formatPurpose('trial','x'),/3–950/);
});
test('urgent requests first, FIFO per priority, closed requests last',()=>{
 const rows=[
  {id:'normal-old',priority:'normal',status:'submitted',created_at:'2026-10-19T01:00:00Z'},
  {id:'urgent-new',priority:'urgent',status:'submitted',created_at:'2026-10-19T02:00:00Z'},
  {id:'done',priority:'urgent',status:'completed',created_at:'2026-10-19T03:00:00Z'},
  {id:'urgent-old',priority:'urgent',status:'picking',created_at:'2026-10-18T22:00:00Z'}
 ];
 assert.deepEqual(view.sortedQueue(rows).map(x=>x.id),['urgent-old','urgent-new','normal-old','done']);
 assert.equal(rows[0].id,'normal-old');
});
test('branch perspective cannot be spoofed by the UI',()=>{
 const member={memberships:[{branch_id:'LVS',role:'store'}],is_global_admin:false};
 assert.deepEqual(view.perspectives(member,'LVS'),['store']);
 assert.deepEqual(view.perspectives(member,'NVT'),[]);
 assert.deepEqual(view.perspectives({memberships:[{branch_id:'LVS',role:'warehouse'}]},'LVS'),['warehouse']);
 assert.deepEqual(view.perspectives({memberships:[{branch_id:'LVS',role:'manager'}]},'LVS'),['store','warehouse']);
 assert.deepEqual(view.perspectives({is_global_admin:true},'NVT'),['store','warehouse']);
 assert.deepEqual(view.perspectives({is_global_admin:true},''),[]);
});
test('backend checks membership and SQL RPC before writes',()=>{
 const api=read('api/whose-chat.js'),browser=read('calling-chat-box.js');
 assert.match(api,/validateStaffBearer\(bearer\)/);
 assert.match(api,/verifyOrigin\(req\)/);
 assert.match(api,/scoped\(body\.branch_id\)/);
 assert.match(api,/rpc\/whose_chat_create/);
 assert.match(api,/rpc\/whose_chat_act/);
 assert.match(browser,/requestType\(\)\.perspectives/);
 assert.match(browser,/searchCache\.clear\(\)/);
 assert.match(browser,/whose:logged-out/);
 assert.match(browser,/authEpoch\+\+/);
 assert.match(browser,/epoch!==authEpoch/);
 assert.match(browser,/response\.result\?\.status/);
});
test('mobile operations are one pane per step and forms tag reason explicitly',()=>{
 const html=read('calling-chat-box.html'),css=read('calling-chat-box.css'),js=read('calling-chat-box.js');
 for(const pane of ['inbox','chat','detail'])assert.ok(html.includes('data-wc-pane="'+pane+'"'));
 for(const kind of Object.keys(view.labels))assert.ok(html.includes('value="'+kind+'"'));
 assert.match(js,/showPane\('chat'\)/);
 assert.match(js,/requestType\(\)\.formatPurpose/);
 assert.match(css,/data-mobile-pane="detail"/);
 assert.match(html,/maxlength="1000"/);
});

test('speed: selected chat persists on list-only refresh; opening is nonblocking',()=>{
 const js=read('calling-chat-box.js'),products=read('products-new.js');
 assert.match(js,/if\(!syncDetail\)\{ \/\* list-only refresh:/);
 assert.match(js,/void refresh\(\);return true/);
 assert.match(js,/currentRow&&\(!detail\|\|detail\.thread\.updated_at!==currentRow\.updated_at\)/);
 assert.match(js,/void select\(before,\{force:true\}\);void refresh\(true,false\)/);
 assert.doesNotMatch(products,/if\(ui\.admin\)void autoSync\(\)/);
 assert.match(products,/visible\(\)&&!ui\.syncing/);
});
test('speed: server authorization validates independent Supabase reads concurrently',()=>{
 const auth=read('lib/whose-auth.js');
 assert.match(auth,/const \[userResult,membershipResult,adminResult,branchesResult\] = await Promise\.all\(/);
 assert.match(auth,/if \(!userResult\.ok \|\| !userResult\.data\?\.id\)/);
 assert.match(auth,/if \(!membershipResult\.ok \|\| !adminResult\.ok\)/);
 assert.match(auth,/!branchesResult\.ok \|\| !Array\.isArray\(branchesResult\.data\)/);
});
test('simplified form: optional new note, mandatory add reason, tablet SKU drawer',()=>{
 const js=read('calling-chat-box.js'),html=read('calling-chat-box.html'),css=read('calling-chat-box.css');
 assert.match(js,/el\('wcPurpose'\)\.required=next==='add'/);
 assert.match(js,/createMode==='add'&&purpose\.length<3/);
 assert.match(html,/id="wcViewSKU"/);
 assert.match(html,/id="wcNextActionHint"/);
 assert.match(css,/min-width:761px\) and \(max-width:1250px/);
 assert.match(css,/data-detail-open="true"/);
 assert.equal(view.formatPurpose('trial',''),'Khách thử');
 assert.equal(view.classify('Khách thử').kind,'trial');
});
