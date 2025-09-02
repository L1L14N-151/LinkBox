// MV2 background: context menu + commands
// Cross‑browser API (Firefox browser.*, Chromium chrome.*)
var browser = (typeof globalThis !== 'undefined' && typeof globalThis.browser !== 'undefined')
  ? globalThis.browser
  : (typeof globalThis !== 'undefined' && typeof globalThis.chrome !== 'undefined' ? globalThis.chrome : undefined);

function normalizeUrl(url) {
  try {
    // If a scheme is present and it's not http/https, reject
    const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url);
    if (hasScheme && !/^https?:/i.test(url)) return null;
    // If missing http(s) scheme, default to https for free-form inputs
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function getLinks() {
  const { links = [] } = await browser.storage.local.get({ links: [] });
  return links;
}

async function saveLinks(links) {
  await browser.storage.local.set({ links });
}

async function getBag() {
  const { shuffleBag = [] } = await browser.storage.local.get({ shuffleBag: [] });
  return shuffleBag;
}

async function saveBag(bag) {
  await browser.storage.local.set({ shuffleBag: bag });
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function addLink(url, title = "") {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  const links = await getLinks();
  if (links.some((l) => l.url === normalized)) return false;
  const item = { id: makeId(), url: normalized, title: title || "", addedAt: Date.now(), visitedCount: 0, tags: ["new"] };
  links.unshift(item);
  await saveLinks(links);
  return true;
}

async function openRandom() {
  const links = await getLinks();
  // Align eligibility with popup.js: exclude 'viewed' and 'skip'
  const eligible = links.filter(l => {
    const tags = Array.isArray(l.tags) ? l.tags : [];
    return !(tags.includes('viewed') || tags.includes('skip'));
  });
  if (!eligible.length) return false;
  let bag = await getBag();
  const eligibleIds = new Set(eligible.map(l => l.id));
  // Keep only IDs that are still eligible
  bag = bag.filter(id => eligibleIds.has(id));
  if (bag.length === 0) {
    // Weight favorites 2x in the bag to increase odds (same behavior as popup.js)
    const weighted = eligible.flatMap(l => (Array.isArray(l.tags) && l.tags.includes('favorite')) ? [l.id, l.id] : [l.id]);
    await saveBag(shuffle(weighted.slice()));
    bag = await getBag();
  }
  const id = bag.pop();
  await saveBag(bag);
  const item = eligible.find(l => l.id === id) || eligible[Math.floor(Math.random() * eligible.length)];
  await browser.tabs.create({ url: item.url, active: true });
  // Update visit stats
  const updated = links.map(l => l.id === item.id ? { ...l, visitedCount: (l.visitedCount||0) + 1, lastVisitedAt: Date.now() } : l);
  await saveLinks(updated);
  return true;
}

// Snooze logic for visit banner per tab until reload
const bannerSnooze = Object.create(null);

browser.runtime.onMessage.addListener((msg, sender) => {
  try {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'banner-snooze' && typeof msg.tabId === 'number') {
      bannerSnooze[msg.tabId] = true;
      return;
    }
    if (msg.type === 'is-banner-snoozed' && typeof msg.tabId === 'number') {
      return Promise.resolve(!!bannerSnooze[msg.tabId]);
    }
  } catch (_) {}
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Clear snooze when the tab starts loading (reload or navigation)
  if (changeInfo.status === 'loading') {
    delete bannerSnooze[tabId];
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  delete bannerSnooze[tabId];
});

browser.runtime.onInstalled.addListener(async () => {
  try {
    await browser.contextMenus.create({ id: 'save-page', title: "Enregistrer cette page", contexts: ['page'] });
    await browser.contextMenus.create({ id: 'save-link', title: "Enregistrer ce lien", contexts: ['link'] });
  } catch (_) {}
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-page' && tab?.url) {
    await addLink(tab.url, tab.title || '');
  }
  if (info.menuItemId === 'save-link' && info.linkUrl) {
    await addLink(info.linkUrl, '');
  }
});

browser.commands.onCommand.addListener(async (command) => {
  if (command === 'save-tab') {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) await addLink(tab.url, tab.title || '');
  }
  if (command === 'open-random') {
    await openRandom();
  }
});

// Messages from content script/site shortcuts
// (No message listeners; shortcuts via content scripts are disabled.)
