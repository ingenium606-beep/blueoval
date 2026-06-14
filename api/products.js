const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO;
const FILE_PATH = 'products.json';
const BRANCH = 'main';

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getFile() {
  const res = await httpsRequest({
    hostname: 'api.github.com',
    path: `/repos/${REPO}/contents/${FILE_PATH}`,
    method: 'GET',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'blueoval-app'
    }
  });
  if (res.status === 404) return { content: { fashion: [], sneakers: [], digital: [] }, sha: null };
  const content = JSON.parse(Buffer.from(res.body.content, 'base64').toString('utf8'));
  return { content, sha: res.body.sha };
}

async function saveFile(content, sha) {
  const bodyObj = {
    message: 'Update products',
    content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
    branch: BRANCH
  };
  if (sha) bodyObj.sha = sha;
  const bodyStr = JSON.stringify(bodyObj);
  await httpsRequest({
    hostname: 'api.github.com',
    path: `/repos/${REPO}/contents/${FILE_PATH}`,
    method: 'PUT',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
      'User-Agent': 'blueoval-app'
    }
  }, bodyStr);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
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
