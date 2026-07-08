const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.url;

  // ============================================
  // PROXY DE STREAMS M3U8 Y SEGMENTOS
  // ============================================
  if (url.includes('/proxy/')) {
    const targetUrl = decodeURIComponent(req.query.url || '');
    
    if (!targetUrl) {
      return res.status(400).json({ error: 'URL requerida' });
    }

    console.log('Proxying stream:', targetUrl.substring(0, 100));

    try {
      const response = await axios({
        method: 'get',
        url: targetUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'es-ES,es;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://vidzenvivo.cc/',
          'Origin': 'https://vidzenvivo.cc',
          'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'cross-site'
        },
        responseType: 'stream',
        timeout: 60000,
        maxRedirects: 5,
        validateStatus: function (status) {
          return status < 500; // Aceptar incluso 404s para debug
        }
      });

      // Si es m3u8, necesitamos modificar el contenido para apuntar a nuestro proxy
      const contentType = response.headers['content-type'] || '';
      
      if (contentType.includes('mpegurl') || contentType.includes('m3u8') || targetUrl.includes('.m3u8')) {
        // Leer el m3u8 completo
        let m3u8Content = '';
        response.data.on('data', chunk => {
          m3u8Content += chunk;
        });
        
        response.data.on('end', () => {
          // Reescribir URLs relativas para que pasen por nuestro proxy
          const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
          
          const modifiedM3U8 = m3u8Content.replace(/^(?!#)(.+)$/gm, (match, url) => {
            if (url.startsWith('http')) {
              // URL absoluta - pasar por proxy
              return `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/scrape?url=${encodeURIComponent(url)}&proxy=1`;
            } else {
              // URL relativa - construir completa y pasar por proxy
              const fullUrl = baseUrl + url;
              return `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/scrape?url=${encodeURIComponent(fullUrl)}&proxy=1`;
            }
          });
          
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.send(modifiedM3U8);
        });
        
        return;
      }

      // Para otros tipos de contenido (ts files, etc)
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-cache');
      response.data.pipe(res);
      return;
      
    } catch (error) {
      console.error('Proxy error:', error.message);
      return res.status(500).json({ error: 'Error proxy: ' + error.message });
    }
  }

  // ============================================
  // API DE SCRAPING
  // ============================================
  try {
    console.log('Scraping https://futbol-libres.su/agenda/...');
    
    const { data } = await axios.get('https://futbol-libres.su/agenda/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://futbol-libres.su/',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 15000,
      maxRedirects: 5
    });

    const $ = cheerio.load(data);
    const eventos = [];

    // Buscar cada elemento de evento
    $('li, .evento, article, [class*="match"], [class*="partido"]').each((i, elem) => {
      const $elem = $(elem);
      
      // Buscar enlaces de eventos (canales)
      const $canalesLinks = $elem.find('a[href*="eventos.html?r="]');
      if ($canalesLinks.length === 0) return;

      // Extraer información del evento
      const textoCompleto = $elem.text();
      
      // Buscar título y hora
      let titulo = '';
      let hora = '';
      
      // El título suele estar en el primer enlace o en el texto antes de los canales
      const $tituloLink = $elem.find('a').first();
      if ($tituloLink.length > 0) {
        const textoTitulo = $tituloLink.text().trim();
        // Extraer hora del final del texto (formato HH:MM)
        const horaMatch = textoTitulo.match(/(\d{1,2}:\d{2})$/);
        if (horaMatch) {
          hora = horaMatch[1];
          titulo = textoTitulo.replace(/\d{1,2}:\d{2}$/, '').trim();
        } else {
          titulo = textoTitulo;
        }
      }
      
      // Limpiar título
      titulo = titulo.replace(/^Ver\s+/i, '').replace(/\n/g, ' ').trim();
      
      // Si no hay título válido, saltar
      if (!titulo || titulo.length < 3 || titulo.includes('http')) return;

      // Procesar canales
      const canales = [];
      
      $canalesLinks.each((j, link) => {
        const $link = $(link);
        const href = $link.attr('href');
        const textoCanal = $link.text().trim();
        
        if (!href) return;

        // Extraer calidad
        const calidadMatch = textoCanal.match(/(\d+p)/i);
        const calidad = calidadMatch ? calidadMatch[1] : 'SD';

        // Extraer nombre del canal
        let nombreCanal = textoCanal
          .replace(/Calidad\s+\d+p/i, '')
          .replace(/\d+p/i, '')
          .replace(/\(Recomendado\)/i, '')
          .replace(/\(Solo LATAM\)/i, '')
          .replace(/\(Solo Colombia\)/i, '')
          .replace(/OP\s+\d+/i, '')
          .replace(/\[.*?\]/g, '')
          .replace(/\|/g, '')
          .trim();

        if (!nombreCanal) nombreCanal = `Canal ${j + 1}`;

        // Decodificar base64
        const base64Match = href.match(/r=([A-Za-z0-9+/=]+)/);
        let urlDecodificada = '';
        
        if (base64Match && base64Match[1]) {
          try {
            let base64 = base64Match[1];
            while (base64.length % 4 !== 0) base64 += '=';
            urlDecodificada = Buffer.from(base64, 'base64').toString('utf-8');
            console.log('Canal encontrado:', nombreCanal, '- URL:', urlDecodificada.substring(0, 50));
          } catch (e) {
            console.error('Error decodificando base64:', e);
          }
        }

        if (urlDecodificada) {
          // Crear URL del proxy
          const proxyUrl = `https://${req.headers.host}/api/scrape?url=${encodeURIComponent(urlDecodificada)}&proxy=1`;
          
          canales.push({
            nombre: nombreCanal,
            calidad: calidad,
            urlOriginal: urlDecodificada,
            proxyUrl: proxyUrl
          });
        }
      });

      if (canales.length > 0) {
        // Verificar si ya existe este evento
        const eventoExistente = eventos.find(e => 
          e.titulo.toLowerCase() === titulo.toLowerCase()
        );

        if (eventoExistente) {
          // Agregar canales nuevos
          canales.forEach(canal => {
            const existe = eventoExistente.canales.some(c => c.nombre === canal.nombre);
            if (!existe) {
              eventoExistente.canales.push(canal);
            }
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

    console.log(`Total eventos encontrados: ${eventos.length}`);

    return res.json({
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
