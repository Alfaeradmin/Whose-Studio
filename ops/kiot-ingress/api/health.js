'use strict';
module.exports=(req,res)=>{res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'GET_ONLY'});return res.status(200).json({service:'Whose Kiot event ingress',enabled:Boolean(process.env.KIOTVIET_WEBHOOK_SECRET_BASE64&&process.env.WHOSE_CONNECTOR_SERVICE_ROLE_KEY),kiotWrites:false});};
