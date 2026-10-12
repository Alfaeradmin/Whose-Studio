const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { overviewReadParams } = require('../lib/kiot-overview-requests');
const { readAllBranches } = require('../lib/kiot-branches');
const overviewCode = fs.readFileSync(path.join(__dirname, '../api/overview.js'), 'utf8');

test('overview uses the proven full branch reader query without sorting', async () => {
 const requested = overviewReadParams('branches');
 assert.deepEqual(requested, { pageSize:100, currentItem:0 });
 assert.ok(!Object.hasOwn(requested, 'orderBy'));
 assert.ok(!Object.hasOwn(requested, 'orderDirection'));
 let readParams;
 const result = await readAllBranches(async (resource, params) => {
   assert.equal(resource, 'branches');
   readParams = params;
   return {ok:true,data:{total:1,data:[{id:1263919,branchName:'WHOSE STUDIO LVS'}]}};
 });
 assert.deepEqual(requested,readParams);
 assert.equal(result.total,1);
 assert.match(overviewCode, /safeRead\('branches', overviewReadParams\('branches'\)\)/);
});
test('ordersuppliers does not add speculative query parameters on GET', () => {
 assert.deepEqual(overviewReadParams('ordersuppliers'), {});
 assert.match(overviewCode, /safeRead\('ordersuppliers', overviewReadParams\('ordersuppliers'\)\)/);
 assert.ok(!overviewCode.includes("safeRead('ordersuppliers', { pageSize:"));
 assert.ok(!overviewCode.includes("safeRead('branches', { pageSize:"));
});
test('no new external calls, writes or unapproved resources',()=>{
 const helper=fs.readFileSync(path.join(__dirname,'../lib/kiot-overview-requests.js'),'utf8');
 assert.doesNotMatch(helper,/\bfetch\s*\(|\bPOST\b|\bPUT\b|\bDELETE\b|require\(/);
 assert.equal(overviewReadParams('products'),null);
 assert.match(overviewCode,/const \{ overviewConnectionStatus \}/);
 assert.match(overviewCode,/connectionStatus,/);
});
