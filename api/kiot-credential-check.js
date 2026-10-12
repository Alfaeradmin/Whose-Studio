// Whose-only admin diagnostics. Does not return credentials or hashes,
// does not contact KiotViet and does not mutate any environment or data.
const {accessToken}=require('../lib/whose-backend');
const {validateStaffBearer}=require('../lib/whose-auth');
const {safeCredentialDiagnostics}=require('../lib/kiot-credential-diagnostics');

module.exports=async function handler(req,res) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'GET only'});
  }
  const staff=await validateStaffBearer(accessToken(req));
  if(!staff.ok) return res.status(staff.status).json({error:'Whose staff login required'});
  if(staff.is_global_admin!==true)
    return res.status(403).json({error:'Whose Global Admin required'});
  return res.status(200).json(safeCredentialDiagnostics(process.env));
};
