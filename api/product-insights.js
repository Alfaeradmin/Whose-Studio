const {validateStaffBearer}=require('../lib/whose-auth');
const {accessToken}=require('../lib/whose-backend');
const {safeRead}=require('../lib/kiotviet');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 const staff=await validateStaffBearer(accessToken(req));
 if(!staff.ok)return res.status(staff.status).json({error:'Whose staff login required'});
 const id=Number(req.query?.productId);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Invalid product ID'});
 const result=await safeRead('products',{id,includeInventory:true,pageSize:100,currentItem:0});
 if(!result.ok)return res.status(502).json({error:'KiotViet inventory source unavailable'});
 const items=Array.isArray(result.data?.data)?result.data.data:Array.isArray(result.data)?result.data:[];
 const match=items.find(p=>Number(p.id)===id);
 if(!match)return res.status(200).json({source:'KiotViet products.includeInventory',found:false,inventory:[],complete:false,note:'Không xác minh được sản phẩm theo ID từ endpoint KiotViet.'});
 const records=Array.isArray(match.inventories)?match.inventories:[];
 return res.status(200).json({source:'KiotViet products.includeInventory',found:true,complete:true,retrievedAt:new Date().toISOString(),
 inventory:records.map(r=>({branchId:r.branchId??null,branchName:r.branchName??null,onHand:Number.isFinite(Number(r.onHand))?Number(r.onHand):null,reserved:Number.isFinite(Number(r.reserved))?Number(r.reserved):null})),
 locationSupported:false,ledgerSupported:false,salesSupported:false});
};