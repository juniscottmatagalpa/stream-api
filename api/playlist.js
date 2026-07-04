export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const STREAM_URL = 'https://p1.kamfir10.space/playlist/52907/camrys/caxi';
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(STREAM_URL, {
      signal: controller.signal,
      headers: {
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'es-419,es;q=0.9',
        'Origin': 'https://gooz.aapmains.net',
        'Referer': 'https://gooz.aapmains.net/',
        'Sec-Ch-Ua': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'
      }
    });
    
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    let playlist = await response.text();
    
    if (!playlist.includes('#EXTM3U')) {
      return res.status(500).json({
        error: 'Invalid playlist',
        preview: playlist.substring(0, 200)
      });
    }
    
    // Reescribir URLs
    const proxyBase = `https://stream-kaceurp5n-jsinfos-projects.vercel.app/api/proxy?url=`;
    
    playlist = playlist.replace(
      /(https?:\/\/[^\s"\n]+)/g, 
      (match) => `${proxyBase}${encodeURIComponent(match)}`
    );

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(playlist);
    
  } catch (error) {
    // Si falla el fetch directo, intentar con proxy CORS público
    try {
      const corsProxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(STREAM_URL)}`;
      const proxyResponse = await fetch(corsProxy);
      
      if (!proxyResponse.ok) throw new Error('Proxy failed');
      
      let playlist = await proxyResponse.text();
      
      const proxyBase = `https://stream-kaceurp5n-jsinfos-projects.vercel.app/api/proxy?url=`;
      playlist = playlist.replace(
        /(https?:\/\/[^\s"\n]+)/g, 
        (match) => `${proxyBase}${encodeURIComponent(match)}`
      );

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.send(playlist);
      
    } catch (proxyError) {
      res.status(500).json({ 
        error: 'Both direct and proxy fetch failed',
        directError: error.message,
        proxyError: proxyError.message
      });
    }
  }
}
