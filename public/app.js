/* ═══════════════════════════════════════════
   ROBLOX AVATAR EXPLORER — App Logic
   Multi-API Integration (8 Roblox APIs)
   ═══════════════════════════════════════════ */

// ─── Configuration ───
const CONFIG = {
  // Dynamically detect local vs production vercel proxy base URL
  PROXY_BASE: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : window.location.origin + '/api',
  USE_PROXY: true,
  ROBLOX_APIS: {
    users: 'https://users.roblox.com',
    thumbnails: 'https://thumbnails.roblox.com',
    avatar: 'https://avatar.roblox.com'
  }
};

// ─── State ───
let currentUserId = null;
let currentUsername = null;
let apiCallLog = [];

// ─── DOM Elements ───
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const sizeSelect = document.getElementById('sizeSelect');
const inputBadge = document.getElementById('inputBadge');
const badgeText = document.getElementById('badgeText');
const loadingState = document.getElementById('loadingState');
const loadingText = document.getElementById('loadingText');
const errorState = document.getElementById('errorState');
const errorMessage = document.getElementById('errorMessage');
const resultsSection = document.getElementById('resultsSection');

// ─── Initialize ───
document.addEventListener('DOMContentLoaded', () => {
  // Detect input type on typing
  searchInput.addEventListener('input', detectInputType);

  // Search on Enter
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') performSearch();
  });

  // Search button
  searchBtn.addEventListener('click', performSearch);

  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFullscreen();
  });
});

// ─── Detect Username vs ID ───
function detectInputType() {
  const value = searchInput.value.trim();
  const isNumeric = /^\d+$/.test(value);

  if (isNumeric && value.length > 0) {
    inputBadge.classList.add('is-id');
    badgeText.textContent = 'USER ID';
  } else {
    inputBadge.classList.remove('is-id');
    badgeText.textContent = 'USERNAME';
  }
}

// ─── Main Search Flow ───
async function performSearch() {
  const input = searchInput.value.trim();
  if (!input) {
    showError('Please enter a username or User ID');
    return;
  }

  // Reset
  apiCallLog = [];
  hideError();
  hideResults();
  showLoading('Searching...');
  searchBtn.disabled = true;

  try {
    const isNumeric = /^\d+$/.test(input);
    let userId;

    if (isNumeric) {
      // ─── Direct ID input ───
      userId = input;
      setLoadingText('Using User ID directly...');
    } else {
      // ─── API 1: Resolve Username → ID (via proxy) ───
      setLoadingText('Resolving username...');
      const resolveData = await proxyCall('resolve', { username: input });

      if (!resolveData.data || resolveData.data.length === 0) {
        throw new Error(`User "${input}" not found. Please check the username.`);
      }

      userId = resolveData.data[0].id;
      currentUsername = resolveData.data[0].name;
    }

    currentUserId = userId;

    // ─── Fetch All Data in Parallel (via proxy) ───
    setLoadingText('Fetching profile & avatars...');
    const size = sizeSelect.value;

    const [profile, headshot, bust, avatar, wearing, details] = await Promise.all([
      // API 2: User Profile
      proxyCall('profile', { userId }),
      // API 3: Headshot Thumbnail
      proxyCall('thumbnail', { userId, type: 'headshot', size }),
      // API 4: Bust Thumbnail
      proxyCall('thumbnail', { userId, type: 'bust', size }),
      // API 5: Full Body Thumbnail
      proxyCall('thumbnail', { userId, type: 'avatar', size }),
      // API 7: Currently Wearing
      proxyCall('wearing', { userId }),
      // API 8: Avatar Details
      proxyCall('avatar-details', { userId })
    ]);

    // ─── Also try 3D data (API 6) ───
    let avatar3d = null;
    try {
      avatar3d = await proxyCall('avatar3d', { userId });
    } catch (e) {
      console.warn('3D avatar data not available:', e);
    }

    // ─── Render Everything ───
    hideLoading();
    renderProfile(profile);
    renderThumbnails(headshot, bust, avatar);
    renderWearing(wearing, details);
    renderAvatarDetails(details, avatar3d);
    renderApiLog();
    showResults();

  } catch (err) {
    hideLoading();
    showError(err.message || 'Something went wrong. Please try again.');
    console.error('Search error:', err);
  } finally {
    searchBtn.disabled = false;
  }
}

