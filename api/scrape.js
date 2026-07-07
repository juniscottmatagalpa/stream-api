const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // Permitir CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  try {
    const { data } = await axios.get('https://futbol-libres.su/agenda/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(data);
    const eventos = [];
    
    // Buscar eventos en la agenda
    $('li, .evento, [class*="event"], [class*="partido"]').each((i, elem) => {
      const $el = $(elem);
      const texto = $el.text();
      
      // Buscar enlaces que contengan "eventos.html?r="
      const enlaces = [];
      $el.find('a[href*="eventos.html?r="]').each((j, link) => {
        const href = $(link).attr('href');
        const textoLink = $(link).text().trim();
        
        // Extraer calidad
        const calidadMatch = textoLink.match(/(\d+p)/i);
        const calidad = calidadMatch ? calidadMatch[1] : 'SD';
        
        // Extraer nombre del canal
        const nombreMatch = textoLink.match(/^([^\d]+?)(?:\s+Calidad|\s+\d+p|$)/i);
        const nombre = nombreMatch ? nombreMatch[1].trim() : 'Canal';
        
        // Decodificar base64
        const base64Match = href.match(/r=([A-Za-z0-9+/=]+)/);
        let urlDecodificada = '';
        if (base64Match) {
          try {
            urlDecodificada = Buffer.from(base64Match[1], 'base64').toString('utf-8');
          } catch (e) {
            urlDecodificada = '';
          }
        }
        
        if (urlDecodificada) {
          enlaces.push({
            nombre,
            calidad,
            url: urlDecodificada
          });
        }
      });
      
      if (enlaces.length > 0) {
        // Extraer título del partido (texto antes de los enlaces)
        const tituloMatch = texto.match(/([^[\n]+?)(?:\d+:\d+|\[)/);
        const titulo = tituloMatch ? tituloMatch[1].trim() : 'Evento';
        const horaMatch = texto.match(/(\d+:\d+)/);
        const hora = horaMatch ? horaMatch[1] : '';
        
        eventos.push({
          titulo: titulo.replace(hora, '').trim() + (hora ? ` - ${hora}` : ''),
          hora,
          canales: enlaces
        });
      }
    });
    
    // Si no encontramos eventos con el selector anterior, intentar otro método
    if (eventos.length === 0) {
      const pageText = $('body').text();
      
      // Buscar patrón de eventos manualmente
      const lineas = pageText.split('\n');
      let eventoActual = null;
      
      lineas.forEach(linea => {
        linea = linea.trim();
        if (linea.includes('vs') || linea.includes('-')) {
          // Podría ser un título de partido
          if (linea.match(/\d+:\d+/)) {
            eventoActual = {
              titulo: linea,
              canales: []
            };
          }
        }
      });
    }
    
    res.json({
      success: true,
      fecha: new Date().toISOString(),
      eventos: eventos
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      eventos: []
    });
  }
};
