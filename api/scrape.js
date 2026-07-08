const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

    // Buscar todos los eventos en la agenda
    $('.card, .evento, [class*="evento"], li, .partido').each((i, elem) => {
      const $elem = $(elem);
      
      // Buscar enlaces de eventos dentro de este elemento
      const $links = $elem.find('a[href*="eventos.html?r="]');
      
      if ($links.length === 0) return;
      
      // Extraer título - buscar en el texto del elemento padre
      let titulo = '';
      const textoCompleto = $elem.text();
      
      // Intentar extraer título antes de la hora o de los enlaces
      const lineas = textoCompleto.split('\n').map(l => l.trim()).filter(l => l);
      
      // Buscar línea que contenga "vs" o que sea el título del partido
      for (let linea of lineas) {
        if (linea.includes('vs') || linea.includes('VS') || linea.includes('-')) {
          // Limpiar la línea de horas y etiquetas
          titulo = linea.replace(/\d+:\d+/, '').replace(/\[.*?\]/g, '').trim();
          if (titulo) break;
        }
      }
      
      // Si no encontramos título, usar la primera línea significativa
      if (!titulo && lineas.length > 0) {
        titulo = lineas[0].replace(/Ver\s+/i, '').trim();
      }
      
      // Extraer hora
      const horaMatch = textoCompleto.match(/(\d{1,2}:\d{2})/);
      const hora = horaMatch ? horaMatch[1] : '';
      
      // Procesar cada enlace de canal
      const canales = [];
      
      $links.each((j, link) => {
        const $link = $(link);
        const href = $link.attr('href');
        const textoLink = $link.text().trim();
        
        // Extraer calidad
        const calidadMatch = textoLink.match(/(\d+p)/i);
        const calidad = calidadMatch ? calidadMatch[1] : 'SD';
        
        // Extraer nombre del canal
        let nombreCanal = textoLink
          .replace(/Calidad\s+\d+p/i, '')
          .replace(/\d+p/i, '')
          .replace(/\(Recomendado\)/i, '')
          .replace(/\(Solo LATAM\)/i, '')
          .replace(/\(Solo Colombia\)/i, '')
          .replace(/OP\s+\d+/i, '')
          .replace(/\[.*?\]/g, '')
          .replace(/\|/g, '')
          .trim();
        
        // Decodificar base64 del enlace
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
        
        if (urlDecodificada && nombreCanal) {
          canales.push({
            nombre: nombreCanal,
            calidad: calidad,
            url: urlDecodificada
          });
        }
      });
      
      // Solo agregar si tenemos título y canales
      if (titulo && canales.length > 0) {
        // Verificar si ya existe este evento
        const eventoExistente = eventos.find(e => 
          e.titulo.toLowerCase() === titulo.toLowerCase() ||
          (e.hora === hora && titulo.includes(e.titulo.substring(0, 10)))
        );
        
        if (eventoExistente) {
          // Agregar canales nuevos al evento existente
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

    // Ordenar eventos por hora
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
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      eventos: []
    });
  }
};
