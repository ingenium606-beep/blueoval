export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { url } = req.query;
  if (!url) { res.status(400).json({ error: 'No URL provided' }); return; }

  try {
    const response = await fetch(decodeURIComponent(url), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Referer': 'https://www.google.com/'
      },
      redirect: 'follow'
    });

    const html = await response.text();

    const getMeta = (name) => {
      const patterns = [
        new RegExp(`<meta[^>]*property=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${name}["']`, 'i'),
        new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${name}["']`, 'i'),
      ];
      for (const p of patterns) {
        const m = html.match(p);
        if (m?.[1]) return m[1].trim();
      }
      return '';
    };

    const getJsonLd = () => {
      try {
        const match = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
        if (match) {
          const data = JSON.parse(match[1]);
          const product = Array.isArray(data) ? data.find(d => d['@type'] === 'Product') : data['@type'] === 'Product' ? data : null;
          if (product) return product;
        }
      } catch(e) {}
      return null;
    };

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const rawTitle = titleMatch?.[1]?.trim() || '';
    const jsonLd = getJsonLd();

    const title = getMeta('og:title') || getMeta('twitter:title') || jsonLd?.name || rawTitle;
    const image = getMeta('og:image') || getMeta('twitter:image') || jsonLd?.image?.url || jsonLd?.image || '';
    const brand = getMeta('og:site_name') || jsonLd?.brand?.name || jsonLd?.brand || '';
    let price = getMeta('product:price:amount') || jsonLd?.offers?.price || jsonLd?.offers?.[0]?.price || '';
    let currency = getMeta('product:price:currency') || jsonLd?.offers?.priceCurrency || jsonLd?.offers?.[0]?.priceCurrency || 'USD';

    if (!price) {
      const pricePatterns = [
        /itemprop=["']price["'][^>]*content=["']([0-9.,]+)["']/i,
        /"price"\s*:\s*"?([0-9.,]+)"?/i,
      ];
      for (const p of pricePatterns) {
        const m = html.match(p);
        if (m?.[1]) { price = m[1].replace(',', ''); break; }
      }
    }

    res.status(200).json({
      title: title.substring(0, 120),
      image,
      brand: brand.substring(0, 60),
      price: price ? parseFloat(price).toFixed(2) : '',
      currency: currency || 'USD',
      success: true
    });

  } catch(e) {
    res.status(200).json({ error: e.message, success: false });
  }
}
