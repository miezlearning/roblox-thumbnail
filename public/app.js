/* ═══════════════════════════════════════════
   ROVIEW — Multi-API Roblox Explorer
   Tabbed Architecture · 23+ API Endpoints
   ═══════════════════════════════════════════ */

// ─── Configuration ───
const CONFIG = {
  PROXY_BASE: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : window.location.origin + '/api',
  USE_PROXY: true,
};

// ─── State ───
let currentUserId = null;
let currentUsername = null;
let apiCallLog = [];
let activePolls = {};
let tabDataLoaded = { overview: false, social: false, games: false, badges: false, details: false };

function clearAllPolls() {
  Object.keys(activePolls).forEach(type => {
    if (activePolls[type]) { clearTimeout(activePolls[type]); activePolls[type] = null; }
  });
}

// ─── DOM ───
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

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  searchInput.addEventListener('input', detectInputType);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') performSearch(); });
  searchBtn.addEventListener('click', performSearch);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFullscreen(); });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });
});

function detectInputType() {
  const val = searchInput.value.trim();
  if (/^\d+$/.test(val) && val.length > 0) {
    inputBadge.classList.add('is-id'); badgeText.textContent = 'USER ID';
  } else {
    inputBadge.classList.remove('is-id'); badgeText.textContent = 'USERNAME';
  }
}

// ─── Tab System ───
function showTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
  
  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  const section = document.getElementById(`tab-${tabName}`);
  if (btn) btn.classList.add('active');
  if (section) section.classList.add('active');

  // Lazy load tab data
  if (!tabDataLoaded[tabName] && currentUserId) {
    if (tabName === 'games') loadGamesTab();
    if (tabName === 'badges') loadBadgesTab();
    if (tabName === 'social') loadSocialTab();
  }
}

// ─── Main Search ───
async function performSearch() {
  const input = searchInput.value.trim();
  if (!input) return;

  clearAllPolls();
  hideError();
  hideResults();
  showLoading('Searching...');
  searchBtn.disabled = true;
  apiCallLog = [];
  tabDataLoaded = { overview: false, social: false, games: false, badges: false, details: false };

  try {
    let userId;
    if (/^\d+$/.test(input)) {
      userId = parseInt(input, 10);
    } else {
      setLoadingText('Resolving username...');
      const resolveData = await proxyCall('resolve', { username: input });
      if (!resolveData.data || resolveData.data.length === 0) {
        throw new Error(`User "${input}" not found.`);
      }
      userId = resolveData.data[0].id;
      currentUsername = resolveData.data[0].name;
    }
    currentUserId = userId;

    setLoadingText('Fetching profile & avatars...');
    const size = sizeSelect.value;

    const safe = async (action, params) => {
      try { return await proxyCall(action, params); }
      catch (e) { console.warn(`Safe call ${action} failed:`, e); return null; }
    };

    const [profile, headshot, bust, avatar, wearing, details, presence, fCount, folCount, folingCount, history] =
      await Promise.all([
        proxyCall('profile', { userId }),
        proxyCall('thumbnail', { userId, type: 'headshot', size }),
        proxyCall('thumbnail', { userId, type: 'bust', size }),
        proxyCall('thumbnail', { userId, type: 'avatar', size }),
        safe('wearing', { userId }),
        safe('avatar-details', { userId }),
        safe('presence', { userId }),
        safe('friends-count', { userId }),
        safe('followers-count', { userId }),
        safe('followings-count', { userId }),
        safe('history', { userId }),
      ]);

    let avatar3d = null;
    try { avatar3d = await proxyCall('avatar3d', { userId }); } catch (e) {}

    hideLoading();
    renderProfile(profile);
    renderThumbnails(headshot, bust, avatar);
    renderWearing(wearing, details);
    renderAvatarDetails(details, avatar3d);
    renderPresenceAndStats(presence, fCount, folCount, folingCount);
    renderUsernameHistory(history);
    renderApiLog();
    tabDataLoaded.overview = true;
    tabDataLoaded.details = true;

    showResults();
    showTab('overview');

    // Pre-load social tab in background
    loadSocialTab();

  } catch (err) {
    hideLoading();
    showError(err.message || 'Something went wrong.');
    console.error('Search error:', err);
  } finally {
    searchBtn.disabled = false;
  }
}

