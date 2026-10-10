// Verified KiotViet RETAIL branches reader; this never writes to KiotViet.
// Official response uses branchName/branchCode (not simply name/code).
const PAGE_SIZE=100, MAX_BRANCHES=1000, MAX_PAGES=10;
function normalizeBranch(b) {
  if (!b || typeof b!=='object' || Array.isArray(b)) throw new Error('Invalid KiotViet branch object');
  const id=Number(b.id);
  const name=String(b.branchName ?? b.name ?? '').trim();
  if (!Number.isSafeInteger(id) || id<=0 || name.length<1 || name.length>250)
    throw new Error('KiotViet branch has invalid identity');
  const code=b.branchCode ?? b.code ?? null;
  const address=b.address ?? null;
  if (code!=null && (typeof code!=='string' || code.length>100)) throw new Error('Invalid branch code');
  if (address!=null && (typeof address!=='string' || address.length>1000)) throw new Error('Invalid branch address');
  const isActive=typeof b.isActive==='boolean' ? b.isActive : null;
  return {id,name,code:code?.trim()||null,address:address?.trim()||null,isActive};
}
async function readAllBranches(read) {
  const all=[],seen=new Set();
  let total=null,pages=0;
  for(let page=0;page<MAX_PAGES;page++){
    const response=await read('branches',{
      pageSize:PAGE_SIZE,currentItem:page*PAGE_SIZE,orderBy:'name',orderDirection:'Asc'
    });
    if(!response?.ok) throw new Error('KiotViet branch endpoint is unavailable');
    const data=response.data;
    if (!data || !Array.isArray(data.data)) throw new Error('Unexpected KiotViet branch response');
    if (data.total!==undefined && data.total!==null){
      const n=Number(data.total);
      if(!Number.isSafeInteger(n)||n<0||n>MAX_BRANCHES) throw new Error('KiotViet branch count exceeds safe limit');
      if(total!==null&&total!==n) throw new Error('KiotViet branch list changed during pagination');
      total=n;
    }
    pages++;
    for (const branch of data.data){
      const normalized=normalizeBranch(branch);
      if(seen.has(normalized.id)) throw new Error('Duplicate KiotViet branch across pages');
      seen.add(normalized.id);all.push(normalized);
    }
    if(all.length>MAX_BRANCHES) throw new Error('KiotViet branches exceeded safe limit');
    if(total!==null){
      if(all.length>total) throw new Error('KiotViet branch count mismatch');
      if(all.length===total) return {branches:all,total,pages};
      if(data.data.length!==PAGE_SIZE) throw new Error('KiotViet returned an incomplete page');
    }else if(data.data.length<PAGE_SIZE){
      return {branches:all,total:all.length,pages};
    }
    if(data.data.length===0) throw new Error('KiotViet returned empty page before completion');
  }
  throw new Error('KiotViet branch pagination exceeded safe page limit');
}
module.exports={normalizeBranch,readAllBranches,PAGE_SIZE,MAX_BRANCHES};
