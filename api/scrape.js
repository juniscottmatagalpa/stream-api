// api/scrape.js
const https = require('https');
const http = require('http');

// Lista de páginas a scrapear (agrega las que uses)
const SOURCES = [
  'https://ibuffstreams.app',
  'https://futbol-libres.su',
  'https://footybite.ac',
  'https://footybite.ac',
  'https://tarjetaroja.tv',
  'https://futbol-libres.su',
  // Agrega más fuentes aquí
];

// Headers para evitar bloqueos
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

// Función para hacer petición HTTP/HTTPS
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const options = {
      headers: HEADERS,
      timeout: 8000,
    };
    
    const req = client.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ html: data, finalUrl: res.responseUrl || url }));
    });
    
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Timeout')));
  });
}

// Extraer streams del HTML
function extractStreams(html, sourceUrl) {
  const streams = [];
  
  // Buscar iframes
  const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = iframeRegex.exec(html)) !== null) {
    let url = match[1];
    if (url.startsWith('//')) url = 'https:' + url;
    if (url.startsWith('/')) url = new URL(sourceUrl).origin + url;
    
    streams.push({
      type: 'iframe',
      url: url,
      source: sourceUrl,
      quality: 'HD'
    });
  }
  
  // Buscar enlaces m3u8
  const m3u8Regex = /(https?:\/\/[^\s"']+\.m3u8)/gi;
  while ((match = m3u8Regex.exec(html)) !== null) {
    streams.push({
      type: 'm3u8',
      url: match[1],
      source: sourceUrl,
      quality: 'HD'
    });
  }
  
  // Buscar enlaces .mp4 directos
  const mp4Regex = /(https?:\/\/[^\s"']+\.mp4)/gi;
  while ((match = mp4Regex.exec(html)) !== null) {
    streams.push({
      type: 'mp4',
      url: match[1],
      source: sourceUrl,
      quality: 'HD'
    });
  }
  
  return streams;
}

// Extraer título del partido
function extractMatchTitle(html) {
  // Intentar extraer de meta tags
  const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                     html.match(/<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["']/i);
  
  if (titleMatch) return titleMatch[1].trim();
  
  // Intentar extraer del title tag
  const titleTag = html.match(/<title>([^<]+)<\/title>/i);
  if (titleTag) {
    let title = titleTag[1].trim();
    // Limpiar título común
    title = title.replace(/(live|stream|online|free|watch)/gi, '').trim();
    return title;
  }
  
  // Buscar en el contenido texto común de partidos
  const matchRegex = /([A-Za-z\s]+)\s+(?:vs|VS|v\.s\.|–|-)\s+([A-Za-z\s]+)/;
  const contentMatch = html.match(matchRegex);
  if (contentMatch) {
    return `${contentMatch[1]} vs ${contentMatch[2]}`.trim();
  }
  
  return 'Partido en vivo';
}

// Verificar si un stream está activo
async function verifyStream(stream) {
  try {
    const url = stream.url;
    const client = url.startsWith('https') ? https : http;
    
    return new Promise((resolve) => {
      const req = client.request(url, { method: 'HEAD', timeout: 5000 }, (res) => {
        resolve(res.statusCode === 200 || res.statusCode === 301 || res.statusCode === 302);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => resolve(false));
      req.end();
    });
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const allStreams = [];
  
  // Scrapear cada fuente
  for (const source of SOURCES) {
    try {
      console.log(`Scrapeando: ${source}`);
      const { html } = await fetchUrl(source);
      
      const title = extractMatchTitle(html);
      const streams = extractStreams(html, source);
      
      // Agregar título a cada stream
      streams.forEach(stream => {
        stream.matchTitle = title;
      });
      
      allStreams.push(...streams);
    } catch (error) {
      console.error(`Error scrapeando ${source}:`, error.message);
    }
  }
  
  // Verificar cuáles están activos (opcional, puede ralentizar)
  // const activeStreams = [];
  // for (const stream of allStreams.slice(0, 5)) { // Verificar solo los primeros 5
  //   const isActive = await verifyStream(stream);
  //   if (isActive) activeStreams.push(stream);
  // }
  
  // Responder con los streams encontrados
  res.status(200).json({
    success: true,
    total: allStreams.length,
    streams: allStreams,
    timestamp: new Date().toISOString()
  });
}
