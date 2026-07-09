const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('Scraping https://futbol-libres.su/agenda/...');
    
    const { data: html } = await axios.get('https://futbol-libres.su/agenda/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Referer': 'https://futbol-libres.su/'
      },
      timeout: 15000
    });

    const $ = cheerio.load(html);
    const eventos = [];
    let eventoActual = null;

    // Buscar todos los elementos que contienen enlaces de eventos
    $('*').each((i, elem) => {
      const $elem = $(elem);
      const links = $elem.find('a[href*="eventos.html?r="]');
      
      if (links.length === 0) return;

      // Buscar el título del evento (enlace anterior o texto del elemento padre)
      const $parent = $elem.closest('li, div, p');
      const tituloLink = $parent.find('a[href="#"]').first();
      
      // Si encontramos un nuevo título, creamos nuevo evento
      if (tituloLink.length > 0) {
        const textoCompleto = tituloLink.text().trim();
        
        // Extraer hora (formato HH:MM al final)
        const horaMatch = textoCompleto.match(/(\d{1,2}:\d{2})$/);
        const hora = horaMatch ? horaMatch[1] : '';
        const titulo = textoCompleto.replace(/\d{1,2}:\d{2}$/, '').trim();
        
        if (titulo && titulo.length > 3 && !titulo.includes('http')) {
          eventoActual = {
            titulo: titulo,
            hora: hora,
            canales: []
          };
          eventos.push(eventoActual);
          console.log('Nuevo evento:', titulo, '- Hora:', hora);
        }
      }

      // Procesar los enlaces de canales
      if (eventoActual) {
        links.each((j, link) => {
          const $link = $(link);
          const href = $link.attr('href');
          const texto = $link.text().trim();
          
          if (!href || !href.includes('r=')) return;

          // Extraer calidad (1080p, 720p, etc)
          const calidadMatch = texto.match(/(\d{3,4}p)/i);
          const calidad = calidadMatch ? calidadMatch[1] : 'SD';

          // Limpiar nombre del canal
          let nombre = texto
            .replace(/Calidad\s+\d{3,4}p/i, '')
            .replace(/\d{3,4}p/i, '')
            .replace(/\(Recomendado\)/gi, '')
            .replace(/\(Solo LATAM[^)]*\)/gi, '')
            .replace(/\(Solo Colombia\)/gi, '')
            .replace(/OP\s+\d+/i, '')
            .replace(/\[.*?\]/g, '')
            .replace(/\|/g, '')
            .trim();

          if (!nombre) nombre = 'Canal';

          // Extraer y decodificar base64
          const base64Match = href.match(/[?&]r=([A-Za-z0-9+/=]+)/);
          
          if (base64Match && base64Match[1]) {
            try {
              let base64 = base64Match[1];
              // Asegurar padding correcto
              while (base64.length % 4 !== 0) base64 += '=';
              
              const urlDecodificada = Buffer.from(base64, 'base64').toString('utf-8');
              
              // Verificar que sea URL válida
              if (urlDecodificada.startsWith('http')) {
                // Evitar duplicados
                const existe = eventoActual.canales.some(c => c.nombre === nombre);
                if (!existe) {
                  eventoActual.canales.push({
                    nombre: nombre,
                    calidad: calidad,
                    urlOriginal: urlDecodificada
                  });
                  console.log('  Canal:', nombre, '- URL:', urlDecodificada);
                }
              }
            } catch (e) {
              console.error('Error decodificando base64:', e.message);
            }
          }
        });
      }
    });

    // Limpiar eventos sin canales
    const eventosValidos = eventos.filter(e => e.canales.length > 0);

    // Si no hay eventos o ninguno tiene CazeTV, agregar por defecto
    let tieneCazeTV = eventosValidos.some(e => 
      e.canales.some(c => c.nombre.toLowerCase().includes('caze'))
    );

    if (eventosValidos.length === 0) {
      console.log('No se encontraron eventos, creando evento por defecto');
      eventosValidos.push({
        titulo: 'Transmisión en Vivo',
        hora: '',
        canales: [{
          nombre: 'CazeTV',
          calidad: '1080p',
          urlOriginal: 'https://latamvidzfy.org/caze2.php'
        }]
      });
    } else if (!tieneCazeTV) {
      console.log('Agregando CazeTV al primer evento');
      eventosValidos[0].canales.unshift({
        nombre: 'CazeTV',
        calidad: '1080p',
        urlOriginal: 'https://latamvidzfy.org/caze2.php'
      });
    }

    // Ordenar por hora
    eventosValidos.sort((a, b) => {
      if (!a.hora) return 1;
      if (!b.hora) return -1;
      return a.hora.localeCompare(b.hora);
    });

    console.log(`\nTotal eventos: ${eventosValidos.length}`);
    eventosValidos.forEach((e, i) => {
      console.log(`${i + 1}. ${e.titulo} (${e.canales.length} canales)`);
    });

    return res.json({
      success: true,
      fecha: new Date().toISOString(),
      totalEventos: eventosValidos.length,
      eventos: eventosValidos
    });

  } catch (error) {
    console.error('Error scraping:', error.message);
    
    // Fallback con CazeTV
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
