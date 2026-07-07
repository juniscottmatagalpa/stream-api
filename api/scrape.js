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
      
      // Buscar el elemento padre (li, p, o div) que contiene el título
      const $parent = $link.closest('li, p, div');
      const textoParent = $parent.text();
      
      // Extraer título del partido (texto antes de los enlaces)
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
          // Asegurar padding correcto
          while (base64.length % 4 !== 0) {
            base64 += '=';
          }
          urlDecodificada = Buffer.from(base64, 'base64').toString('utf-8');
        } catch (e) {
          console.error('Error decodificando base64:', e);
        }
      }
      
      if (urlDecodificada && nombre) {
        // Buscar si ya existe este evento
        const eventoExistente = eventos.find(e => e.titulo === titulo);
        
        if (eventoExistente) {
          // Agregar canal al evento existente
          const canalExistente = eventoExistente.canales.find(c => c.nombre === nombre);
          if (!canalExistente) {
            eventoExistente.canales.push({
              nombre: nombre,
              calidad: calidad,
              url: urlDecodificada
            });
          }
        } else {
          // Crear nuevo evento
          eventos.push({
            titulo: titulo,
            hora: hora,
            canales: [{
              nombre: nombre,
              calidad: calidad,
              url: urlDecodificada
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
