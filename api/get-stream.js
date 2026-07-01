// api/get-stream.js
const https = require('https');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // URL objetivo (puedes pasarla como query param)
  const targetUrl = req.query.url || 'https://vidzenvivo.cc/canal.php?stream=dsports';
  
  try {
    // Proxy la petición
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://futbol-libres.su/'
      }
    });
    
    const html = await response.text();
    
    // Extraer la URL del m3u8 del HTML usando regex
    // Busca patrones como "var source = '...m3u8...'" o similar
    const m3u8Match = html.match(/(https:\/\/[^'"]+\.m3u8[^'"]*)/);
    
    if (m3u8Match) {
      res.status(200).json({ 
        success: true, 
        url: m3u8Match[1],
        // También devolvemos el HTML por si necesitas debuggear
        html: html.substring(0, 500) 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'No se encontró el stream',
        htmlPreview: html.substring(0, 1000) // Para debug
      });
    }
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