// ─── API Call Helper ───
async function apiCall(method, url, body = null) {
  const startTime = performance.now();
  const logEntry = {
    method,
    url,
    status: 'pending',
    time: 0
  };

  try {
    const options = {
      method,
      headers: {}
    };

    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const elapsed = Math.round(performance.now() - startTime);

    logEntry.status = response.ok ? 'ok' : 'error';
    logEntry.statusCode = response.status;
    logEntry.time = elapsed;
    apiCallLog.push(logEntry);

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    const elapsed = Math.round(performance.now() - startTime);
    logEntry.status = 'error';
    logEntry.time = elapsed;
    logEntry.error = err.message;
    apiCallLog.push(logEntry);
    throw err;
  }
}

// ─── Proxy Call Helper ───
// Routes through local proxy (localhost:3001) or Vercel proxy to avoid CORS
async function proxyCall(action, params = {}) {
  const queryParts = [`action=${action}`];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  const proxyUrl = `${CONFIG.PROXY_BASE}?${queryParts.join('&')}`;

  // Map action to the actual Roblox endpoint for the log display
  const robloxEndpointMap = {
    resolve: 'POST users.roblox.com/v1/usernames/users',
    profile: `GET users.roblox.com/v1/users/${params.userId}`,
    thumbnail: `GET thumbnails.roblox.com/v1/users/avatar-${params.type || 'headshot'}`,
    avatar3d: `GET thumbnails.roblox.com/v1/users/avatar-3d`,
    wearing: `GET avatar.roblox.com/v1/users/${params.userId}/currently-wearing`,
    'avatar-details': `GET avatar.roblox.com/v2/avatar/users/${params.userId}/avatar`
  };

  const startTime = performance.now();
  const logEntry = {
    method: action === 'resolve' ? 'POST' : 'GET',
    url: robloxEndpointMap[action] || proxyUrl,
    status: 'pending',
    time: 0
  };

  try {
    const response = await fetch(proxyUrl);
    const elapsed = Math.round(performance.now() - startTime);

    logEntry.status = response.ok ? 'ok' : 'error';
    logEntry.statusCode = response.status;
    logEntry.time = elapsed;
    apiCallLog.push(logEntry);

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    const elapsed = Math.round(performance.now() - startTime);
    logEntry.status = 'error';
    logEntry.time = elapsed;
    logEntry.error = err.message;
    apiCallLog.push(logEntry);
    throw err;
  }
}

