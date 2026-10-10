// Admin-only read/snapshot of ACTUAL KiotViet branch directory.
// GET previews all KiotViet branches; POST fetches them afresh server-side and
// records only provenance-confirmed source data in dedicated Whose Supabase.
// No operational warehouse kind inference, stock mutation or KiotViet writes.
const { accessToken, rest } = require('../lib/whose-backend');
const { validateStaffBearer, verifyOrigin } = require('../lib/whose-auth');
const { safeRead } = require('../lib/kiotviet');
const { readAllBranches } = require('../lib/kiot-branches');
const {safeDetails}=require('../lib/kiot-branch-diagnostics');

module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method!=='GET'&&req.method!=='POST'){
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({error:'Unsupported method'});
  }
  if(req.method==='POST'&&!verifyOrigin(req)) return res.status(403).json({error:'Invalid origin'});
  const staff=await validateStaffBearer(accessToken(req));
  if(!staff.ok) return res.status(staff.status).json({error:'Whose staff login required'});
  if(staff.is_global_admin!==true) return res.status(403).json({error:'Whose Global Admin required'});
  if(req.method==='POST'&&Number(req.headers?.['content-length']||0)>256)
    return res.status(413).json({error:'Request payload too large'});
  const start=Date.now();
  let directory;
  try {
    directory=await readAllBranches(safeRead);
  }catch(err) {
    const details=safeDetails(err);
    console.warn('[Whose/Kiot/branches]',details.code,'page',details.page);
    return res.status(502).json({...details,notImported:true});
  }
  const {branches,total,pages}=directory;
  if(req.method==='GET'){
    return res.status(200).json({source:'KiotViet',mode:'read-only',total,pages,branches,ms:Date.now()-start});
  }
  if(branches.length===0) return res.status(409).json({error:'KiotViet returned zero branches; import skipped'});
  // NEVER trust client-supplied branch data. POST fetches branches from Kiot.
  const result=await rest('rpc/whose_import_kiot_branches',{
    method:'POST',bearer:accessToken(req),body:{p_rows:branches}
  });
  if(!result.ok || result.data!==branches.length){
    return res.status(502).json({error:'Could not commit verified KiotViet branches to Whose. No claim of sync success.'});
  }
  return res.status(200).json({
    source:'KiotViet',mode:'read-only',
    imported:result.data,total,pages,
    pendingClassification:true,
    syncedAt:new Date().toISOString(),ms:Date.now()-start
  });
};
