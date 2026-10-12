// Whose Studio KiotViet overview status. Pure, no IO and no credential access.
// A failed *resource* is not evidence that OAuth/API connectivity as a whole
// failed when another resource succeeded.
const AUTH_ERROR_RE = /^KiotViet token failed \(\d{3}\): (?:invalid_client|unauthorized_client|invalid_scope|invalid_grant|access_denied|unsupported_grant_type)$/;
const TOKEN_ERROR_RE = /^KiotViet token failed \(\d{3}\): [a-z_]+$/;

function overviewConnectionStatus(connectivity) {
  const entries = Object.entries(connectivity || {}).filter(([,v])=>v&&typeof v==='object');
  const succeeded = entries.filter(([,v])=>v.ok===true);
  const failed = entries.filter(([,v])=>v.ok!==true);
  let state;
  if (!entries.length) state='not_checked';
  else if (!failed.length) state='connected';
  else if (succeeded.length) state='partial';
  else if (failed.some(([,v])=>AUTH_ERROR_RE.test(v.error||''))) state='authentication_failed';
  else if (failed.some(([,v])=>TOKEN_ERROR_RE.test(v.error||''))) state='token_unavailable';
  else state='unavailable';
  return {
    state,
    // Successful GET proves token was accepted for at least one requested API.
    connected: succeeded.length > 0,
    branchesOk: connectivity?.branches?.ok === true,
    checked: entries.length,
    succeeded: succeeded.length,
    failed: failed.length,
    // Only resource names; no credentials, tokens, host or raw upstream body.
    failedResources: failed.map(([name])=>name)
  };
}
module.exports={overviewConnectionStatus};
