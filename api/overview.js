const { safeRead } = require('../lib/kiotviet');

function listPayload(result) {
  if (!result?.ok) return null;
  const data = result.data;
  if (Array.isArray(data)) return { total: data.length, rows: data };
  if (data && Array.isArray(data.data)) return { total: Number(data.total ?? data.data.length), rows: data.data };
  return { total: null, rows: data };
}

function summarizeInventory(products) {
  const rows = products?.rows || [];
  let inventoryRows = 0, negative = 0, zero = 0, positive = 0;
  const byBranch = new Map();

  for (const product of rows) {
    const inventories = Array.isArray(product.inventories) ? product.inventories : [];
    for (const inv of inventories) {
      inventoryRows++;
      const onHand = Number(inv.onHand ?? 0);
      if (onHand < 0) negative++;
      else if (onHand === 0) zero++;
      else positive++;
      const key = String(inv.branchId ?? inv.branchName ?? 'unknown');
      const prev = byBranch.get(key) || { branchId: inv.branchId ?? null, branchName: inv.branchName ?? null, skuRows: 0, onHand: 0 };
      prev.skuRows += 1;
      prev.onHand += onHand;
      byBranch.set(key, prev);
    }
  }
  return { inventoryRows, negative, zero, positive, byBranch: [...byBranch.values()] };
}

function sample(list, n = 8) {
  return (list?.rows || []).slice(0, n).map((row) => ({
    id: row.id ?? null,
    code: row.code ?? null,
    name: row.name ?? row.branchName ?? row.customerName ?? row.supplierName ?? null,
    branchId: row.branchId ?? null,
    branchName: row.branchName ?? null,
    status: row.status ?? row.statusValue ?? null,
    purchaseDate: row.purchaseDate ?? row.orderDate ?? row.createdDate ?? null,
    total: row.total ?? row.totalAmt ?? null
  }));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Read-only: GET only' });

  const recentParams = { pageSize: 100, currentItem: 0, orderDirection: 'Desc' };
  const [branchesR, settingsR, productsR, ordersR, invoicesR, purchaseR, supplierOrdersR] = await Promise.all([
    safeRead('branches', { pageSize: 100, currentItem: 0, orderBy: 'name', orderDirection: 'Asc' }),
    safeRead('settings', {}),
    safeRead('products', { pageSize: 100, currentItem: 0, includeInventory: true, orderDirection: 'Desc' }),
    safeRead('orders', recentParams),
    safeRead('invoices', recentParams),
    safeRead('purchaseorders', recentParams),
    safeRead('ordersuppliers', { pageSize: 100, currentItem: 0 })
  ]);

  const branches = listPayload(branchesR);
  const products = listPayload(productsR);
  const orders = listPayload(ordersR);
  const invoices = listPayload(invoicesR);
  const purchases = listPayload(purchaseR);
  const supplierOrders = listPayload(supplierOrdersR);

  res.status(200).json({
    app: 'Whose Studio',
    mode: 'KIOTVIET_READ_ONLY',
    retailer: process.env.KIOTVIET_RETAILER || null,
    generatedAt: new Date().toISOString(),
    connectivity: {
      branches: { ok: branchesR.ok, ms: branchesR.ms, error: branchesR.error || null },
      settings: { ok: settingsR.ok, ms: settingsR.ms, error: settingsR.error || null },
      products: { ok: productsR.ok, ms: productsR.ms, error: productsR.error || null },
      orders: { ok: ordersR.ok, ms: ordersR.ms, error: ordersR.error || null },
      invoices: { ok: invoicesR.ok, ms: invoicesR.ms, error: invoicesR.error || null },
      purchaseorders: { ok: purchaseR.ok, ms: purchaseR.ms, error: purchaseR.error || null },
      ordersuppliers: { ok: supplierOrdersR.ok, ms: supplierOrdersR.ms, error: supplierOrdersR.error || null }
    },
    totals: {
      branches: branches?.total ?? null,
      products: products?.total ?? null,
      orders: orders?.total ?? null,
      invoices: invoices?.total ?? null,
      purchaseorders: purchases?.total ?? null,
      ordersuppliers: supplierOrders?.total ?? null
    },
    inventory: summarizeInventory(products),
    branches: branches?.rows || [],
    settings: settingsR.ok ? settingsR.data : null,
    samples: {
      products: sample(products),
      orders: sample(orders),
      invoices: sample(invoices),
      purchaseorders: sample(purchases),
      ordersuppliers: sample(supplierOrders)
    }
  });
};
