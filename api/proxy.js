export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' });
  }

  try {
    const decodedUrl = decodeURIComponent(url);
    
    const response = await fetch(decodedUrl, {
      headers: {
        'Referer': 'https://gooz.aapmains.net/',
        'Origin': 'https://gooz.aapmains.net/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch' });
    }

    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    const data = await response.arrayBuffer();
    res.status(200).send(Buffer.from(data));
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
