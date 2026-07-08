const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url;

  // PROXY DE STREAMS M3U8
  if (url.includes('/proxy-stream')) {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL requerida');

    try {
      const response = await axios({
        method: 'get',
        url: decodeURIComponent(targetUrl),
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
    } catch (error) {
      return res.status(500).send('Error: ' + error.message);
    }
  }

  // SCRAPING
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

    // Buscar cada evento por su estructura
    // Según la imagen, cada evento tiene: hora, título, y canales debajo
    $('div, li, article, .evento, .partido').each((i, elem) => {
      const $elem = $(elem);
      const texto = $elem.text();
      
      // Buscar si contiene un enlace de evento
      const $links = $elem.find('a[href*="eventos.html?r="]');
      if ($links.length === 0) return;

      // Extraer hora (formato HH:MM)
      const horaMatch = texto.match(/(\d{1,2}:\d{2})/);
      const hora = horaMatch ? horaMatch[1] : '';

      // Extraer título del partido (buscar línea con vs, -, o que sea el título principal)
      let titulo = '';
      
      // Intentar encontrar el título antes de los enlaces
      const textoLimpio = $elem.clone().find('a').remove().end().text();
      const lineas = textoLimpio.split('\n').map(l => l.trim()).filter(l => l);
      
      for (let linea of lineas) {
        // Buscar línea que contenga vs, VS, o sea un partido
        if (linea.match(/vs|VS|–|-|:/i) && linea.length > 5 && linea.length < 100) {
          titulo = linea.replace(/^\d{1,2}:\d{2}\s*/, '').trim();
          break;
        }
      }
      
      // Si no encontramos, usar primera línea significativa
      if (!titulo && lineas.length > 0) {
        titulo = lineas[0].replace(/^\d{1,2}:\d{2}\s*/, '').trim();
      }

      // Limpiar título
      titulo = titulo.replace(/^Ver\s+/i, '').replace(/\n/g, ' ').trim();
      
      if (!titulo || titulo.length < 3) return;

      // Procesar canales
      const canales = [];
      $links.each((j, link) => {
        const $link = $(link);
        const href = $link.attr('href');
        const textoLink = $link.text().trim();

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

        if (!nombre) nombre = 'Canal ' + (j + 1);

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

        if (urlDecodificada) {
          // Detectar si es m3u8
          const esM3U8 = urlDecodificada.includes('.m3u8') || urlDecodificada.includes('tracks-v');
          
          canales.push({
            nombre: nombre,
            calidad: calidad,
            url: urlDecodificada,
            tipo: esM3U8 ? 'm3u8' : 'iframe',
            // URL para el proxy si es m3u8
            proxyUrl: esM3U8 ? 
              `https://stream-api-flax-seven.vercel.app/api/scrape?url=${encodeURIComponent(urlDecodificada)}&proxy-stream=1` : 
              urlDecodificada
          });
        }
      });

      if (canales.length > 0) {
        // Verificar si ya existe este evento
        const existente = eventos.find(e => 
          e.titulo.toLowerCase() === titulo.toLowerCase() ||
          (e.hora === hora && titulo.includes(e.titulo.substring(0, 15)))
        );

        if (existente) {
          // Agregar canales nuevos
          canales.forEach(canal => {
            const existe = existente.canales.some(c => c.nombre === canal.nombre);
            if (!existe) existente.canales.push(canal);
          });
        } else {
          eventos.push({
            titulo: titulo,
            hora: hora,
            canales: canales
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

    return res.json({
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
