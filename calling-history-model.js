'use strict';
// All recorded non-message events are kept in one operation log.
// Messages remain regular chat bubbles; no events are dropped or rewritten.
(function(root,factory){
 const model=factory();
 if(typeof module==='object'&&module.exports)module.exports=model;
 if(root)root.WhoseChatHistory=model;
})(typeof window!=='undefined'?window:null,function(){
 function partition(records){
  const actions=[],messages=[];
  for(const record of Array.isArray(records)?records:[]){
   if(record?.event_type==='note')messages.push(record);
   else actions.push(record);
  }
  return {actions,messages};
 }
 function latestAction(actions){
  return Array.isArray(actions)&&actions.length?actions[actions.length-1]:null;
 }
 return {partition,latestAction};
});
