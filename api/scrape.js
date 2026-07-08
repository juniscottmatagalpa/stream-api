const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Detectar si es una petición de proxy
    const isProxy = req.query.url && req.query.proxy === '1';
    
    if (isProxy) {
      // PROXY DE PÁGINA
      const targetUrl = decodeURIComponent(req.query.url);
      
      console.log('Proxy:', targetUrl);
      
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
    
    // SCRAPING NORMAL
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

    $('a[href*="eventos.html?r="]').each((i, link) => {
      try {
        const $link = $(link);
        const href = $link.attr('href');
        const textoLink = $link.text().trim();
        
        if (!href || !textoLink) return;
        
        const $parent = $link.parent();
        const textoParent = $parent.text();
        
        // Extraer título
        let titulo = '';
        const lineas = textoParent.split('\n').map(l => l.trim()).filter(l => l);
        
        for (let linea of lineas) {
          if (linea.match(/vs|VS|–|-/i) && linea.length < 100) {
            titulo = linea.replace(/\d+:\d+/, '').replace(/\[.*?\]/g, '').trim();
            break;
          }
        }
        
        if (!titulo) titulo = lineas[0] || 'Evento';
        titulo = titulo.replace(/^Ver\s+/i, '').trim();
        
        // Extraer hora
        const horaMatch = textoParent.match(/(\d{1,2}:\d{2})/);
        const hora = horaMatch ? horaMatch[1] : '';
        
        // Extraer calidad
        const calidadMatch = textoLink.match(/(\d+p)/i);
        const calidad = calidadMatch ? calidadMatch[1] : 'SD';
        
        // Limpiar nombre
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
            url: urlDecodificada,
            // URL del proxy para evitar bloqueo de referer
            proxyUrl: `https://stream-api-flax-seven.vercel.app/api/scrape?url=${encodeURIComponent(urlDecodificada)}&proxy=1`
          };
          
          if (eventoExistente) {
            const existe = eventoExistente.canales.some(c => c.nombre === nombre);
            if (!existe) eventoExistente.canales.push(canalData);
          } else {
            eventos.push({
              titulo: titulo,
              hora: hora,
              canales: [canalData]
            });
          }
        }
      } catch (e) {
        console.error('Error link:', e);
      }
    });

    eventos.sort((a, b) => {
      if (!a.hora) return 1;
      if (!b.hora) return -1;
      return a.hora.localeCompare(b.hora);
    });

    return res.json({
      success: true,
      totalEventos: eventos.length,
      eventos: eventos
    });

  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      eventos: []
    });
  }
};
