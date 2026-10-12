'use strict';
const {accessToken,rest}=require('../lib/whose-backend');
const {validateStaffBearer}=require('../lib/whose-auth');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET_ONLY'});
 const bearer=accessToken(req),staff=await validateStaffBearer(bearer);
 if(!staff.ok)return res.status(staff.status).json({error:'LOGIN_REQUIRED'});
 if(staff.is_global_admin!==true)return res.status(403).json({error:'ADMIN_REQUIRED'});
 const result=await rest('rpc/whose_connector_health',{method:'POST',bearer,body:{}});
 if(!result.ok)return res.status(503).json({error:'CONNECTOR_HEALTH_UNAVAILABLE'});
 return res.status(200).json({mode:'read_only',outboundEnabled:false,...result.data});
};
