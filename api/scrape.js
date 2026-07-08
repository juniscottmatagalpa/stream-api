const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Endpoint proxy para streams (nuevo)
  if (req.url.startsWith('/api/stream')) {
    const streamUrl = req.query.url;
    if (!streamUrl) {
      return res.status(400).json({ error: 'URL no proporcionada' });
    }
    
    try {
      const response = await axios({
        method: 'get',
        url: streamUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'es-419,es;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Origin': 'https://vidzenvivo.cc',
          'Referer': 'https://vidzenvivo.cc/',
          'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'cross-site'
        },
        responseType: 'stream',
        timeout: 30000
      });
      
      // Copiar headers importantes
      res.setHeader('Content-Type', response.headers['content-type'] || 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      response.data.pipe(res);
    } catch (error) {
      console.error('Error proxy:', error);
      return res.status(500).json({ error: 'Error al obtener stream' });
    }
    return;
  }

  // Endpoint principal de scraping
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

    // Buscar todos los enlaces de eventos
    $('a[href*="eventos.html?r="]').each((i, link) => {
      const $link = $(link);
      const href = $link.attr('href');
      const textoLink = $link.text().trim();
      
      // Buscar el elemento padre
      const $parent = $link.closest('li, p, div');
      const textoParent = $parent.text();
      
      // Extraer título del partido
      const tituloMatch = textoParent.match(/^([^[]+?)(?:\d+:\d+|\[|https|$)/);
      let titulo = tituloMatch ? tituloMatch[1].trim() : 'Evento';
      
      // Limpiar título
      titulo = titulo.replace(/^Ver\s+/i, '').replace(/\n/g, ' ').trim();
      
      // Extraer hora
      const horaMatch = textoParent.match(/(\d+:\d+)/);
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
        .replace(/\|/g, '')
        .trim();
      
      // Decodificar base64
      const base64Match = href.match(/r=([A-Za-z0-9+/=]+)/);
      let urlDecodificada = '';
      
      if (base64Match && base64Match[1]) {
        try {
          let base64 = base64Match[1];
          while (base64.length % 4 !== 0) {
            base64 += '=';
          }
          urlDecodificada = Buffer.from(base64, 'base64').toString('utf-8');
        } catch (e) {
          console.error('Error decodificando base64:', e);
        }
      }
      
      if (urlDecodificada && nombre) {
        // Detectar si es m3u8 o iframe
        const esM3U8 = urlDecodificada.includes('.m3u8') || urlDecodificada.includes('tracks-v');
        const esIframe = urlDecodificada.includes('.php') || urlDecodificada.includes('.html');
        
        const eventoExistente = eventos.find(e => e.titulo === titulo);
        
        if (eventoExistente) {
          const canalExistente = eventoExistente.canales.find(c => c.nombre === nombre);
          if (!canalExistente) {
            eventoExistente.canales.push({
              nombre: nombre,
              calidad: calidad,
              url: urlDecodificada,
              tipo: esM3U8 ? 'm3u8' : (esIframe ? 'iframe' : 'directo')
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
              tipo: esM3U8 ? 'm3u8' : (esIframe ? 'iframe' : 'directo')
            }]
          });
        }
      }
    });

    return res.status(200).json({
      success: true,
      fecha: new Date().toISOString(),
      totalEventos: eventos.length,
      eventos: eventos
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      eventos: []
    });
  }
};
