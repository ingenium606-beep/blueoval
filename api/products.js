const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO;
const FILE_PATH = 'products.json';
const BRANCH = 'main';

function githubRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'blueoval-app',
        'Content-Type': 'application/json'
      }
    };
    if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({}); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function getFile() {
  const data = await githubRequest('GET', `/repos/${REPO}/contents/${FILE_PATH}`);
  if (!data.content) return { content: { fashion: [], sneakers: [], digital: [] }, sha: null };
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
  await githubRequest('PUT', `/repos/${REPO}/contents/${FILE_PATH}`, body);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    if (req.method === 'GET') {
      const { category } = req.query;
      const { content } = await getFile();
      res.status(200).json({ products: category ? (content[category] || []) : content, success: true });
      return;
    }

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
        if (content[category]) content[category] = content[category].filter(p => p.id !== id);
        await saveFile(content, sha);
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
          await saveFile(content, sha);
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
          await saveFile(content, sha);
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
      await saveFile(content, sha);
      res.status(200).json({ success: true, id: product.id });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
