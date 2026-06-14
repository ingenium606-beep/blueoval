async function getFile(token, repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/products.json`, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'blueoval-app'
    }
  });
  if (res.status === 404) return { content: { fashion: [], sneakers: [], digital: [] }, sha: null };
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
  return { content, sha: data.sha };
}

async function saveFile(token, repo, content, sha) {
  const body = {
    message: 'Update products',
    content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
    branch: 'main'
  };
  if (sha) body.sha = sha;
  await fetch(`https://api.github.com/repos/${repo}/contents/products.json`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'blueoval-app'
    },
    body: JSON.stringify(body)
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;

  try {
    if (req.method === 'GET') {
      const { category } = req.query;
      const { content } = await getFile(token, repo);
      res.status(200).json({ products: category ? (content[category] || []) : content, success: true });
      return;
    }

    if (req.method === 'POST') {
      const { action } = req.query;
      const { content, sha } = await getFile(token, repo);

      if (action === 'reorder') {
        const { category, order } = req.body;
        const current = content[category] || [];
        content[category] = order.map(id => current.find(p => p.id === id)).filter(Boolean);
        await saveFile(token, repo, content, sha);
        res.status(200).json({ success: true });
        return;
      }

      if (action === 'delete') {
        const { id, category } = req.body;
        if (content[category]) content[category] = content[category].filter(p => p.id !== id);
        await saveFile(token, repo, content, sha);
        res.status(200).json({ success: true });
        return;
      }

      if (action === 'move') {
        const { id, fromCategory, toCategory } = req.body;
        const product = (content[fromCategory] || []).find(p => p.id === id);
        if (product) {
          content[fromCategory] = content[fromCategory].filter(p => p.id !== id);
          product.category = toCategory;
          if (!content[toCategory]) content[toCategory] = [];
          content[toCategory].unshift(product);
          await saveFile(token, repo, content, sha);
          res.status(200).json({ success: true });
        } else {
          res.status(200).json({ success: false, error: 'Product not found' });
        }
        return;
      }

      if (action === 'update') {
        const { id, category, fields } = req.body;
        const idx = (content[category] || []).findIndex(p => p.id === id);
        if (idx !== -1) {
          content[category][idx] = { ...content[category][idx], ...fields };
          await saveFile(token, repo, content, sha);
          res.status(200).json({ success: true });
        } else {
          res.status(200).json({ success: false, error: 'Product not found' });
        }
        return;
      }

      // Add new product
      const product = req.body;
      product.id = `${product.category}_${Date.now()}`;
      product.createdAt = Date.now();
      if (!content[product.category]) content[product.category] = [];
      content[product.category].unshift(product);
      await saveFile(token, repo, content, sha);
      res.status(200).json({ success: true, id: product.id });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
