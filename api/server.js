const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, userId, username, type, size } = req.query;

  if (!action) {
    return res.status(400).json({ error: 'Missing action parameter' });
  }

  try {
    let url;
    let options = { method: 'GET' };
    let data;

    switch (action) {
      // ─── API 1: Resolve Username → User ID ───
      case 'resolve': {
        if (!username) {
          return res.status(400).json({ error: 'Missing username parameter' });
        }
        url = 'https://users.roblox.com/v1/usernames/users';
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            usernames: [username],
            excludeBannedUsers: false
          })
        };
        break;
      }

      // ─── API 2: Get User Profile Info ───
      case 'profile': {
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId parameter' });
        }
        url = `https://users.roblox.com/v1/users/${userId}`;
        break;
      }

      // ─── API 3/4/5: Get Thumbnails (headshot, bust, avatar) ───
      case 'thumbnail': {
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId parameter' });
        }
        const thumbType = type || 'headshot';
        const thumbSize = size || '420x420';

        const endpointMap = {
          headshot: 'avatar-headshot',
          bust: 'avatar-bust',
          avatar: 'avatar'
        };

        const endpoint = endpointMap[thumbType] || 'avatar-headshot';
        url = `https://thumbnails.roblox.com/v1/users/${endpoint}?userIds=${userId}&size=${thumbSize}&format=Png&isCircular=false`;
        break;
      }

      // ─── API 6: Get 3D Avatar Data ───
      case 'avatar3d': {
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId parameter' });
        }
        url = `https://thumbnails.roblox.com/v1/users/avatar-3d?userId=${userId}`;
        break;
      }

      // ─── API 7: Get Currently Wearing Items ───
      case 'wearing': {
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId parameter' });
        }
        url = `https://avatar.roblox.com/v1/users/${userId}/currently-wearing`;
        break;
      }

      // ─── API 8: Get Full Avatar Details ───
      case 'avatar-details': {
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId parameter' });
        }
        url = `https://avatar.roblox.com/v2/avatar/users/${userId}/avatar`;
        break;
      }

      // ─── Batch Thumbnails (all 3 types at once) ───
      case 'all-thumbnails': {
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId parameter' });
        }
        const thumbSize2 = size || '420x420';
        const types = ['avatar-headshot', 'avatar-bust', 'avatar'];
        
        const results = await Promise.all(
          types.map(async (ep) => {
            const thumbUrl = `https://thumbnails.roblox.com/v1/users/${ep}?userIds=${userId}&size=${thumbSize2}&format=Png&isCircular=false`;
            const resp = await fetch(thumbUrl);
            const json = await resp.json();
            return {
              type: ep,
              data: json.data && json.data[0] ? json.data[0] : null
            };
          })
        );

        return res.json({ thumbnails: results });
      }

      // ─── Fetch Everything (profile + thumbnails + avatar details) ───
      case 'full': {
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId parameter' });
        }
        const fullSize = size || '420x420';

        const [profileRes, headshotRes, bustRes, avatarRes, wearingRes, detailsRes] = await Promise.all([
          fetch(`https://users.roblox.com/v1/users/${userId}`),
          fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=${fullSize}&format=Png&isCircular=false`),
          fetch(`https://thumbnails.roblox.com/v1/users/avatar-bust?userIds=${userId}&size=${fullSize}&format=Png&isCircular=false`),
          fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=${fullSize}&format=Png&isCircular=false`),
          fetch(`https://avatar.roblox.com/v1/users/${userId}/currently-wearing`),
          fetch(`https://avatar.roblox.com/v2/avatar/users/${userId}/avatar`)
        ]);

        const [profile, headshot, bust, avatar, wearing, details] = await Promise.all([
          profileRes.json(),
          headshotRes.json(),
          bustRes.json(),
          avatarRes.json(),
          wearingRes.json(),
          detailsRes.json()
        ]);

        return res.json({
          profile,
          thumbnails: {
            headshot: headshot.data && headshot.data[0] ? headshot.data[0] : null,
            bust: bust.data && bust.data[0] ? bust.data[0] : null,
            avatar: avatar.data && avatar.data[0] ? avatar.data[0] : null
          },
          wearing,
          avatarDetails: details
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    // Execute single API call
    const response = await fetch(url, options);
    data = await response.json();
    res.json(data);

  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
};