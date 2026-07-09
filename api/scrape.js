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
  if (url.includes('/proxy/') || req.query.proxy === '1') {
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
          return status < 500;
        }
      });

      const contentType = response.headers['content-type'] || '';
      
      if (contentType.includes('mpegurl') || contentType.includes('m3u8') || targetUrl.includes('.m3u8')) {
        let m3u8Content = '';
        response.data.on('data', chunk => {
          m3u8Content += chunk;
        });
        
        response.data.on('end', () => {
          const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
          
          const modifiedM3U8 = m3u8Content.replace(/^(?!#)(.+)$/gm, (match, url) => {
            if (url.startsWith('http')) {
              return `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/scrape?url=${encodeURIComponent(url)}&proxy=1`;
            } else {
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
    let eventoActual = null;

    // Recorrer todos los elementos del contenido
    $('body').find('li, p, div').each((i, elem) => {
      const $elem = $(elem);
      const html = $elem.html() || '';
      const texto = $elem.text().trim();
      
      // Buscar enlaces de eventos (canales codificados)
      const canalLinks = $elem.find('a[href*="eventos.html?r="]');
      
      if (canalLinks.length > 0) {
        // Verificar si hay un enlace principal (título del partido)
        const tituloLink = $elem.find('a[href="#"]').first();
        
        if (tituloLink.length > 0) {
          // Es un nuevo evento
          const textoTitulo = tituloLink.text().trim();
          const horaMatch = textoTitulo.match(/(\d{1,2}:\d{2})$/);
          const hora = horaMatch ? horaMatch[1] : '';
          const titulo = textoTitulo.replace(/\d{1,2}:\d{2}$/, '').trim();
          
          if (titulo && titulo.length > 3) {
            eventoActual = {
              titulo: titulo,
              hora: hora,
              canales: []
            };
            eventos.push(eventoActual);
          }
        }
        
        // Procesar los canales del evento actual
        if (eventoActual) {
          canalLinks.each((j, link) => {
            const $link = $(link);
            const href = $link.attr('href');
            const textoCanal = $link.text().trim();
            
            if (!href || href.includes('#')) return;

            // Extraer calidad
            const calidadMatch = textoCanal.match(/(\d+p)/i);
            const calidad = calidadMatch ? calidadMatch[1] : 'SD';

            // Extraer nombre del canal
            let nombreCanal = textoCanal
              .replace(/Calidad\s+\d+p/i, '')
              .replace(/\d+p/i, '')
              .replace(/\(Recomendado\)/i, '')
              .replace(/\(Solo LATAM[^)]*\)/i, '')
              .replace(/\(Solo Colombia\)/i, '')
              .replace(/OP\s+\d+/i, '')
              .replace(/\[.*?\]/g, '')
              .replace(/\|/g, '')
              .trim();

            if (!nombreCanal) nombreCanal = `Canal ${j + 1}`;

            // Decodificar base64
            const base64Match = href.match(/[?&]r=([A-Za-z0-9+/=]+)/);
            
            if (base64Match && base64Match[1]) {
              try {
                let base64 = base64Match[1];
                // Asegurar padding correcto
                while (base64.length % 4 !== 0) base64 += '=';
                const urlDecodificada = Buffer.from(base64, 'base64').toString('utf-8');
                
                console.log('Canal:', nombreCanal, '- URL:', urlDecodificada);
                
                // Verificar si el canal ya existe
                const existe = eventoActual.canales.some(c => c.nombre === nombreCanal);
                if (!existe) {
                  eventoActual.canales.push({
                    nombre: nombreCanal,
                    calidad: calidad,
                    urlOriginal: urlDecodificada
                  });
                }
              } catch (e) {
                console.error('Error decodificando base64:', e.message);
              }
            }
          });
        }
      }
    });

    // Si no hay eventos, crear uno por defecto con CazeTV
    if (eventos.length === 0) {
      console.log('No se encontraron eventos, creando evento por defecto con CazeTV');
      eventos.push({
        titulo: 'Evento en Vivo',
        hora: '',
        canales: [{
          nombre: 'CazeTV',
          calidad: '1080p',
          urlOriginal: 'https://latamvidzfy.org/caze2.php'
        }]
      });
    } else {
      // Verificar si algún evento tiene CazeTV, si no, agregarlo al primer evento
      let tieneCazeTV = false;
      eventos.forEach(evento => {
        if (evento.canales.some(c => c.nombre.toLowerCase().includes('caze'))) {
          tieneCazeTV = true;
        }
      });
      
      if (!tieneCazeTV) {
        console.log('Agregando CazeTV por defecto al primer evento');
        eventos[0].canales.unshift({
          nombre: 'CazeTV',
          calidad: '1080p',
          urlOriginal: 'https://latamvidzfy.org/caze2.php'
        });
      }
    }

    // Ordenar eventos por hora
    eventos.sort((a, b) => {
      if (!a.hora) return 1;
      if (!b.hora) return -1;
      return a.hora.localeCompare(b.hora);
    });

    console.log(`Total eventos encontrados: ${eventos.length}`);
    eventos.forEach((e, i) => {
      console.log(`Evento ${i + 1}: ${e.titulo} (${e.canales.length} canales)`);
    });

    return res.json({
      success: true,
      fecha: new Date().toISOString(),
      totalEventos: eventos.length,
      eventos: eventos
    });

  } catch (error) {
    console.error('Error scraping:', error.message);
    
    // En caso de error, devolver evento por defecto con CazeTV
    return res.json({
      success: true,
      fecha: new Date().toISOString(),
      totalEventos: 1,
      eventos: [{
        titulo: 'Transmisión en Vivo',
        hora: '',
        canales: [{
          nombre: 'CazeTV',
          calidad: '1080p',
          urlOriginal: 'https://latamvidzfy.org/caze2.php'
        }]
      }]
    });
  }
};
