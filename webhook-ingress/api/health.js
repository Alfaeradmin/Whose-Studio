'use strict';
// Minimal readiness endpoint; never returns secret values or fingerprints.
const {validateConfig}=require('./webhook');
module.exports=async function health(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).end();
 if(!validateConfig())return res.status(503).end();
 return res.status(204).end();
};