// ─── Lazy Tab Loaders ───
async function loadSocialTab() {
  if (tabDataLoaded.social || !currentUserId) return;
  tabDataLoaded.social = true;
  const safe = async (a, p) => { try { return await proxyCall(a, p); } catch(e) { return null; } };
  const [friendsList, groups] = await Promise.all([
    safe('friends-list', { userId: currentUserId }),
    safe('groups', { userId: currentUserId }),
  ]);
  renderFriendsList(friendsList);
  renderGroups(groups);
}

async function loadGamesTab() {
  if (tabDataLoaded.games || !currentUserId) return;
  tabDataLoaded.games = true;
  const grid = document.getElementById('gamesGrid');
  grid.innerHTML = '<p class="placeholder-text">Loading experiences...</p>';
  try {
    const gamesData = await proxyCall('user-games', { userId: currentUserId });
    if (!gamesData || !gamesData.data || gamesData.data.length === 0) {
      grid.innerHTML = '<p class="placeholder-text">No created experiences found</p>';
      return;
    }
    const games = gamesData.data.slice(0, 12);
    const universeIds = games.map(g => g.id).join(',');

    // Fetch details and icons in parallel
    const safe = async (a, p) => { try { return await proxyCall(a, p); } catch(e) { return null; } };
    const [detailsData, iconsData, votesData] = await Promise.all([
      safe('game-details', { universeIds }),
      safe('game-icons', { universeIds }),
      safe('game-votes', { universeIds }),
    ]);

    const detailsMap = {};
    if (detailsData && detailsData.data) detailsData.data.forEach(d => { detailsMap[d.id] = d; });
    const iconsMap = {};
    if (iconsData && iconsData.data) iconsData.data.forEach(i => { iconsMap[i.targetId] = i.imageUrl; });
    const votesMap = {};
    if (votesData && votesData.data) votesData.data.forEach(v => { votesMap[v.id] = v; });

    grid.innerHTML = games.map(game => {
      const detail = detailsMap[game.id] || {};
      const icon = iconsMap[game.id] || '';
      const votes = votesMap[game.id] || {};
      const playing = detail.playing || 0;
      const visits = detail.visits || 0;
      const name = detail.name || game.name || 'Unnamed';
      const desc = detail.description || '';
      const rootPlaceId = detail.rootPlaceId || (game.rootPlace ? game.rootPlace.id : '');
      const ups = votes.upVotes || 0;
      const downs = votes.downVotes || 0;

      return `
        <div class="game-card" onclick="window.open('https://www.roblox.com/games/${rootPlaceId}','_blank')">
          <img class="game-icon" src="${icon || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='80' height='80' fill='%231f1f1f'/></svg>"}" alt="${name}">
          <div class="game-info">
            <span class="game-name">${escapeHtml(name)}</span>
            <div class="game-stats">
              <span class="game-stat playing">▶ ${fmtNum(playing)} playing</span>
              <span class="game-stat">👁 ${fmtNum(visits)} visits</span>
              <span class="game-stat">👍 ${fmtNum(ups)}</span>
              <span class="game-stat">👎 ${fmtNum(downs)}</span>
            </div>
            <span class="game-description">${escapeHtml(desc.substring(0, 100))}</span>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    console.error('Games tab error:', e);
    grid.innerHTML = '<p class="placeholder-text">Failed to load games</p>';
  }
}

async function loadBadgesTab() {
  if (tabDataLoaded.badges || !currentUserId) return;
  tabDataLoaded.badges = true;
  const grid = document.getElementById('badgesGrid');
  grid.innerHTML = '<p class="placeholder-text">Loading badges...</p>';
  try {
    const badges = await proxyCall('roblox-badges', { userId: currentUserId });
    if (!badges || !Array.isArray(badges) || badges.length === 0) {
      grid.innerHTML = '<p class="placeholder-text">No Roblox platform badges earned</p>';
      return;
    }

    // Map badge IDs to icon URLs
    const badgeIcons = {
      1: 'https://images.rbxcdn.com/5eb3f21b804c8c290ff44b5d5b3e9e53.png',   // Admin
      2: 'https://images.rbxcdn.com/17c8873550a84ffb0a4e4341c9b5f6e1.png',   // Ambassador
      3: 'https://images.rbxcdn.com/f72d07e5f33e22a00c45ef3f329a8e7d.png',   // Combat Initiation
      4: 'https://images.rbxcdn.com/be4c53b88fda3d02b7d2ee50c0258c26.png',   // Warrior
      5: 'https://images.rbxcdn.com/f5a7c099d5e49bc07f5b95ed49eb2f27.png',   // Inviter
      6: 'https://images.rbxcdn.com/04867003b08abe5aa93c3ed64b6b2eb2.png',   // Friendship
      7: 'https://images.rbxcdn.com/6dd3a2f4d0cd1e5bdd5a0de1b3af8f8c.png',   // Bloxxer
      8: 'https://images.rbxcdn.com/ee7d92cd54ea39e5cd37dcc49fdbb533.png',   // Bricksmith
      9: 'https://images.rbxcdn.com/ffea8e0c54a244c92c86d72e49cbb9d5.png',   // Builders Club (BC)
      10: 'https://images.rbxcdn.com/3ee05fb0875e4fc228432e28413cde97.png',  // Turbo BC
      11: 'https://images.rbxcdn.com/1fb3c5e69c6c3ee7d0aa5ae9d77ec5c3.png',  // Outrageous BC
      12: 'https://images.rbxcdn.com/23e6c1b8a49759ee29a68cf73f7ed1b1.png',  // Homestead
      14: 'https://images.rbxcdn.com/e8ede7f3af7a7c2ea11c94b65b9ef8c9.png',  // Official Model Maker
      15: 'https://images.rbxcdn.com/18d52cf1b6e0d6bb40c6e00d5c6c4e34.png',  // Welcome To The Club
      17: 'https://images.rbxcdn.com/82aee1e7ca3b78be6dcb2b3d0aafbced.png',  // Veteran
      18: 'https://images.rbxcdn.com/58b51f62e27e8cbbca3c90f2ec41a6a6.png',  // Premium
    };

    grid.innerHTML = badges.map(badge => {
      const iconUrl = badgeIcons[badge.id] || 'https://images.rbxcdn.com/82aee1e7ca3b78be6dcb2b3d0aafbced.png';
      return `
        <div class="badge-card">
          <img class="badge-icon" src="${iconUrl}" alt="${escapeHtml(badge.name)}">
          <span class="badge-name">${escapeHtml(badge.name)}</span>
          <span class="badge-description">${escapeHtml(badge.description || '')}</span>
        </div>`;
    }).join('');
  } catch (e) {
    console.error('Badges tab error:', e);
    grid.innerHTML = '<p class="placeholder-text">Failed to load badges</p>';
  }
}

// ─── API Call Helpers ───
async function apiCall(method, url, body = null) {
  const startTime = performance.now();
  const logEntry = { method, url, status: 'pending', time: 0 };
  try {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(url, options);
    const elapsed = Math.round(performance.now() - startTime);
    logEntry.status = response.status;
    logEntry.time = elapsed;
    apiCallLog.push(logEntry);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    const elapsed = Math.round(performance.now() - startTime);
    logEntry.status = 'error'; logEntry.time = elapsed; logEntry.error = err.message;
    apiCallLog.push(logEntry);
    throw err;
  }
}

async function proxyCall(action, params = {}) {
  const queryParams = new URLSearchParams({ action, ...params });
  return await apiCall('GET', `${CONFIG.PROXY_BASE}?${queryParams}`);
}

// ─── Render Profile ───
function renderProfile(profile) {
  if (!profile || profile.errors) return;
  loadProfileAvatar(profile.id);
  document.getElementById('displayName').textContent = profile.displayName || profile.name;
  document.getElementById('userName').textContent = `@${profile.name}`;
  document.getElementById('userDescription').textContent = profile.description || 'No description';
  document.getElementById('userIdDisplay').textContent = profile.id;
  if (profile.created) {
    const d = new Date(profile.created);
    document.getElementById('userCreated').textContent = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  document.getElementById('bannedBadge').style.display = profile.isBanned ? 'flex' : 'none';
}

async function loadProfileAvatar(userId) {
  try {
    const data = await proxyCall('thumbnail', { userId, type: 'headshot', size: '150x150' });
    if (data && data.data && data.data[0] && data.data[0].imageUrl) {
      document.getElementById('profileAvatar').src = data.data[0].imageUrl;
    }
  } catch (e) {}
}

// ─── Render Thumbnails ───
function renderThumbnails(headshot, bust, avatar) {
  processThumbnail(headshot, 'headshotImg', 'headshotStatus', 'headshot');
  processThumbnail(bust, 'bustImg', 'bustStatus', 'bust');
  processThumbnail(avatar, 'avatarImg', 'avatarStatus', 'avatar');
}

function processThumbnail(data, imgId, statusId, thumbType) {
  const img = document.getElementById(imgId);
  const status = document.getElementById(statusId);
  if (!data || !data.data || !data.data[0]) {
    status.innerHTML = '<span style="color:var(--error)">No data</span>';
    return;
  }
  const item = data.data[0];
  if (item.state === 'Completed' && item.imageUrl) {
    img.src = item.imageUrl;
    status.innerHTML = `<span style="color:var(--accent)">✓ Completed</span>`;
  } else if (item.state === 'Pending') {
    status.innerHTML = `<span style="color:var(--warning)">⏳ Rendering...</span>`;
    pollThumbnail(thumbType, imgId, statusId);
  } else {
    status.innerHTML = `<span style="color:var(--error)">State: ${item.state}</span>`;
  }
}

function pollThumbnail(thumbType, imgId, statusId, attempt = 0) {
  if (attempt >= 10) {
    document.getElementById(statusId).innerHTML = '<span style="color:var(--error)">Timeout</span>';
    return;
  }
  activePolls[thumbType] = setTimeout(async () => {
    try {
      const data = await proxyCall('thumbnail', { userId: currentUserId, type: thumbType, size: sizeSelect.value });
      if (data && data.data && data.data[0]) {
        const item = data.data[0];
        if (item.state === 'Completed' && item.imageUrl) {
          document.getElementById(imgId).src = item.imageUrl;
          document.getElementById(statusId).innerHTML = '<span style="color:var(--accent)">✓ Completed</span>';
          return;
        }
      }
    } catch (e) {}
    pollThumbnail(thumbType, imgId, statusId, attempt + 1);
  }, 2000);
}

// ─── Render Wearing & Details ───
function renderWearing(wearing, details) {
  const list = document.getElementById('wearingList');
  if (!list) return;
  if (wearing && wearing.assetIds && wearing.assetIds.length > 0) {
    list.innerHTML = wearing.assetIds.map(id =>
      `<a href="https://www.roblox.com/catalog/${id}" target="_blank" class="wearing-item">
        <span class="wearing-id">${id}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>`).join('');
    // Try loading asset thumbnails
    loadAssetThumbnails(wearing.assetIds.slice(0, 20));
  } else {
    list.innerHTML = '<p class="placeholder-text">No items currently worn</p>';
  }
}

async function loadAssetThumbnails(assetIds) {
  try {
    const data = await proxyCall('asset-thumbnail', { assetIds: assetIds.join(',') });
    if (data && data.data) {
      data.data.forEach(item => {
        const el = document.querySelector(`.wearing-item[href*="/${item.targetId}"] .wearing-id`);
        if (el && item.imageUrl) {
          el.innerHTML = `<img src="${item.imageUrl}" style="width:24px;height:24px;border-radius:4px;vertical-align:middle;margin-right:4px"> ${item.targetId}`;
        }
      });
    }
  } catch (e) {}
}

function renderAvatarDetails(details, avatar3d) {
  // Scales
  const scalesEl = document.getElementById('avatarScales');
  if (scalesEl && details && details.scales) {
    const s = details.scales;
    scalesEl.innerHTML = Object.entries(s).map(([key, val]) =>
      `<div class="scale-item"><span class="scale-label">${key}</span><div class="scale-bar-container"><div class="scale-bar" style="width:${Math.round(val * 100)}%"></div></div><span class="scale-value">${val.toFixed(2)}</span></div>`
    ).join('');
  }

  // Body Colors
  const colorsEl = document.getElementById('bodyColors');
  if (colorsEl && details) {
    const c = details.bodyColors || details.bodyColor3s;
    if (c) {
      colorsEl.innerHTML = Object.entries(c).map(([part, colorId]) =>
        `<div class="color-item"><span class="color-label">${part.replace('Color', '').replace('Id', '')}</span><div class="color-swatch" style="background-color:#${colorId.toString(16).padStart(6,'0')}" title="Color ID: ${colorId}"></div><span class="color-id">#${colorId}</span></div>`
      ).join('');
    } else {
      colorsEl.innerHTML = '<p class="placeholder-text">No color data</p>';
    }
  }

  // Avatar Info
  const infoEl = document.getElementById('avatarInfo');
  if (infoEl && details) {
    let html = `<div class="info-item"><span class="info-label">Type</span><span class="info-value">${details.playerAvatarType || 'N/A'}</span></div>`;
    if (details.defaultShirtApplied) html += `<div class="info-item"><span class="info-label">Default Shirt</span><span class="info-value">Yes</span></div>`;
    if (details.defaultPantsApplied) html += `<div class="info-item"><span class="info-label">Default Pants</span><span class="info-value">Yes</span></div>`;
    if (avatar3d && avatar3d.imageUrl) {
      html += `<div class="info-item"><span class="info-label">3D Model</span><a href="${avatar3d.imageUrl}" target="_blank" class="info-link">Download OBJ</a></div>`;
    }
    infoEl.innerHTML = html;
  }
}