// ─── Render Profile ───
function renderProfile(profile) {
  if (!profile || profile.errors) return;

  // Set headshot as profile avatar
  document.getElementById('profileAvatar').src =
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${profile.id}&size=150x150&format=Png&isCircular=true`;
  // Use a proper image - we'll load it via a fetch
  loadProfileAvatar(profile.id);

  document.getElementById('displayName').textContent = profile.displayName || profile.name;
  document.getElementById('userName').textContent = `@${profile.name}`;
  document.getElementById('userDescription').textContent = profile.description || 'No description';
  document.getElementById('userIdDisplay').textContent = profile.id;

  // Format date
  if (profile.created) {
    const date = new Date(profile.created);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('userCreated').textContent = date.toLocaleDateString('en-US', options);
  }

  // Banned badge
  const bannedBadge = document.getElementById('bannedBadge');
  if (profile.isBanned) {
    bannedBadge.style.display = 'flex';
  } else {
    bannedBadge.style.display = 'none';
  }
}

// Load profile avatar image via proxy
async function loadProfileAvatar(userId) {
  try {
    const data = await proxyCall('thumbnail', { userId, type: 'headshot', size: '150x150' });
    if (data.data && data.data[0] && data.data[0].imageUrl) {
      document.getElementById('profileAvatar').src = data.data[0].imageUrl;
    }
  } catch (e) {
    console.warn('Failed to load profile avatar:', e);
  }
}

// ─── Render Thumbnails ───
function renderThumbnails(headshot, bust, avatar) {
  renderSingleThumb('headshot', headshot);
  renderSingleThumb('bust', bust);
  renderSingleThumb('avatar', avatar);
}

function renderSingleThumb(type, data) {
  const img = document.getElementById(`${type}Img`);
  const status = document.getElementById(`${type}Status`);

  if (data && data.data && data.data[0]) {
    const thumbData = data.data[0];
    if (thumbData.imageUrl) {
      img.src = thumbData.imageUrl;
      status.textContent = `State: ${thumbData.state} • ${sizeSelect.value}`;
      status.style.color = thumbData.state === 'Completed' ? 'var(--success)' : 'var(--warning)';
    } else {
      img.src = '';
      status.textContent = `State: ${thumbData.state || 'Pending'} — Image rendering...`;
      status.style.color = 'var(--warning)';
    }
  } else {
    img.src = '';
    status.textContent = 'Not available';
    status.style.color = 'var(--error)';
  }
}

// ─── Render Currently Wearing ───
function renderWearing(data, avatarDetails) {
  const container = document.getElementById('wearingList');

  if (!data || !data.assetIds || data.assetIds.length === 0) {
    container.innerHTML = '<p class="placeholder-text">No items being worn</p>';
    return;
  }

  // Build asset name map from avatar details
  const assetNameMap = {};
  if (avatarDetails && avatarDetails.assets) {
    avatarDetails.assets.forEach(asset => {
      assetNameMap[asset.id] = {
        name: asset.name,
        type: asset.assetType ? asset.assetType.name : 'Unknown'
      };
    });
  }

  container.innerHTML = data.assetIds.map(assetId => {
    const assetInfo = assetNameMap[assetId];
    const displayName = assetInfo ? assetInfo.name : `Asset #${assetId}`;
    const typeBadge = assetInfo ? `<span class="wearing-type">${assetInfo.type}</span>` : '';
    return `
      <div class="wearing-item">
        <img class="wearing-item-icon"
             src=""
             alt="Asset ${assetId}"
             onerror="this.style.display='none'">
        <div class="wearing-item-info">
          <a href="https://www.roblox.com/catalog/${assetId}" target="_blank" rel="noopener">
            ${displayName}
          </a>
          ${typeBadge}
        </div>
      </div>
    `;
  }).join('');

  // Load proper thumbnails for each asset
  loadAssetThumbnails(data.assetIds);
}

