const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  // PROXY DE STREAMS - Para pasar el referer correcto
  if (req.url.includes('proxy-stream')) {
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
      res.setHeader('Access-Control-Allow-Origin', '*');
      response.data.pipe(res);
      return;
    } catch (error) {
      return res.status(500).send('Error: ' + error.message);
    }
  }

  // SCRAPING DE LA AGENDA
  try {
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

    // Buscar todos los enlaces de eventos
    $('a[href*="eventos.html?r="]').each((i, link) => {
      try {
        const $link = $(link);
        const href = $link.attr('href');
        const textoLink = $link.text().trim();
        
        if (!href || !textoLink) return;

        // Buscar el elemento padre que contiene todo el evento
        const $parent = $link.closest('li');
        let $eventContainer = $parent;
        
        // Si no está en li, buscar en el contenedor anterior
        if ($parent.length === 0) {
          $eventContainer = $link.parent().parent();
        }

        // Obtener todo el texto del contenedor
        const textoContainer = $eventContainer.text();
        
        // Extraer hora (formato HH:MM o H:MM)
        const horaMatch = textoContainer.match(/(\d{1,2}:\d{2})/);
        const hora = horaMatch ? horaMatch[1] : '';

        // Buscar el título del partido (enlace anterior o texto antes de los canales)
        let titulo = '';
        
        // Buscar el enlace del título del partido (el que tiene # en el href)
        const $tituloLink = $eventContainer.find('a[href="#"]').first();
        if ($tituloLink.length > 0) {
          titulo = $tituloLink.text().trim();
          // Limpiar la hora del título si está pegada
          titulo = titulo.replace(/\d{1,2}:\d{2}$/, '').trim();
        } else {
          // Si no hay enlace de título, buscar en el texto del contenedor
          const lineas = textoContainer.split('\n').map(l => l.trim()).filter(l => l);
          for (let linea of lineas) {
            if (linea.includes('vs') || linea.includes('VS') || linea.includes(':')) {
              // Limpiar hora al final
              titulo = linea.replace(/\d{1,2}:\d{2}$/, '').trim();
              break;
            }
          }
        }

        // Limpiar título
        titulo = titulo.replace(/^Ver\s+/i, '').replace(/\n/g, ' ').trim();
        
        // Si no hay título, saltar
        if (!titulo || titulo.length < 3) return;

        // Extraer calidad del texto del canal
        const calidadMatch = textoLink.match(/(\d+p)/i);
        const calidad = calidadMatch ? calidadMatch[1] : 'SD';

        // Extraer nombre del canal (texto antes de "Calidad")
        let nombreCanal = textoLink
          .replace(/Calidad\s+\d+p/i, '')
          .replace(/\d+p/i, '')
          .trim();

        if (!nombreCanal) nombreCanal = 'Canal';

        // Decodificar base64 del enlace
        const base64Match = href.match(/r=([A-Za-z0-9+/=]+)/);
        let urlDecodificada = '';
        
        if (base64Match && base64Match[1]) {
          try {
            let base64 = base64Match[1];
            // Asegurar padding correcto
            while (base64.length % 4 !== 0) base64 += '=';
            urlDecodificada = Buffer.from(base64, 'base64').toString('utf-8');
            console.log('URL decodificada:', urlDecodificada);
          } catch (e) {
            console.error('Error base64:', e);
          }
        }

        if (urlDecodificada) {
          // Buscar si ya existe este evento
          const eventoExistente = eventos.find(e => 
            e.titulo.toLowerCase() === titulo.toLowerCase()
          );

          const canalData = {
            nombre: nombreCanal,
            calidad: calidad,
            url: urlDecodificada,
            // URL del proxy para evitar bloqueo de referer
            proxyUrl: `https://stream-api-flax-seven.vercel.app/api/scrape?proxy-stream=1&url=${encodeURIComponent(urlDecodificada)}`
          };

          if (eventoExistente) {
            // Agregar canal al evento existente
            const existeCanal = eventoExistente.canales.some(c => c.nombre === nombreCanal);
            if (!existeCanal) {
              eventoExistente.canales.push(canalData);
            }
          } else {
            // Crear nuevo evento
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

    // Ordenar eventos por hora
    eventos.sort((a, b) => {
      if (!a.hora) return 1;
      if (!b.hora) return -1;
      return a.hora.localeCompare(b.hora);
    });

    console.log(`Encontrados ${eventos.length} eventos`);

    return res.json({
      success: true,
      fecha: new Date().toISOString(),
      totalEventos: eventos.length,
      eventos: eventos
    });

  } catch (error) {
    console.error('Error scraping:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      eventos: []
    });
  }
};