// ─── Presence & Stats ───
function renderPresenceAndStats(presence, friends, followers, followings) {
  const dot = document.getElementById('presenceDot');
  const text = document.getElementById('presenceText');
  if (dot) dot.className = 'presence-dot';
  if (text) text.className = 'presence-text-badge';

  let pType = 0, loc = '';
  if (presence && presence.userPresences && presence.userPresences[0]) {
    pType = presence.userPresences[0].userPresenceType;
    loc = presence.userPresences[0].lastLocation || '';
  }

  let cls = 'offline', txt = 'Offline';
  if (pType === 1) { cls = 'online'; txt = 'Online'; }
  else if (pType === 2) { cls = 'ingame'; txt = loc ? `Playing: ${loc}` : 'In-Game'; }
  else if (pType === 3) { cls = 'studio'; txt = 'Developing'; }

  if (dot) dot.classList.add(cls);
  if (text) { text.textContent = txt; text.classList.add(cls); }

  const fmt = d => d && typeof d.count === 'number' ? new Intl.NumberFormat('en-US').format(d.count) : '0';
  const el = document.getElementById('profileSocialStats');
  if (el) el.innerHTML = `<span>${fmt(friends)}</span> Friends · <span>${fmt(followers)}</span> Followers · <span>${fmt(followings)}</span> Following`;
}

