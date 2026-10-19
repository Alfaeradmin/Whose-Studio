const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const model=require('../calling-history-model');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('all operational actions remain together while staff notes stay in the chat',()=>{
 const records=[
  {id:1,event_type:'created',body:'Tạo yêu cầu'},
  {id:2,event_type:'claim',body:'Kho nhận'},
  {id:3,event_type:'note',body:'Nhắn kho gấp'},
  {id:4,event_type:'pick',body:'Soạn 2'},
  {id:5,event_type:'handoff',body:'Giao cho cửa hàng'},
  {id:6,event_type:'note',body:'Đã thấy hàng'},
  {id:7,event_type:'receive_return',body:'Kho nhận trả'}
 ];
 const {actions,messages}=model.partition(records);
 assert.deepEqual(actions.map(e=>e.id),[1,2,4,5,7]);
 assert.deepEqual(messages.map(e=>e.id),[3,6]);
 assert.equal(actions.length+messages.length,records.length);
 assert.equal(model.latestAction(actions).id,7);
 assert.equal(model.latestAction([]),null);
 assert.equal(model.partition(null).actions.length,0);
});
test('unknown operational event types and reasons are NOT discarded',()=>{
 const events=[
  {id:10,event_type:'shortage',body:'Thiếu size M',qty:2},
  {id:11,event_type:'cancel',body:'Khách đổi ý'},
  {id:12,event_type:'added_sku',body:'Bổ sung mã'}
 ];
 assert.deepEqual(model.partition(events).actions,events);
 assert.strictEqual(model.latestAction(events),events[2]);
});
test('frontend contains ONE accessible, expandable audit log, not one bubble per operation',()=>{
 const js=read('calling-chat-box.js'),css=read('calling-chat-box.css'),html=read('index.html');
 assert.match(js,/window\.WhoseChatHistory\.partition\(d\.events\|\|\[\]\)/);
 assert.match(js,/node\('details','wc-history-card'\)/);
 assert.match(js,/historyPanel\.append\(log\)/);
 assert.match(read('calling-chat-box.html'),/id="wcHistoryPanel"/);
 assert.match(js,/node\('summary','wc-history-summary'\)/);
 assert.match(js,/for\(const event of \[\.\.\.timeline\.actions\]\.reverse\(\)\)/);
 assert.match(js,/for\(const event of timeline\.messages\)/);
 assert.match(js,/historyExpanded\.set\(historyKey,log\.open\)/);
 assert.match(js,/historyExpanded\.clear\(\)/);
 assert.match(js,/if\(d\.historyTruncated\)contents\.append/);
 assert.match(js,/event\.body/);
 assert.match(js,/event\.line_id\?lineIndex\.get\(event\.line_id\)/);
 assert.doesNotMatch(js,/for\(const e of d\.events\|\|\[\]\)/);
 assert.match(css,/\.wc-history-contents\{[^}]*overflow-y:auto/);
 assert.match(css,/\.wc-history-panel:empty\{display:none\}/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.ok(html.indexOf('/calling-history-model.js')<html.indexOf('/calling-chat-box.js'));
});

test('mobile expanded history overlays the scroll safely without resizing the composer',()=>{
 const css=read('calling-chat-box.css');
 assert.match(css,/\.wc-history-panel\{position:relative;z-index:8\}/);
 assert.match(css,/\.wc-history-panel \.wc-history-contents\{position:absolute/);
 assert.match(css,/max-height:min\(260px,44dvh\)/);
 assert.match(css,/border-radius:0 0 12px 12px/);
});
