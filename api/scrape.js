const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Origin, Referer');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // PROXY DE PÁGINAS - Para cargar vidzenvivo.cc con referer correcto
  if (req.url.startsWith('/api/proxy-page')) {
    const targetUrl = req.query.url;
    if (!targetUrl) {
      return res.status(400).json({ error: 'URL no proporcionada' });
    }
    
    try {
      const response = await axios({
        method: 'get',
        url: targetUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9',
          'Referer': 'https://futbol-libres.su/',
          'Origin': 'https://futbol-libres.su'
        },
        timeout: 30000,
        responseType: 'text'
      });
      
      let html = response.data;
      
      // Reescribir URLs relativas a absolutas
      html = html.replace(/(href|src)="([^"]*)"/g, (match, attr, url) => {
        if (url.startsWith('http')) return match;
        if (url.startsWith('//')) return `${attr}="https:${url}"`;
        const baseUrl = new URL(targetUrl).origin;
        return `${attr}="${baseUrl}${url}"`;
      });
      
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      return res.send(html);
      
    } catch (error) {
      console.error('Error proxy page:', error.message);
      return res.status(500).json({ error: 'Error al cargar página' });
    }
    return;
  }

  // PROXY DE STREAMS M3U8 - Para los archivos de video
  if (req.url.startsWith('/api/proxy-stream')) {
    const targetUrl = req.query.url;
    if (!targetUrl) {
      return res.status(400).json({ error: 'URL no proporcionada' });
    }
    
    try {
      const response = await axios({
        method: 'get',
        url: targetUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Accept-Language': 'es-419,es;q=0.9',
          'Referer': 'https://vidzenvivo.cc/',
          'Origin': 'https://vidzenvivo.cc',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'cross-site'
        },
        responseType: 'stream',
        timeout: 60000,
        maxRedirects: 5
      });
      
      // Copiar content-type
      const contentType = response.headers['content-type'] || 'application/vnd.apple.mpegurl';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      
      response.data.pipe(res);
      
    } catch (error) {
      console.error('Error proxy stream:', error.message);
      return res.status(500).json({ error: 'Error al obtener stream' });
    }
    return;
  }

  // API PRINCIPAL - Scraping
  try {
    const { data } = await axios.get('https://futbol-libres.su/agenda/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9'
      },
      timeout: 15000
    });

    const $ = cheerio.load(data);
    const eventos = [];

    // Scraping mejorado
    $('a[href*="eventos.html?r="]').each((i, link) => {
      const $link = $(link);
      const href = $link.attr('href');
      const textoLink = $link.text().trim();
      
      const $parent = $link.closest('li, p, div, .card');
      const textoParent = $parent.text();
      
      // Extraer título
      let titulo = '';
      const vsMatch = textoParent.match(/^([^[\n]*?(?:vs|VS|–|-)[^[\n]*)/);
      if (vsMatch) {
        titulo = vsMatch[1].replace(/\d+:\d+/, '').trim();
      } else {
        const lineas = textoParent.split('\n').map(l => l.trim()).filter(l => l && !l.includes('http'));
        titulo = lineas[0] || 'Evento';
      }
      
      titulo = titulo.replace(/^Ver\s+/i, '').replace(/\n/g, ' ').trim();
      
      // Extraer hora
      const horaMatch = textoParent.match(/(\d{1,2}:\d{2})/);
      const hora = horaMatch ? horaMatch[1] : '';
      
      // Extraer calidad
      const calidadMatch = textoLink.match(/(\d+p)/i);
      const calidad = calidadMatch ? calidadMatch[1] : 'SD';
      
      // Extraer nombre del canal
      let nombre = textoLink
        .replace(/Calidad\s+\d+p/i, '')
        .replace(/\d+p/i, '')
        .replace(/\(Recomendado\)/i, '')
        .replace(/\(Solo LATAM\)/i, '')
        .replace(/\(Solo Colombia\)/i, '')
        .replace(/OP\s+\d+/i, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\|/g, '')
        .trim();
      
      // Decodificar base64
      const base64Match = href.match(/r=([A-Za-z0-9+/=]+)/);
      let urlDecodificada = '';
      
      if (base64Match && base64Match[1]) {
        try {
          let base64 = base64Match[1];
          while (base64.length % 4 !== 0) base64 += '=';
          urlDecodificada = Buffer.from(base64, 'base64').toString('utf-8');
        } catch (e) {
          console.error('Error base64:', e);
        }
      }
      
      if (urlDecodificada && nombre && titulo) {
        // Detectar tipo de URL
        let tipo = 'iframe';
        if (urlDecodificada.includes('.m3u8') || urlDecodificada.includes('tracks-v')) {
          tipo = 'm3u8';
        } else if (urlDecodificada.includes('.mp4')) {
          tipo = 'mp4';
        }
        
        const eventoExistente = eventos.find(e => 
          e.titulo.toLowerCase() === titulo.toLowerCase()
        );
        
        if (eventoExistente) {
          const existeCanal = eventoExistente.canales.some(c => c.nombre === nombre);
          if (!existeCanal) {
            eventoExistente.canales.push({
              nombre: nombre,
              calidad: calidad,
              url: urlDecodificada,
              tipo: tipo,
              urlProxy: `https://stream-api-flax-seven.vercel.app/api/proxy-page?url=${encodeURIComponent(urlDecodificada)}`
            });
          }
        } else {
          eventos.push({
            titulo: titulo,
            hora: hora,
            canales: [{
              nombre: nombre,
              calidad: calidad,
              url: urlDecodificada,
              tipo: tipo,
              urlProxy: `https://stream-api-flax-seven.vercel.app/api/proxy-page?url=${encodeURIComponent(urlDecodificada)}`
            }]
          });
        }
      }
    });

    // Ordenar por hora
    eventos.sort((a, b) => {
      if (!a.hora) return 1;
      if (!b.hora) return -1;
      return a.hora.localeCompare(b.hora);
    });

    return res.status(200).json({
      success: true,
      fecha: new Date().toISOString(),
      totalEventos: eventos.length,
      eventos: eventos
    });

  } catch (error) {
    console.error('Error scraping:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      eventos: []
    });
  }
};
