// Single read-only parameter contract for KiotViet Retail overview.
// Branch parameters intentionally match the already-verified admin branch reader.
// Ordersuppliers uses the minimal documented list request: no speculative query keys.
function overviewReadParams(resource) {
  if (resource === 'branches') return { pageSize: 100, currentItem: 0 };
  if (resource === 'ordersuppliers') return {};
  return null;
}
module.exports = { overviewReadParams };
