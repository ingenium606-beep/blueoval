const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO; // e.g. "ingenium606-beep/blueoval"
const FILE_PATH = 'products.json';
const BRANCH = 'main';

async function getFile() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  if (res.status === 404) return { content: { fashion: [], sneakers: [], digital: [] }, sha: null };
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
  return { content, sha: data.sha };
}

async function saveFile(content, sha) {
  const body = {
    message: 'Update products',
    content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
    branch: BRANCH
  };
  if (sha) body.sha = sha;
  await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    // GET — fetch products for a category
    if (req.method === 'GET') {
      const { category } = req.query;
      const { content } = await getFile();
      if (category) {
        res.status(200).json({ products: content[category] || [], success: true });
      } else {
        res.status(200).json({ ...content, success: true });
      }
      return;
    }

    // POST — add product, reorder, or delete
    if (req.method === 'POST') {
      const { action } = req.query;
      const { content, sha } = await getFile();

      if (action === 'reorder') {
        const { category, order } = req.body;
        const current = content[category] || [];
        content[category] = order.map(id => current.find(p => p.id === id)).filter(Boolean);
        await saveFile(content, sha);
        res.status(200).json({ success: true });
        return;
      }

      if (action === 'delete') {
        const { id, category } = req.body;
        if (content[category]) {
          content[category] = content[category].filter(p => p.id !== id);
        }
        await saveFile(content, sha);
        res.status(200).json({ success: true });
        return;
      }

      // Add new product
      const product = req.body;
      product.id = `${product.category}_${Date.now()}`;
      product.createdAt = Date.now();
      if (!content[product.category]) content[product.category] = [];
      content[product.category].unshift(product);
      await saveFile(content, sha);
      res.status(200).json({ success: true, id: product.id });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
