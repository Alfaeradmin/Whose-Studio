const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'ui-enterprise-v2.css'),'utf8');
const js=fs.readFileSync(path.join(root,'app.js'),'utf8');
const reset=fs.readFileSync(path.join(root,'reset-password.html'),'utf8');
const sectionIds=['dashboard','operations','inventory','transfers','stocktake','returns','products','productSync','employees','kiot','settings'];
const primaryNavIds=['dashboard','productSync','inventory','employees','orders','warehouse','operations','settings'];
const protectedIds=['appRoot','authScreen','loginForm','loginEmail','loginPassword','globalSearch','refresh','sendRequest','originBranch','destinationBranch','requestList','kiotCredentialCheck','kiotPreviewBranches','kiotImportBranches','kiotDirectoryRows','staffName','staffRole'];

test('every existing operational view and auth input is preserved',()=>{
  for(const id of [...sectionIds,...protectedIds]){
    const found=html.match(new RegExp('id="'+id+'"','g'))||[];
    assert.ok(found.length>=1,'Missing '+id);
  }
  assert.match(html,/src="\/app\.js" defer/);
  assert.match(reset,/src="\/reset-password\.js" defer/);
});

test('design system covers main, recovery, responsive and real operations',()=>{
  assert.match(html,/href="\/ui-enterprise-v2\.css\?v=20261012"/);
  assert.match(reset,/href="\/ui-enterprise-v2\.css\?v=20261012"/);
  for(const token of [
    '--accent:', '.dashboard-hero{','.ops-layout{','.table th{',
    '.mobile-tabbar{','.auth-panel{','.sidebar{','.module-card{',
    '.composer-area{','@media (max-width:900px)'
  ])assert.ok(css.includes(token),'Missing '+token);
  assert.ok(css.length>10000);
  assert.doesNotMatch(css,/(?:url\(\s*['"]?https?:\/\/)|@import/i,'No third-party asset fetches');
});

test('navigation is semantic, fully wired and dashboard quick actions are real',()=>{
  for(const page of primaryNavIds)assert.match(html,new RegExp('<button type="button" class="nav-item(?: active)?" data-page="'+page+'"'));
  assert.equal((html.match(/class="nav-item(?: active)?" data-page=/g)||[]).length,8);
  assert.ok(html.includes('data-jump-to="operations"'));
  assert.ok(html.includes('data-jump-to="kiot"'));
  assert.ok(js.includes("document.querySelectorAll('[data-jump-to]')"));
  assert.ok(js.includes("navigate(el.dataset.jumpTo)"));
  assert.ok(js.includes("el.setAttribute('aria-current', 'page')"));
});

test('the UI does not invent inventory or financial KPIs',()=>{
  assert.ok(html.includes('id="metricProducts">—'));
  assert.ok(html.includes('id="metricOrders">—'));
  assert.ok(html.includes('id="metricInventory">—'));
  assert.match(html,/không ghi ngược dữ liệu KiotViet/);
  assert.doesNotMatch(css,/\bcontent:\s*["'](?:100|999|1,000)\b/);
});
