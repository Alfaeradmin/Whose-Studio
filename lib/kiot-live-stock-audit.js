'use strict';
// Read-only, PII-free reconciliation of a live KiotViet product and stored Whose snapshots.
// Never infer a stock transaction, create an adjustment, or coerce missing quantities to zero.
const ID=/^[1-9][0-9]{0,14}$/;
function quantity(value) {
  if (value === null || value === undefined || value === '') return null;
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      !/^-?[0-9]{1,10}(?:\.[0-9]{1,4})?$/.test(String(value)))
    throw Error('INVALID_STOCK_QUANTITY');
  const n=Number(value);
  if (!Number.isFinite(n)) throw Error('INVALID_STOCK_QUANTITY');
  return n;
}
function inspect(product, expectedSku, snapshots=[], branches=[]) {
  if (!product || typeof product !== 'object' || Array.isArray(product) ||
      typeof product.code !== 'string' || product.code.toUpperCase() !== expectedSku.toUpperCase() ||
      !ID.test(String(product.id ?? ''))) throw Error('PRODUCT_IDENTITY_MISMATCH');
  if (!Array.isArray(product.inventories) || product.inventories.length > 1000)
    throw Error('PROVIDER_INVENTORY_UNAVAILABLE');
  const branchByKiot=new Map(), branchByUuid=new Map();
  for (const branch of branches) {
    if (branch && ID.test(String(branch.kiot_branch_id ?? '')) &&
        typeof branch.id === 'string') {
      branchByKiot.set(String(branch.kiot_branch_id),branch);
      branchByUuid.set(branch.id,branch);
    }
  }
  const snapshotByBranch=new Map();
  for (const snapshot of snapshots) {
    const branch=branchByUuid.get(snapshot?.branch_id);
    if (branch) snapshotByBranch.set(String(branch.kiot_branch_id),snapshot);
  }
  const seen=new Set(), rows=[];
  for (const inv of product.inventories) {
    const id=String(inv?.branchId ?? '');
    if (!ID.test(id) || seen.has(id)) throw Error('INVALID_PROVIDER_BRANCH');
    seen.add(id);
    const onHand=quantity(inv.onHand ?? inv.onhand);
    if (onHand === null) throw Error('PROVIDER_ON_HAND_MISSING');
    const reserved=quantity(inv.reserved);
    const stored=snapshotByBranch.get(id);
    const storedOnHand=stored ? quantity(stored.on_hand) : null;
    const storedReserved=stored ? quantity(stored.reserved) : null;
    const name=branchByKiot.get(id)?.name ||
      (typeof inv.branchName === 'string' ? inv.branchName.slice(0,120) : '') ||
      'Chi nhánh KiotViet '+id;
    rows.push({branchId:id,branchName:name,liveOnHand:onHand,liveReserved:reserved,
      liveAvailable:reserved===null?null:onHand-reserved,
      snapshotOnHand:storedOnHand,snapshotReserved:storedReserved,
      snapshotAt:stored?.synced_at||null,
      deltaFromSnapshot:storedOnHand===null?null:onHand-storedOnHand});
  }
  const unmatchedSnapshots=[];
  for (const [id,stored] of snapshotByBranch) {
    if (!seen.has(id)) unmatchedSnapshots.push({
      branchId:id,branchName:branchByKiot.get(id)?.name||id,
      snapshotOnHand:quantity(stored.on_hand),snapshotAt:stored.synced_at||null
    });
  }
  const providerSum=rows.reduce((n,x)=>n+x.liveOnHand,0);
  const totalField=product.onHand != null?'onHand':product.totalOnHand != null?'totalOnHand':null;
  const reportedTotal=totalField ? quantity(product[totalField]) : null;
  return {
    product:{id:String(product.id),sku:product.code,name:String(product.fullName||product.name||'').slice(0,250)},
    rows,providerSum,providerBranchCount:rows.length,
    providerReportedTotal:reportedTotal,providerTotalField:totalField,
    providerTotalGap:reportedTotal===null?null:reportedTotal-providerSum,
    unmatchedSnapshots,comparison:'live_provider_vs_last_stored_snapshot',
    attribution:'not_determined_from_stock_balances'
  };
}
module.exports={quantity,inspect};