function renderUsernameHistory(history) {
  const listEl = document.getElementById('usernameHistoryList');
  if (!listEl) return;
  if (history && history.data && history.data.length > 0) {
    // Deduplicate names
    const names = [...new Set(history.data.map(i => i.name))];
    listEl.innerHTML = names.map(name => `<span class="history-badge">${escapeHtml(name)}</span>`).join('');
  } else {
    listEl.innerHTML = '<span class="history-badge none">None</span>';
  }
}

// ─── Friends & Groups ───
async function renderFriendsList(friends) {
  const grid = document.getElementById('friendsGrid');
  if (!grid) return;
  if (!friends || !friends.data || friends.data.length === 0) {
    grid.innerHTML = '<p class="placeholder-text">No friends to display</p>';
    return;
  }
  const items = friends.data.slice(0, 6);
  grid.innerHTML = items.map(f => `
    <div class="friend-card" onclick="document.getElementById('searchInput').value='${f.id}'; performSearch();">
      <img class="friend-avatar" id="friend-avatar-${f.id}" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='80' height='80' fill='%231f1f1f'/></svg>" alt="${escapeHtml(f.displayName || '')}">
      <span class="friend-display">${escapeHtml(f.displayName || f.name || 'Unknown')}</span>
      <span class="friend-username">@${escapeHtml(f.name || '')}</span>
    </div>`).join('');

  try {
    const userIds = items.map(f => f.id).join(',');
    const thumbs = await proxyCall('thumbnail', { userId: userIds, type: 'headshot', size: '150x150' });
    if (thumbs && thumbs.data) {
      thumbs.data.forEach(t => {
        const img = document.getElementById(`friend-avatar-${t.targetId}`);
        if (img && t.imageUrl) img.src = t.imageUrl;
      });
    }
  } catch (e) {}
}

