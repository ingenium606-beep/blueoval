import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // GET — fetch all products for a category
  if (req.method === 'GET') {
    const { category } = req.query;
    try {
      if (category) {
        const order = await kv.get(`order:${category}`) || [];
        const products = [];
        for (const id of order) {
          const p = await kv.get(`product:${id}`);
          if (p) products.push(p);
        }
        res.status(200).json({ products, success: true });
      } else {
        // Get all categories
        const [fashion, sneakers, digital] = await Promise.all([
          kv.get('order:fashion') || [],
          kv.get('order:sneakers') || [],
          kv.get('order:digital') || []
        ]);
        res.status(200).json({ fashion, sneakers, digital, success: true });
      }
    } catch(e) {
      res.status(200).json({ products: [], success: false, error: e.message });
    }
    return;
  }

  // POST — save a new product
  if (req.method === 'POST') {
    const { action } = req.query;

    if (action === 'reorder') {
      const { category, order } = req.body;
      await kv.set(`order:${category}`, order);
      res.status(200).json({ success: true });
      return;
    }

    const product = req.body;
    product.id = `${product.category}_${Date.now()}`;
    product.createdAt = Date.now();

    try {
      await kv.set(`product:${product.id}`, product);
      const order = await kv.get(`order:${product.category}`) || [];
      await kv.set(`order:${product.category}`, [product.id, ...order]);
      res.status(200).json({ success: true, id: product.id });
    } catch(e) {
      res.status(200).json({ success: false, error: e.message });
    }
    return;
  }

  // DELETE — remove a product
  if (req.method === 'DELETE') {
    const { id, category } = req.query;
    try {
      await kv.del(`product:${id}`);
      const order = await kv.get(`order:${category}`) || [];
      await kv.set(`order:${category}`, order.filter(i => i !== id));
      res.status(200).json({ success: true });
    } catch(e) {
      res.status(200).json({ success: false, error: e.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
