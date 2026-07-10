const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3001;

function proxyRequest(targetUrl, method, body, res) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'RobloxAvatarExplorer/2.0'
      }
    };

    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', (chunk) => { data += chunk; });
      proxyRes.on('end', () => {
        resolve({ statusCode: proxyRes.statusCode, data });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);
  const { action, userId, username, type, size } = parsed.query;

  if (!action) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing action parameter' }));
    return;
  }

  try {
    let targetUrl;
    let method = 'GET';
    let body = null;

    switch (action) {
      case 'resolve': {
        targetUrl = 'https://users.roblox.com/v1/usernames/users';
        method = 'POST';
        body = JSON.stringify({ usernames: [username], excludeBannedUsers: false });
        break;
      }
      case 'profile': {
        targetUrl = `https://users.roblox.com/v1/users/${userId}`;
        break;
      }
      case 'thumbnail': {
        const thumbType = type || 'headshot';
        const thumbSize = size || '420x420';
        const endpointMap = { headshot: 'avatar-headshot', bust: 'avatar-bust', avatar: 'avatar' };
        const endpoint = endpointMap[thumbType] || 'avatar-headshot';
        targetUrl = `https://thumbnails.roblox.com/v1/users/${endpoint}?userIds=${userId}&size=${thumbSize}&format=Png&isCircular=false`;
        break;
      }
      case 'avatar3d': {
        targetUrl = `https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`;
        break;
      }
      case 'wearing': {
        targetUrl = `https://avatar.roblox.com/v1/users/${userId}/currently-wearing`;
        break;
      }
      case 'avatar-details': {
        targetUrl = `https://avatar.roblox.com/v2/avatar/users/${userId}/avatar`;
        break;
      }
      default: {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown action: ${action}` }));
        return;
      }
    }

    console.log(`[PROXY] ${method} ${targetUrl}`);
    const result = await proxyRequest(targetUrl, method, body, res);

    res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
    res.end(result.data);

  } catch (err) {
    console.error('[PROXY ERROR]', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Roblox API Proxy running at http://localhost:${PORT}`);
  console.log(`\nSupported actions:`);
  console.log(`  ?action=resolve&username=Roblox`);
  console.log(`  ?action=profile&userId=1`);
  console.log(`  ?action=thumbnail&userId=1&type=headshot&size=420x420`);
  console.log(`  ?action=avatar3d&userId=1`);
  console.log(`  ?action=wearing&userId=1`);
  console.log(`  ?action=avatar-details&userId=1`);
  console.log(`\nReady to accept requests!\n`);
});