async function renderGroups(groupsData) {
  const grid = document.getElementById('groupsGrid');
  if (!grid) return;
  if (!groupsData || !groupsData.data || groupsData.data.length === 0) {
    grid.innerHTML = '<p class="placeholder-text">No groups joined</p>';
    return;
  }
  const items = groupsData.data.slice(0, 8);
  grid.innerHTML = items.map(item => `
    <div class="group-card" onclick="window.open('https://www.roblox.com/groups/${item.group.id}','_blank')">
      <img class="group-icon" id="group-icon-${item.group.id}" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><rect width='48' height='48' fill='%231f1f1f'/></svg>" alt="${escapeHtml(item.group.name)}">
      <div class="group-info">
        <span class="group-name">${escapeHtml(item.group.name)}</span>
        <span class="group-role">${escapeHtml(item.role.name)}</span>
      </div>
    </div>`).join('');

  try {
    const groupIds = items.map(i => i.group.id).join(',');
    const icons = await proxyCall('group-icons', { groupIds });
    if (icons && icons.data) {
      icons.data.forEach(icon => {
        const img = document.getElementById(`group-icon-${icon.targetId}`);
        if (img && icon.imageUrl) img.src = icon.imageUrl;
      });
    }
  } catch (e) {}
}

// ─── Render API Log ───
function renderApiLog() {
  const log = document.getElementById('apiLog');
  const count = document.getElementById('apiCount');
  if (!log) return;
  count.textContent = apiCallLog.length;
  log.innerHTML = apiCallLog.map((entry, i) => {
    const statusColor = entry.status === 200 ? 'var(--accent)' : entry.status === 'error' ? 'var(--error)' : 'var(--warning)';
    const actionMatch = entry.url.match(/action=([^&]+)/);
    const action = actionMatch ? actionMatch[1] : entry.method;
    return `<div class="api-entry">
      <span class="api-index">${i + 1}</span>
      <span class="api-method" style="color:${statusColor}">${entry.status}</span>
      <span class="api-action">${action}</span>
      <span class="api-time">${entry.time}ms</span>
    </div>`;
  }).join('');
}