async function loadAssetThumbnails(assetIds) {
  try {
    // Batch load asset thumbnails
    const batchSize = 50;
    for (let i = 0; i < assetIds.length; i += batchSize) {
      const batch = assetIds.slice(i, i + batchSize);
      const idsParam = batch.join(',');
      const response = await fetch(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${idsParam}&size=75x75&format=Png&isCircular=false`
      );
      const data = await response.json();

      if (data.data) {
        data.data.forEach(item => {
          if (item.imageUrl) {
            const imgEl = document.querySelector(`.wearing-item-icon[alt="Asset ${item.targetId}"]`);
            if (imgEl) {
              imgEl.src = item.imageUrl;
              imgEl.style.display = 'block';
            }
          }
        });
      }
    }
  } catch (e) {
    console.warn('Failed to load asset thumbnails:', e);
  }
}

// ─── Render Avatar Details ───
function renderAvatarDetails(details, avatar3d) {
  renderBodyColors(details);
  renderScales(details);
  renderAvatarInfo(details, avatar3d);
}

// Roblox BrickColor ID → approximate hex color map (most common ones)
const BRICK_COLOR_MAP = {
  1: '#F2F3F3', 5: '#D7C59A', 9: '#E8BAC8', 11: '#80BBDB',
  18: '#CC8E69', 21: '#C4281C', 23: '#0D69AC', 24: '#F5CD30',
  26: '#1B2A35', 28: '#287F47', 29: '#A1C48C', 36: '#F3CF9B',
  37: '#4B974A', 38: '#A05F34', 39: '#C1CADE', 40: '#ECECEC',
  41: '#CD312E', 42: '#5BC4BE', 43: '#00639B', 44: '#F5F1D0',
  45: '#6D81AD', 100: '#EEA4A4', 101: '#DA867A', 102: '#6B5A5A',
  103: '#C6C1C1', 104: '#6B327C', 105: '#E29B40', 106: '#DA8541',
  107: '#008F9C', 108: '#685C42', 110: '#435493', 111: '#BFB7B1',
  112: '#6C81B7', 113: '#E5ADC8', 115: '#C7D23C', 116: '#55A5AF',
  118: '#97CBD9', 119: '#84B68D', 120: '#D9E4A7', 121: '#E7C09D',
  123: '#D6922B', 124: '#958A73', 125: '#94837D', 126: '#A0A5A9',
  127: '#DCBC81', 128: '#AE7A59', 131: '#9CA3A8', 133: '#D5733D',
  134: '#D8C400', 135: '#9EA3B0', 136: '#87818B', 137: '#E4ADC7',
  138: '#BBC4AE', 140: '#27462E', 141: '#3F5437', 143: '#CFE2F7',
  145: '#7988A1', 146: '#7D898F', 147: '#575857', 148: '#505050',
  149: '#3B3B3B', 150: '#585858', 151: '#0F1012', 153: '#6C6E6E',
  154: '#7F2021', 157: '#FFD000', 158: '#F6A500', 168: '#A8967E',
  176: '#897E79', 178: '#B99272', 179: '#635F62', 180: '#D9B384',
  190: '#F2D063', 191: '#E08432', 192: '#6F2D31', 193: '#CF2E31',
  194: '#A3A2A5', 195: '#4C5156', 196: '#697082', 198: '#8E4285',
  199: '#3A2832', 200: '#828A5D', 201: '#84573B', 202: '#B05820',
  203: '#967E76', 204: '#8A9EBC', 205: '#A1A5A2', 206: '#C3BD6F',
  207: '#8E793E', 208: '#CFD5CD', 209: '#B3916E', 210: '#727A6A',
  211: '#6F7B97', 212: '#B5CBDB', 213: '#6F816D', 216: '#83381F',
  217: '#7D695F', 218: '#593939', 219: '#5E2F3D', 220: '#A5D152',
  221: '#E1A3CF', 222: '#EDC8A4', 223: '#DAB000', 224: '#F0E890',
  225: '#F4A550', 226: '#F9E999', 232: '#7DBBD2', 268: '#342B75',
  301: '#506D54', 302: '#5F7954', 303: '#65462C', 304: '#82533C',
  305: '#60727C', 306: '#5F6D7B', 307: '#494D52', 308: '#4F4D53',
  309: '#E3DCC7', 310: '#CF9F6D', 311: '#555E68', 312: '#606060',
  313: '#ABB9C6', 314: '#B2CCDB', 315: '#9DC4D9', 316: '#B28A70',
  317: '#93896B', 318: '#86895C', 319: '#A4BD47', 320: '#D8DD56',
  321: '#C4A06B', 322: '#C7AC78', 323: '#E6D2A7', 324: '#C6C8A7',
  325: '#B8C4BC', 326: '#C7BCA1', 327: '#9B9A8A', 328: '#A39D8A',
  329: '#C4C3D0', 330: '#C6C7CF', 331: '#E7DFCA', 332: '#F7F3DE',
  333: '#E0D1B7', 334: '#F0E6B9', 335: '#E0D1AF', 336: '#EEE1C1',
  337: '#E5DDC0', 338: '#E6E1C8', 339: '#D1C2A3', 340: '#D8B88D',
  341: '#CAA76A', 342: '#DFC59A', 343: '#E3C68C', 344: '#E6D0AB',
  345: '#E8D4B0', 346: '#D6BF91', 347: '#CFA467', 348: '#BD9667',
  349: '#CC9E6B', 350: '#D3A46A', 351: '#D6A465', 352: '#CB8444',
  353: '#C37230', 354: '#BC6D34', 355: '#D09B5F', 356: '#F0D77A',
  357: '#E7CA65', 358: '#E2BD60', 359: '#ECC87E', 360: '#E2C560',
  361: '#CCB64F', 362: '#CFB252', 363: '#D5C15B',
  1001: '#F8F8F8', 1002: '#CDCDCD', 1003: '#111111',
  1004: '#FF0000', 1005: '#FFB000', 1006: '#B480FF',
  1007: '#A34B4B', 1008: '#C1BE42', 1009: '#FFFF00',
  1010: '#0000FF', 1011: '#002060', 1012: '#2154B9',
  1013: '#04AFEC', 1014: '#AA5500', 1015: '#AA00AA',
  1016: '#FF66CC', 1017: '#FFAF00', 1018: '#12EED4',
  1019: '#00FFFF', 1020: '#FF0000', 1021: '#FF6600',
  1022: '#B1A7FF', 1023: '#00B8FF', 1024: '#00FFB0',
  1025: '#FFFF9E', 1026: '#CF9CFF', 1027: '#E1A479',
  1028: '#CC8833', 1029: '#FFBB55', 1030: '#AABB22',
  1031: '#EEDD55', 1032: '#77DDEE',
};

function getBrickColor(colorId) {
  return BRICK_COLOR_MAP[colorId] || '#888888';
}

function renderBodyColors(details) {
  const container = document.getElementById('bodyColors');

  // v2 API returns bodyColor3s (hex strings) not bodyColors (BrickColor IDs)
  const colors3 = details ? details.bodyColor3s : null;
  const colorsLegacy = details ? details.bodyColors : null;

  if (!colors3 && !colorsLegacy) {
    container.innerHTML = '<p class="placeholder-text">Body colors not available</p>';
    return;
  }

  let colorParts;

  if (colors3) {
    // v2 API: hex color strings (e.g., "A3A2A5")
    colorParts = [
      { label: 'Head', hex: `#${colors3.headColor3}` },
      { label: 'Torso', hex: `#${colors3.torsoColor3}` },
      { label: 'Left Arm', hex: `#${colors3.leftArmColor3}` },
      { label: 'Right Arm', hex: `#${colors3.rightArmColor3}` },
      { label: 'Left Leg', hex: `#${colors3.leftLegColor3}` },
      { label: 'Right Leg', hex: `#${colors3.rightLegColor3}` }
    ];
  } else {
    // Fallback: BrickColor IDs
    colorParts = [
      { label: 'Head', hex: getBrickColor(colorsLegacy.headColorId) },
      { label: 'Torso', hex: getBrickColor(colorsLegacy.torsoColorId) },
      { label: 'Left Arm', hex: getBrickColor(colorsLegacy.leftArmColorId) },
      { label: 'Right Arm', hex: getBrickColor(colorsLegacy.rightArmColorId) },
      { label: 'Left Leg', hex: getBrickColor(colorsLegacy.leftLegColorId) },
      { label: 'Right Leg', hex: getBrickColor(colorsLegacy.rightLegColorId) }
    ];
  }

  container.innerHTML = colorParts.map(part => `
    <div class="color-item">
      <div class="color-swatch" style="background: ${part.hex}" title="${part.hex}"></div>
      <span class="color-label">${part.label}</span>
      <span class="color-hex">${part.hex}</span>
    </div>
  `).join('');
}

function renderScales(details) {
  const container = document.getElementById('avatarScales');

  if (!details || !details.scales) {
    container.innerHTML = '<p class="placeholder-text">Scale data not available</p>';
    return;
  }

  const scales = details.scales;
  const scaleItems = [
    { label: 'Height', value: scales.height, max: 1.05 },
    { label: 'Width', value: scales.width, max: 1.0 },
    { label: 'Head', value: scales.head, max: 1.0 },
    { label: 'Depth', value: scales.depth, max: 1.0 },
    { label: 'Proportion', value: scales.proportion, max: 1.0 },
    { label: 'Body Type', value: scales.bodyType, max: 1.0 }
  ];

  container.innerHTML = scaleItems
    .filter(item => item.value !== undefined)
    .map(item => {
      const percentage = Math.min((item.value / item.max) * 100, 100);
      return `
        <div class="scale-item">
          <span class="scale-label">${item.label}</span>
          <div class="scale-bar-wrapper">
            <div class="scale-bar" style="width: ${percentage}%"></div>
          </div>
          <span class="scale-value">${item.value.toFixed(2)}</span>
        </div>
      `;
    }).join('');
}

function renderAvatarInfo(details, avatar3d) {
  const container = document.getElementById('avatarInfo');

  if (!details) {
    container.innerHTML = '<p class="placeholder-text">Avatar info not available</p>';
    return;
  }

  let html = '';

  // Player Avatar Type
  if (details.playerAvatarType) {
    const isR15 = details.playerAvatarType === 'R15';
    html += `
      <div class="info-row">
        <span class="info-label">Avatar Type</span>
        <span class="type-badge ${isR15 ? 'r15' : 'r6'}">${details.playerAvatarType}</span>
      </div>
    `;
  }

  // Default Shirt/Pants Type
  if (details.defaultShirtApplied !== undefined) {
    html += `
      <div class="info-row">
        <span class="info-label">Default Shirt</span>
        <span class="info-value">${details.defaultShirtApplied ? 'Yes' : 'No'}</span>
      </div>
    `;
  }

  if (details.defaultPantsApplied !== undefined) {
    html += `
      <div class="info-row">
        <span class="info-label">Default Pants</span>
        <span class="info-value">${details.defaultPantsApplied ? 'Yes' : 'No'}</span>
      </div>
    `;
  }

  // Number of assets
  if (details.assets) {
    html += `
      <div class="info-row">
        <span class="info-label">Total Assets</span>
        <span class="info-value">${details.assets.length}</span>
      </div>
    `;
  }

  // 3D Data available
  html += `
    <div class="info-row">
      <span class="info-label">3D Data</span>
      <span class="info-value">${avatar3d && avatar3d.imageUrl ? '✅ Available' : '❌ Not available'}</span>
    </div>
  `;

  container.innerHTML = html || '<p class="placeholder-text">No avatar info available</p>';
}

// ─── Render API Log ───
function renderApiLog() {
  const container = document.getElementById('apiLog');
  const countBadge = document.getElementById('apiCount');

  countBadge.textContent = apiCallLog.length;

  container.innerHTML = apiCallLog.map(entry => {
    const statusClass = entry.status === 'ok' ? 'ok' : 'err';
    const statusText = entry.statusCode || (entry.status === 'ok' ? '200' : 'ERR');

    // Truncate URL for display
    let displayUrl = entry.url;
    try {
      const urlObj = new URL(entry.url);
      displayUrl = `${urlObj.hostname}${urlObj.pathname}${urlObj.search ? '?' + urlObj.search.substring(1, 60) + '...' : ''}`;
    } catch (e) {
      displayUrl = entry.url;
    }

    return `
      <div class="api-log-entry">
        <span class="api-method ${entry.method.toLowerCase()}">${entry.method}</span>
        <span class="api-url" title="${entry.url}">${displayUrl}</span>
        <span class="api-status ${statusClass}">${statusText}</span>
        <span class="api-time">${entry.time}ms</span>
      </div>
    `;
  }).join('');
}

// ─── Download Image ───
async function downloadImage(imgId, typeName) {
  const img = document.getElementById(imgId);
  if (!img || !img.src || img.src === window.location.href) {
    showError('No image to download');
    return;
  }

  try {
    const response = await fetch(img.src);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roblox_${typeName}_${currentUserId || 'avatar'}_${sizeSelect.value}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    // Fallback: open in new tab
    window.open(img.src, '_blank');
  }
}

// ─── Fullscreen Modal ───
function openFullscreen(imgId) {
  const img = document.getElementById(imgId);
  if (!img || !img.src) return;

  const modal = document.getElementById('fullscreenModal');
  const fullImg = document.getElementById('fullscreenImage');
  const downloadBtn = document.getElementById('modalDownloadBtn');

  fullImg.src = img.src;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Set download button
  downloadBtn.onclick = () => downloadImage(imgId, imgId.replace('Img', ''));
}

function closeFullscreen() {
  const modal = document.getElementById('fullscreenModal');
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

// ─── UI Helpers ───
function showLoading(text) {
  loadingState.classList.remove('hidden');
  loadingText.textContent = text;
}

function setLoadingText(text) {
  loadingText.textContent = text;
}

function hideLoading() {
  loadingState.classList.add('hidden');
}

function showError(msg) {
  errorState.classList.remove('hidden');
  errorMessage.textContent = msg;
}

function hideError() {
  errorState.classList.add('hidden');
}

function showResults() {
  resultsSection.classList.remove('hidden');
}

function hideResults() {
  resultsSection.classList.add('hidden');
}
