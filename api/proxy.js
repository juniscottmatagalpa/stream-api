module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const targetUrl = 'https://vidzenvivo.cc/canal.php?stream=dsports';
  
  try {
    // Fetch el HTML
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Referer': 'https://futbol-libres.su/'
      }
    });
    
    let html = await response.text();
    
    // Script espía que intercepta el m3u8
    const injectedScript = `
      <script>
        (function() {
          console.log('Spy script injected');
          
          // Interceptar XMLHttpRequest
          const originalOpen = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function(method, url) {
            if (url && url.includes('.m3u8')) {
              console.log('M3U8 detected via XHR:', url);
              window.parent.postMessage({
                type: 'STREAM_URL',
                url: url
              }, '*');
            }
            return originalOpen.apply(this, arguments);
          };
          
          // Interceptar fetch
          const originalFetch = window.fetch;
          window.fetch = function(url, options) {
            if (typeof url === 'string' && url.includes('.m3u8')) {
              console.log('M3U8 detected via fetch:', url);
              window.parent.postMessage({
                type: 'STREAM_URL',
                url: url
              }, '*');
            }
            return originalFetch.apply(this, arguments);
          };
          
          // También observar cambios en el DOM por si el src está en un tag video
          setTimeout(() => {
            const video = document.querySelector('video');
            if (video && video.src && video.src.includes('.m3u8')) {
              window.parent.postMessage({
                type: 'STREAM_URL',
                url: video.src
              }, '*');
            }
          }, 2000);
        })();
      </script>
    `;
    
    // Insertar antes del </head>
    if (html.includes('</head>')) {
      html = html.replace('</head>', injectedScript + '</head>');
    } else {
      html = injectedScript + html;
    }
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
    
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
};
