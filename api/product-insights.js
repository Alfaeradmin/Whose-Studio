const {validateStaffBearer}=require('../lib/whose-auth');
const {accessToken,isUuid}=require('../lib/whose-backend');
const {safeRead}=require('../lib/kiotviet');
const numeric=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 const staff=await validateStaffBearer(accessToken(req));
 if(!staff.ok)return res.status(staff.status).json({error:'Whose staff login required'});
 const id=Number(req.query?.productId),branchId=String(req.query?.branchId||'');
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Invalid product ID'});
 if(!isUuid(branchId))return res.status(400).json({error:'Kho thao tác không hợp lệ'});
 const branch=(staff.branches||[]).find(b=>b.id===branchId&&b.is_active===true);
 const permitted=staff.is_global_admin===true||(staff.memberships||[]).some(m=>m.branch_id===branchId);
 if(!branch||!permitted)return res.status(403).json({error:'Bạn không có quyền truy cập kho này'});
 const kiotId=numeric(branch.kiot_branch_id);
 if(!Number.isSafeInteger(kiotId)||kiotId<1)return res.status(503).json({error:'Kho chưa liên kết với chi nhánh KiotViet'});
 const result=await safeRead('products',{id,includeInventory:true,pageSize:100,currentItem:0});
 if(!result.ok)return res.status(502).json({error:'KiotViet inventory source unavailable'});
 const items=Array.isArray(result.data?.data)?result.data.data:Array.isArray(result.data)?result.data:[];
 const match=items.find(p=>Number(p.id)===id);
 if(!match)return res.status(200).json({source:'KiotViet products.includeInventory',found:false,inventory:[],complete:false,activeBranch:{id:branch.id,name:branch.name}});
 const records=Array.isArray(match.inventories)?match.inventories:[];
 const scoped=records.filter(r=>Number(r.branchId)===kiotId);
 return res.status(200).json({
  source:'KiotViet products.includeInventory',found:true,complete:true,retrievedAt:new Date().toISOString(),
  activeBranch:{id:branch.id,name:branch.name,kiotBranchId:kiotId},
  inventory:scoped.map(r=>({branchId:kiotId,branchName:branch.name,onHand:numeric(r.onHand),reserved:numeric(r.reserved)})),
  locationSupported:false,ledgerSupported:false,salesSupported:false
 });
};