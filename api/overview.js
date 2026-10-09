const { safeRead } = require('../lib/kiotviet');

function listPayload(result) {
  if (!result?.ok) return null;
  const data = result.data;
  if (Array.isArray(data)) return { total: data.length, rows: data };
  if (data && Array.isArray(data.data)) return { total: Number(data.total ?? data.data.length), rows: data.data };
  return { total: null, rows: data };
}

function summarizeInventory(onHands, products) {
  const rows = onHands?.rows || products?.rows || [];
  let inventoryRows = 0;
  let negative = 0;
  let zero = 0;
  let positive = 0;
  let reserved = 0;
  const byBranch = new Map();

  for (const product of rows) {
    const inventories = Array.isArray(product.inventories) ? product.inventories : [];
    for (const inv of inventories) {
      inventoryRows += 1;
      const onHand = Number(inv.onHand ?? inv.onhand ?? 0);
      const reservedQty = Number(inv.reserved ?? 0);
      reserved += reservedQty;
      if (onHand < 0) negative += 1;
      else if (onHand === 0) zero += 1;
      else positive += 1;

      const key = String(inv.branchId ?? inv.branchName ?? 'unknown');
      const prev = byBranch.get(key) || {
        branchId: inv.branchId ?? null,
        branchName: inv.branchName ?? null,
        skuRows: 0,
        onHand: 0,
        reserved: 0
      };
      prev.skuRows += 1;
      prev.onHand += onHand;
      prev.reserved += reservedQty;
      byBranch.set(key, prev);
    }
  }

  return {
    source: onHands?.rows?.length ? 'productOnHands' : 'products.includeInventory',
    inventoryRows,
    negative,
    zero,
    positive,
    reserved,
    byBranch: [...byBranch.values()]
  };
}

function sample(list, n = 8) {
  return (list?.rows || []).slice(0, n).map((row) => ({
    id: row.id ?? null,
    code: row.code ?? null,
    name: row.name ?? row.branchName ?? row.customerName ?? row.supplierName ?? null,
    branchId: row.branchId ?? row.fromBranchId ?? null,
    branchName: row.branchName ?? null,
    fromBranchId: row.fromBranchId ?? null,
    toBranchId: row.toBranchId ?? null,
    status: row.statusValue ?? row.status ?? null,
    purchaseDate:
      row.purchaseDate ??
      row.orderDate ??
      row.returnDate ??
      row.transferDate ??
      row.createdDate ??
      null,
    total: row.total ?? row.totalAmt ?? row.returnTotal ?? null
  }));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Read-only: GET only' });

  const recentParams = { pageSize: 100, currentItem: 0, orderDirection: 'Desc' };
  const [
    branchesR,
    settingsR,
    productsR,
    onHandsR,
    ordersR,
    invoicesR,
    purchaseR,
    supplierOrdersR,
    transfersR,
    returnsR
  ] = await Promise.all([
    safeRead('branches', { pageSize: 100, currentItem: 0, orderBy: 'name', orderDirection: 'Asc' }),
    safeRead('settings', {}),
    safeRead('products', { pageSize: 100, currentItem: 0, includeInventory: true, orderDirection: 'Desc' }),
    safeRead('productOnHands', { pageSize: 100, currentItem: 0, orderBy: 'Code', orderDirection: 'Asc' }),
    safeRead('orders', recentParams),
    safeRead('invoices', recentParams),
    safeRead('purchaseorders', recentParams),
    safeRead('ordersuppliers', { pageSize: 100, currentItem: 0 }),
    safeRead('transfers', { pageSize: 100, currentItem: 0 }),
    safeRead('returns', { ...recentParams, includePayment: true })
  ]);

  const branches = listPayload(branchesR);
  const products = listPayload(productsR);
  const onHands = listPayload(onHandsR);
  const orders = listPayload(ordersR);
  const invoices = listPayload(invoicesR);
  const purchases = listPayload(purchaseR);
  const supplierOrders = listPayload(supplierOrdersR);
  const transfers = listPayload(transfersR);
  const returns = listPayload(returnsR);

  res.status(200).json({
    app: 'Whose Studio',
    mode: 'KIOTVIET_READ_ONLY',
    retailer: process.env.KIOTVIET_RETAILER || null,
    generatedAt: new Date().toISOString(),
    connectivity: {
      branches: { ok: branchesR.ok, ms: branchesR.ms, error: branchesR.error || null },
      settings: { ok: settingsR.ok, ms: settingsR.ms, error: settingsR.error || null },
      products: { ok: productsR.ok, ms: productsR.ms, error: productsR.error || null },
      productOnHands: { ok: onHandsR.ok, ms: onHandsR.ms, error: onHandsR.error || null },
      orders: { ok: ordersR.ok, ms: ordersR.ms, error: ordersR.error || null },
      invoices: { ok: invoicesR.ok, ms: invoicesR.ms, error: invoicesR.error || null },
      purchaseorders: { ok: purchaseR.ok, ms: purchaseR.ms, error: purchaseR.error || null },
      ordersuppliers: { ok: supplierOrdersR.ok, ms: supplierOrdersR.ms, error: supplierOrdersR.error || null },
      transfers: { ok: transfersR.ok, ms: transfersR.ms, error: transfersR.error || null },
      returns: { ok: returnsR.ok, ms: returnsR.ms, error: returnsR.error || null }
    },
    totals: {
      branches: branches?.total ?? null,
      products: products?.total ?? null,
      productOnHands: onHands?.total ?? null,
      orders: orders?.total ?? null,
      invoices: invoices?.total ?? null,
      purchaseorders: purchases?.total ?? null,
      ordersuppliers: supplierOrders?.total ?? null,
      transfers: transfers?.total ?? null,
      returns: returns?.total ?? null
    },
    inventory: summarizeInventory(onHands, products),
    branches: branches?.rows || [],
    settings: settingsR.ok ? settingsR.data : null,
    samples: {
      products: sample(products),
      productOnHands: sample(onHands),
      orders: sample(orders),
      invoices: sample(invoices),
      purchaseorders: sample(purchases),
      ordersuppliers: sample(supplierOrders),
      transfers: sample(transfers),
      returns: sample(returns)
    }
  });
};
