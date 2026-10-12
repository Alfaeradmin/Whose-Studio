const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const foundation=read('ui-foundation.css');
const components=read('ui-components.css');
const enterprise=read('ui-enterprise-v2.css');
const home=read('index.html');
const reset=read('reset-password.html');
const app=read('app.js');
const spec=read('docs/whose-ui-kit-v1.md');

test('single versioned UI Kit is loaded in both applications, after legacy styles',()=>{
  for(const page of [home,reset]){
    const order=['/app.css','/ui-foundation.css?v=1.0.0','/ui-enterprise-v2.css?v=20261012','/ui-components.css?v=1.0.0'].map(name=>page.indexOf(name));
    assert.ok(order.every(n=>n>=0),'missing stylesheets');
    assert.ok(order.every((n,i)=>i===0||n>order[i-1]),'wrong CSS order');
  }
});
test('Whose Foundation has semantic tokens, spacing, touch targets and explicit layered z-index scale',()=>{
  for(const token of ['--ws-brand:','--ws-success:','--ws-warning:','--ws-danger:','--ws-info:','--ws-bg:','--ws-font-body:','--ws-space-4:','--ws-control-touch:44px','--ws-radius-md:','--ws-scroll-size:','--ws-motion-enter:']){
    assert.ok(foundation.includes(token), 'missing token '+token);
  }
  const levels=['base','sticky','header','bottom-nav','popover','backdrop','drawer','dialog','toast'];
  const v=levels.map(l=>{
    const m=new RegExp('--ws-layer-'+l+':(\\d+)').exec(foundation);
    assert.ok(m,'missing layer '+l);
    return Number(m[1]);
  });
  assert.ok(v.every((x,i)=>i===0||x>v[i-1]),'layer scale overlaps');
  assert.ok(spec.includes('ALFAER WMS'));
});
test('no duplicate document IDs and mobile logout remains available',()=>{
  const ids=[...home.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size,'duplicate DOM id breaks status rendering');
  assert.ok(ids.includes('drawerLogoutBtn'));
  assert.match(app,/drawerLogoutBtn'\)\.onclick\s*=\s*\(\)\s*=>\s*document\.getElementById\('logoutBtn'\)\.click\(\)/);
  assert.match(app,/setAttribute\('aria-expanded', String\(isOpen\)\)/);
  assert.match(app,/setAttribute\('aria-expanded', 'false'\)/);
  assert.match(components,/\.drawer-logout/);
});
test('scrollbar contract uses native scrolling with no synthetic wheel event interception',()=>{
  for(const selector of ['.content','.thread-list','.chat-body','.table-wrap','.composer-area']){
    assert.ok(components.includes(selector),'missing scrolling '+selector);
  }
  assert.match(components,/\.table-wrap\{[\s\S]*?overflow:auto/);
  assert.match(components,/\.table th\{z-index:var\(--ws-layer-sticky\)/);
  assert.doesNotMatch(app,/addEventListener\(['"]wheel['"]/);
  assert.match(components,/\.suggestions\{[\s\S]*?position:relative/);
});
test('animation honors accessibility; controls cannot overlap',()=>{
  assert.match(components,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(foundation,/--ws-motion-enter:0ms/);
  assert.match(components,/\.nav-item \.nav-text\{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis/);
  assert.match(components,/@media\(max-width:540px\)\{/);
  assert.match(components,/\.composer \.send\{grid-column:1\/-1/);
  assert.match(components,/\.ws-dialog\{[\s\S]*?max-height:calc\(100dvh - 32px\)/);
});
test('UI Kit protects API/DB behavior and does not fake metrics',()=>{
  assert.match(home,/id="metricProducts">—/);
  assert.match(home,/id="metricInventory">—/);
  assert.ok(app.includes("function inspectKiotBranches()"));
  assert.match(spec,/không ghi KiotViet hoặc tồn kho/);
  assert.doesNotMatch([foundation,components,enterprise].join('\n'),/(?:@import|url\(['"]?https?:\/\/)/i);
});

const {WHOSE_ICON_PATHS,whoseIconMarkup}=require('../ui-icons');
test('central Whose icon registry replaces generic glyphs without external assets',()=>{
  assert.ok(home.includes('src="/ui-icons.js?v=1.0.0" defer'));
  assert.ok(home.indexOf('src="/ui-icons.js?v=1.0.0"')<home.indexOf('src="/app.js"'));
  for(const name of ['menu','search','refresh','plus','log-out']){
    assert.ok(WHOSE_ICON_PATHS[name], 'missing icon '+name);
    assert.match(home,new RegExp('data-ws-icon="'+name+'"'));
    assert.ok(whoseIconMarkup(name).startsWith('<svg'));
  }
  assert.equal(whoseIconMarkup('nothing<script>alert(1)</script>'),'');
  assert.ok(Object.isFrozen(WHOSE_ICON_PATHS));
  assert.match(components,/\.ws-inline-icon\{/);
  assert.doesNotMatch(read('ui-icons.js'),/https?:\/\/|@import|fetch\(/i);
});
