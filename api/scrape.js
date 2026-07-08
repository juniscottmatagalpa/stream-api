const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const url = req.url;
    
    // PROXY DE PÁGINAS
    if (url.startsWith('/api/proxy-page')) {
      const targetUrl = req.query.url;
      if (!targetUrl) {
        return res.status(400).send('URL requerida');
      }
      
      console.log('Proxying page:', targetUrl);
      
      const response = await axios({
        method: 'get',
        url: targetUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9',
          'Referer': 'https://futbol-libres.su/',
          'Origin': 'https://futbol-libres.su'
        },
        timeout: 30000
      });
      
      res.setHeader('Content-Type', 'text/html');
      return res.send(response.data);
    }
    
    // PROXY DE STREAMS M3U8
    if (url.startsWith('/api/proxy-stream')) {
      const targetUrl = req.query.url;
      if (!targetUrl) {
        return res.status(400).send('URL requerida');
      }
      
      console.log('Proxying stream:', targetUrl);
      
      const response = await axios({
        method: 'get',
        url: targetUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Referer': 'https://vidzenvivo.cc/',
          'Origin': 'https://vidzenvivo.cc'
        },
        responseType: 'stream',
        timeout: 60000
      });
      
      res.setHeader('Content-Type', response.headers['content-type'] || 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      
      response.data.pipe(res);
      return;
    }
    
    // API PRINCIPAL - SCRAPING
    console.log('Scraping agenda...');
    
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

    // Buscar enlaces de eventos
    $('a[href*="eventos.html?r="]').each((i, link) => {
      try {
        const $link = $(link);
        const href = $link.attr('href');
        const textoLink = $link.text().trim();
        
        if (!href || !textoLink) return;
        
        // Buscar contenedor padre
        const $parent = $link.parent();
        const textoParent = $parent.text();
        
        // Extraer título (línea que contiene vs o VS)
        let titulo = '';
        const lineas = textoParent.split('\n').map(l => l.trim()).filter(l => l);
        
        for (let linea of lineas) {
          if (linea.match(/vs|VS|–|-/i) && linea.length < 100) {
            titulo = linea.replace(/\d+:\d+/, '').replace(/\[.*?\]/g, '').trim();
            break;
          }
        }
        
        if (!titulo) {
          titulo = lineas[0] || 'Evento';
        }
        
        titulo = titulo.replace(/^Ver\s+/i, '').trim();
        
        // Extraer hora
        const horaMatch = textoParent.match(/(\d{1,2}:\d{2})/);
        const hora = horaMatch ? horaMatch[1] : '';
        
        // Extraer calidad
        const calidadMatch = textoLink.match(/(\d+p)/i);
        const calidad = calidadMatch ? calidadMatch[1] : 'SD';
        
        // Limpiar nombre del canal
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
        
        if (!nombre) nombre = 'Canal';
        
        // Decodificar base64
        const base64Match = href.match(/r=([A-Za-z0-9+/=]+)/);
        let urlDecodificada = '';
        
        if (base64Match && base64Match[1]) {
          let base64 = base64Match[1];
          while (base64.length % 4 !== 0) base64 += '=';
          urlDecodificada = Buffer.from(base64, 'base64').toString('utf-8');
        }
        
        if (urlDecodificada && titulo) {
          const eventoExistente = eventos.find(e => 
            e.titulo.toLowerCase() === titulo.toLowerCase()
          );
          
          const canalData = {
            nombre: nombre,
            calidad: calidad,
            url: urlDecodificada
          };
          
          if (eventoExistente) {
            const existe = eventoExistente.canales.some(c => c.nombre === nombre);
            if (!existe) {
              eventoExistente.canales.push(canalData);
            }
          } else {
            eventos.push({
              titulo: titulo,
              hora: hora,
              canales: [canalData]
            });
          }
        }
      } catch (e) {
        console.error('Error procesando link:', e);
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
