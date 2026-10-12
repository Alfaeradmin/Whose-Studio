const test=require('node:test');
const assert=require('node:assert/strict');
const {safeCredentialDiagnostics}=require('../lib/kiot-credential-diagnostics');
const handler=require('../api/kiot-credential-check');

function response() {
  return {
    statusCode:null,headers:{},payload:null,
    setHeader(k,v){this.headers[k]=v;return this;},
    status(v){this.statusCode=v;return this;},
    json(v){this.payload=v;return this;}
  };
}
test('key fingerprint inspection exposes only flags, never credentials or private hash',()=>{
  const id='f68576d5-f91f-4e25-8136-7fe367451fff';
  const secret='not-a-real-secret';
  const result=safeCredentialDiagnostics({
    KIOTVIET_CLIENT_ID:id,
    KIOTVIET_CLIENT_SECRET:secret,
    KIOTVIET_RETAILER:'test-retailer'
  });
  assert.equal(result.clientId.matchesLatestSuppliedExactly,false);
  assert.equal(result.clientId.guidFormat,true);
  assert.equal(result.clientSecret.present,true);
  assert.equal(result.retailerConfigured,true);
  assert.equal(result.tokenNotTested,true);
  const json=JSON.stringify(result);
  assert.ok(!json.includes(id));
  assert.ok(!json.includes(secret));
  assert.ok(!json.includes('cdc4e79d224f1731'));
});
test('detects common copy errors while keeping secret opaque',()=>{
 const r=safeCredentialDiagnostics({
   KIOTVIET_CLIENT_ID:' "f68576d5-f91f-4e25-8136-7fe367451fff" ',
   KIOTVIET_CLIENT_SECRET:' "fake-value"\n',
   KIOTVIET_RETAILER:'shop'
 });
 assert.equal(r.clientId.extraOuterWhitespace,true);
 assert.equal(r.clientId.guidFormat,false);
 assert.equal(r.clientSecret.extraOuterWhitespace,true);
 assert.equal(r.clientSecret.hasLineBreak,true);
 assert.equal(JSON.stringify(r).includes('fake-value'),false);
 const q=safeCredentialDiagnostics({
   KIOTVIET_CLIENT_ID:"'f68576d5-f91f-4e25-8136-7fe367451fff'",
   KIOTVIET_CLIENT_SECRET:'"fake-value"'
 });
 assert.equal(q.clientId.wrappedInQuotes,true);
 assert.equal(q.clientSecret.wrappedInQuotes,true);
});
test('unauthenticated callers cannot obtain credential fingerprint comparison',async()=>{
 const res=response();
 await handler({method:'GET',headers:{}},res);
 assert.equal(res.statusCode,401);
 assert.ok(!JSON.stringify(res.payload).includes('clientId'));
});
test('only GET is allowed; no mutations',async()=>{
 const res=response();
 await handler({method:'POST',headers:{}},res);
 assert.equal(res.statusCode,405);
 assert.equal(res.headers['Cache-Control'],'no-store, max-age=0');
});

test('comparison explicitly points to the latest rotated KiotViet Client ID',()=>{
  const result=safeCredentialDiagnostics({
    KIOTVIET_CLIENT_ID:'00000000-0000-4000-8000-000000000000',
    KIOTVIET_CLIENT_SECRET:'dummy',
    KIOTVIET_RETAILER:'dummy'
  });
  assert.equal(result.reference,'latest-rotated-client-id-2026-10-12');
  assert.equal(result.clientId.matchesLatestSuppliedExactly,false);
  assert.equal(result.clientId.matchesLatestSuppliedAfterTrim,false);
  const json=JSON.stringify(result);
  assert.ok(!json.includes('cdc4e79d224f1731'));
});
