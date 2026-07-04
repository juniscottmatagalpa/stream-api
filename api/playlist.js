// api/playlist.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // URL base del stream (la que te dio Video Download Helper)
  const STREAM_URL = 'https://p1.kamfir10.space/playlist/52907/camrys/caxi';
  
  try {
    const response = await fetch(STREAM_URL, {
      headers: {
        'Referer': 'https://gooz.aapmains.net/',
        'Origin': 'https://gooz.aapmains.net/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    let playlist = await response.text();
    
    // Reescribir URLs en la playlist para que apunten a nuestro proxy
    // Las URLs .ts deben pasar por nuestro proxy
    const proxyBase = `https://stream-api-flax-seven.vercel.app/api/proxy?url=`;
    
    // Reemplazar URLs relativas o absolutas en el m3u8
    playlist = playlist.replace(
      /(https?:\/\/[^\s"\n]+)/g, 
      (match) => `${proxyBase}${encodeURIComponent(match)}`
    );

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.status(200).send(playlist);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
