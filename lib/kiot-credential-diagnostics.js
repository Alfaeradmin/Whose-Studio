// Whose Studio only: restricted, local comparison of KiotViet runtime settings.
// The latest owner-supplied Client ID is represented ONLY by its SHA-256
// fingerprint; never commit the identifier, Client Secret or environment values.
const {createHash, timingSafeEqual} = require('node:crypto');

// SHA-256 of the most recently rotated KiotViet Client ID (12 Oct 2026).
const OWNER_CLIENT_ID_SHA256 = 'cdc4e79d224f173121d7bbcee2fd367891168264488c98b0987601dc0eadda7c';
const CLIENT_ID_UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function sha256Matches(value) {
  const digest=createHash('sha256').update(value,'utf8').digest();
  const expected=Buffer.from(OWNER_CLIENT_ID_SHA256,'hex');
  return timingSafeEqual(digest,expected);
}
function nonEmpty(value) {
  return typeof value==='string' && value.length>0;
}
function surroundedByQuotes(value) {
  return value.length>1 && (
    (value[0]==='"'&&value.at(-1)==='"')||
    (value[0]==="'"&&value.at(-1)==="'")
  );
}
function configuredClient(value) {
  const present=nonEmpty(value);
  const trim=present?value.trim():'';
  return {
    present,
    matchesLatestSuppliedExactly:present&&sha256Matches(value),
    matchesLatestSuppliedAfterTrim:present&&sha256Matches(trim),
    guidFormat:present&&CLIENT_ID_UUID.test(value),
    extraOuterWhitespace:present&&value!==trim,
    wrappedInQuotes:present&&surroundedByQuotes(value),
    hasLineBreak:present&&/[\r\n]/.test(value)
  };
}
function configuredSecret(value) {
  const present=nonEmpty(value);
  return {
    present,
    extraOuterWhitespace:present&&value.trim()!==value,
    wrappedInQuotes:present&&surroundedByQuotes(value),
    hasLineBreak:present&&/[\r\n]/.test(value)
  };
}
function safeCredentialDiagnostics(environment) {
  return {
    reference:'latest-rotated-client-id-2026-10-12',
    clientId:configuredClient(environment.KIOTVIET_CLIENT_ID),
    clientSecret:configuredSecret(environment.KIOTVIET_CLIENT_SECRET),
    retailerConfigured:nonEmpty(environment.KIOTVIET_RETAILER),
    tokenNotTested:true
  };
}
module.exports={safeCredentialDiagnostics};
