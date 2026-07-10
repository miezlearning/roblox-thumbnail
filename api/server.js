const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, userId, username, type, size, groupIds, universeIds, universeId, keyword, assetIds, assetId } = req.query;

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
      case 'presence': {
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId parameter' });
        }
        url = 'https://presence.roblox.com/v1/presence/users';
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: [parseInt(userId, 10)] })
        };
        break;
      }
      case 'friends-count': {
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId parameter' });
        }
        url = `https://friends.roblox.com/v1/users/${userId}/friends/count`;
        break;
      }
      case 'followers-count': {
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId parameter' });
        }
        url = `https://friends.roblox.com/v1/users/${userId}/followers/count`;
        break;
      }
      case 'followings-count': {
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId parameter' });
        }
        url = `https://friends.roblox.com/v1/users/${userId}/followings/count`;
        break;
      }
      case 'friends-list': {
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId parameter' });
        }
        try {
          const resp = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`);
          const friendsData = await resp.json();
          if (friendsData && friendsData.data && friendsData.data.length > 0) {
            const slice = friendsData.data.slice(0, 10);
            const userIds = slice.map(f => f.id);
            
            const resolvedResp = await fetch('https://users.roblox.com/v1/users', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userIds, excludeBannedUsers: false })
            });
            const resolved = await resolvedResp.json();
            
            const userMap = {};
            if (resolved && resolved.data) {
              resolved.data.forEach(u => {
                userMap[u.id] = { name: u.name, displayName: u.displayName };
              });
            }
            
            slice.forEach(f => {
              if (userMap[f.id]) {
                f.name = userMap[f.id].name;
                f.displayName = userMap[f.id].displayName;
              }
            });
            
            return res.json({ data: slice });
          } else {
            return res.json({ data: [] });
          }
        } catch (err) {
          console.error('[FRIENDS PIPELINE ERROR]', err);
          return res.status(500).json({ error: 'Friends pipeline error', message: err.message });
        }
      }
      case 'groups': {
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId parameter' });
        }
        url = `https://groups.roblox.com/v1/users/${userId}/groups/roles`;
        break;
      }
      case 'group-icons': {
        if (!groupIds) {
          return res.status(400).json({ error: 'Missing groupIds parameter' });
        }
        url = `https://thumbnails.roblox.com/v1/groups/icons?groupIds=${groupIds}&size=150x150&format=Png&isCircular=false`;
        break;
      }
      case 'history': {
        if (!userId) {
          return res.status(400).json({ error: 'Missing userId parameter' });
        }
        url = `https://users.roblox.com/v1/users/${userId}/username-history?limit=10&sortOrder=Desc`;
        break;
      }
      case 'user-games': {
        if (!userId) return res.status(400).json({ error: 'Missing userId parameter' });
        url = `https://games.roblox.com/v2/users/${userId}/games?limit=25&sortOrder=Desc`;
        break;
      }
      case 'game-details': {
        if (!universeIds) return res.status(400).json({ error: 'Missing universeIds parameter' });
        url = `https://games.roblox.com/v1/games?universeIds=${universeIds}`;
        break;
      }
      case 'game-votes': {
        if (!universeIds) return res.status(400).json({ error: 'Missing universeIds parameter' });
        url = `https://games.roblox.com/v1/games/votes?universeIds=${universeIds}`;
        break;
      }
      case 'game-favorites': {
        if (!universeId) return res.status(400).json({ error: 'Missing universeId parameter' });
        url = `https://games.roblox.com/v1/games/${universeId}/favorites/count`;
        break;
      }
      case 'game-icons': {
        if (!universeIds) return res.status(400).json({ error: 'Missing universeIds parameter' });
        url = `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeIds}&size=512x512&format=Png&isCircular=false`;
        break;
      }
      case 'game-media': {
        if (!universeIds) return res.status(400).json({ error: 'Missing universeIds parameter' });
        url = `https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${universeIds}&countPerUniverse=5&defaults=true&size=768x432&format=Png&isCircular=false`;
        break;
      }
      case 'roblox-badges': {
        if (!userId) return res.status(400).json({ error: 'Missing userId parameter' });
        url = `https://accountinformation.roblox.com/v1/users/${userId}/roblox-badges`;
        break;
      }
      case 'user-search': {
        if (!keyword) return res.status(400).json({ error: 'Missing keyword parameter' });
        url = `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(keyword)}&limit=10`;
        break;
      }
      case 'asset-thumbnail': {
        if (!assetIds) return res.status(400).json({ error: 'Missing assetIds parameter' });
        url = `https://thumbnails.roblox.com/v1/assets?assetIds=${assetIds}&size=420x420&format=Png&isCircular=false`;
        break;
      }
      case 'resale-data': {
        if (!assetId) return res.status(400).json({ error: 'Missing assetId parameter' });
        url = `https://economy.roblox.com/v1/assets/${assetId}/resale-data`;
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