// ─── Image Utils ───
function downloadImage(imgId, filename) {
  const img = document.getElementById(imgId);
  if (!img || !img.src) return;
  const a = document.createElement('a');
  a.href = img.src; a.download = `roview_${filename}_${currentUserId || 'unknown'}.png`;
  a.target = '_blank'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function openFullscreen(imgId) {
  const img = document.getElementById(imgId);
  if (!img || !img.src) return;
  const modal = document.getElementById('fullscreenModal');
  const fsImg = document.getElementById('fullscreenImage');
  fsImg.src = img.src;
  modal.classList.remove('hidden');
  document.getElementById('modalDownloadBtn').onclick = () => downloadImage(imgId, 'fullscreen');
}

function closeFullscreen() {
  document.getElementById('fullscreenModal').classList.add('hidden');
}

// ─── Helpers ───
function fmtNum(n) {
  if (n == null) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showLoading(text) { loadingState.classList.remove('hidden'); loadingText.textContent = text; }
function setLoadingText(text) { loadingText.textContent = text; }
function hideLoading() { loadingState.classList.add('hidden'); }
function showError(msg) { errorState.classList.remove('hidden'); errorMessage.textContent = msg; }
function hideError() { errorState.classList.add('hidden'); }
function showResults() { resultsSection.classList.remove('hidden'); }
function hideResults() { resultsSection.classList.add('hidden'); }
