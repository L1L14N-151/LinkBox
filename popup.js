// Storage helpers
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

function normalizeUrl(url) {
  try {
    const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url);
    if (hasScheme && !/^https?:/i.test(url)) return null; // only http/https accepted
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.toString();
  } catch (_) { return null; }
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

// Simple toast notification (shared pattern with manage.js)
function showToast(text, undo) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.classList.remove('hidden');
  el.innerHTML = undo ? `${text} <a id="toast-undo">Annuler</a>` : text;
  let timer = setTimeout(() => el.classList.add('hidden'), 4000);
  if (undo) {
    const a = document.getElementById('toast-undo');
    if (a) a.onclick = () => { clearTimeout(timer); try { undo(); } catch(_){} el.classList.add('hidden'); };
  }
}

// Safe wrapper to avoid ReferenceError if not available
function safeToast(text, undo) {
  try {
    if (typeof showToast === 'function') return showToast(text, undo);
  } catch(_){}
  setStatus(text || '');
}

function render(list) {
  const ul = document.getElementById('links-list');
  ul.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Aucun lien enregistré.';
    empty.style.color = '#9ca3af';
    ul.appendChild(empty);
    return;
  }
  for (const item of list) {
    const li = document.createElement('li');
    li.className = 'item';
    const meta = document.createElement('div');
    meta.className = 'meta';
    const url = document.createElement('div');
    url.className = 'url';
    url.textContent = prettyUrl(item.url);
    meta.appendChild(url);
    if (Array.isArray(item.tags) && item.tags.length) {
      const tagsWrap = document.createElement('div');
      tagsWrap.className = 'tags';
      for (let t of item.tags) {
        if (t === 'view') t = 'viewed';
        const tag = document.createElement('span');
        tag.className = `tag tag-${t}`;
        tag.textContent = t;
        tagsWrap.appendChild(tag);
      }
      meta.appendChild(tagsWrap);
    }

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const openBtn = document.createElement('button');
    openBtn.textContent = 'Ouvrir';
    openBtn.addEventListener('click', async () => {
      await browser.tabs.create({ url: item.url, active: true });
    });
    // Simplified actions: only Open and Delete
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Supprimer';
    delBtn.className = 'danger';
    delBtn.addEventListener('click', async () => {
      const links = await getLinks();
      const next = links.filter((l) => l.id !== item.id);
      await saveLinks(next);
      render(next);
      setStatus('Lien supprimé.');
    });
    actions.appendChild(openBtn);
    actions.appendChild(delBtn);

    li.appendChild(meta);
    li.appendChild(actions);
    ul.appendChild(li);
  }
  // no menus in simplified UI
}

function setStatus(msg) {
  const els = [
    document.getElementById('status'),
    document.getElementById('status-save'),
    document.getElementById('status-add'),
    document.getElementById('status-rediscover')
  ].filter(Boolean);
  for (const el of els) {
    el.textContent = msg || '';
    if (msg) {
      setTimeout(() => {
        if (el.textContent === msg) el.textContent = '';
      }, 1800);
    }
  }
}

async function getCounts() {
  const links = await getLinks();
  const eligible = links.filter(l => !((Array.isArray(l.tags) && (l.tags.includes('viewed') || l.tags.includes('skip')))));
  let bag = await getBag();
  const eligibleIds = new Set(eligible.map(l => l.id));
  bag = bag.filter(id => eligibleIds.has(id));
  return { total: links.length, bag: bag.length, eligible: eligible.length };
}

async function addLink(url, title) {
  const normalized = normalizeUrl(url);
  if (!normalized) throw new Error('URL invalide');
  const links = await getLinks();
  if (links.some((l) => l.url === normalized)) {
    throw new Error('Ce lien existe déjà');
  }
  const item = {
    id: makeId(),
    url: normalized,
    title: title?.trim() || '',
    addedAt: Date.now(),
    visitedCount: 0,
    tags: ['new']
  };
  links.unshift(item);
  await saveLinks(links);
  return links;
}

function hostnameOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; }
}

function prettyUrl(u) {
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, '');
    let path = url.pathname || '/';
    return host + path;
  } catch {
    return (u || '').replace(/^https?:\/\//, '').replace(/^www\./, '');
  }
}

async function markDomainAsViewed(domain) {
  const links = await getLinks();
  const next = links.map(l => {
    const h = hostnameOf(l.url);
    if (h === domain) {
      let tags = Array.isArray(l.tags) ? l.tags.slice() : [];
      tags = tags.filter(t => t !== 'new' && t !== 'view');
      tags = Array.from(new Set([...tags, 'viewed']))
      return { ...l, tags };
    }
    return l;
  });
  await saveLinks(next);
  return next;
}

async function toggleViewed(id, makeViewed) {
  const links = await getLinks();
  const next = links.map(l => {
    if (l.id !== id) return l;
    let tags = Array.isArray(l.tags) ? l.tags.slice() : [];
    tags = tags.filter(t => t !== 'view' && t !== 'viewed' && t !== 'new');
    tags = makeViewed ? [...tags, 'viewed'] : [...tags, 'new'];
    return { ...l, tags: Array.from(new Set(tags)) };
  });
  await saveLinks(next);
  return next;
}

async function detectActiveInList() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return null;
    const domain = hostnameOf(tab.url);
    if (!domain) return null;
    const links = await getLinks();
    const found = links.find(l => hostnameOf(l.url) === domain);
    return found ? { domain, link: found, tabId: tab.id } : null;
  } catch { return null; }
}

async function updateLink(id, { url, title }) {
  const normalized = normalizeUrl(url);
  if (!normalized) throw new Error('URL invalide');
  const links = await getLinks();
  if (links.some((l) => l.url === normalized && l.id !== id)) {
    throw new Error('Un autre lien a déjà cette URL');
  }
  const next = links.map(l => l.id === id ? { ...l, url: normalized, title: title || '' } : l);
  await saveLinks(next);
  return next;
}

async function openRandom() {
  const links = await getLinks();
  const eligible = links.filter(l => !((Array.isArray(l.tags) && (l.tags.includes('viewed') || l.tags.includes('skip')))));
  if (!eligible.length) throw new Error('Aucun lien non vu à ouvrir');
  // Prepare shuffle bag of eligible IDs to avoid immediate repeats
  let bag = await getBag();
  const eligibleIds = new Set(eligible.map(l => l.id));
  bag = bag.filter(id => eligibleIds.has(id));
  if (bag.length === 0) {
    // Weight favorites 2x in the bag
    const weighted = eligible.flatMap(l => (Array.isArray(l.tags) && l.tags.includes('favorite')) ? [l.id, l.id] : [l.id]);
    await saveBag(shuffle(weighted.slice()));
    bag = await getBag();
  }
  const id = bag.pop();
  await saveBag(bag);
  let item = eligible.find(l => l.id === id);
  if (!item) {
    // Fallback: pure random among eligible
    item = eligible[Math.floor(Math.random() * eligible.length)];
  }
  await browser.tabs.create({ url: item.url, active: true });
  // Update visit stats
  // Optionally auto-mark viewed
  let auto = false; try { const { auto_mark_viewed=false } = await browser.storage.local.get({ auto_mark_viewed:false }); auto = !!auto_mark_viewed; } catch(_){ }
  const updated = links.map(l => {
    if (l.id !== item.id) return l;
    const base = { ...l, visitedCount: (l.visitedCount||0) + 1, lastVisitedAt: Date.now() };
    if (!auto) return base;
    let tags = Array.isArray(l.tags) ? l.tags.slice() : [];
    tags = tags.filter(t => t !== 'new');
    if (!tags.includes('viewed')) tags.push('viewed');
    return { ...base, tags };
  });
  await saveLinks(updated);
}

// Wire up UI
document.addEventListener('DOMContentLoaded', async () => {
  // Manual language selector with inline dictionary
  const STRINGS = {
    fr: {
      banner_text: 'Avez‑vous fini de visiter ce site ?', yes:'Oui', later:'Plus tard', ok:'OK',
      theme_toggle:'Basculer clair/sombre', info_title:'Informations', error_generic:'Action impossible.',
      tile_save:'Enregistrer la page', tile_random:'URL aléatoire', tile_manage:'Ouvrir le gestionnaire', tile_add:'Ajouter une URL',
      about_title:'À propos', about_what_title:"Qu’est‑ce que c’est ?", about_what_text:"LinkBox enregistre des liens localement, propose un lien au hasard pour (re)découvrir et permet de gérer/ exporter votre liste. Aucune donnée n’est envoyée.",
      features_title:'Fonctionnalités', feat_save:'Enregistrer la page courante ou un lien via le menu.', feat_random:'Ouvrir un lien aléatoire (exclut les liens marqués « viewed »).', feat_manage:'Gestion: recherche, marquer vu/nouveau, ignorer/inclure, modifier, supprimer, actions par lot.', feat_import:'Importer/Exporter JSON.', feat_theme:'Thème clair/sombre mémorisé.',
      privacy_title:'Confidentialité', privacy_local:'Données stockées en local (browser.storage.local).', privacy_none:'Aucune collecte, aucun serveur.', privacy_perms:'Permissions: storage, tabs, contextMenus.',
      import_title:'Import/Export', import_text:'Dans la popup: « Ouvrir le gestionnaire » → boutons « Exporter JSON » / « Importer JSON ».','invalid_page':'Page non prise en charge (http/https uniquement)'
    },
    en: {
      banner_text: 'Have you finished visiting this site?', yes:'Yes', later:'Later', ok:'OK',
      theme_toggle:'Toggle light/dark', info_title:'Information', error_generic:'Action not possible.',
      tile_save:'Save page', tile_random:'Random link', tile_manage:'Open manager', tile_add:'Add URL',
      about_title:'About', about_what_title:'What is it?', about_what_text:"LinkBox saves links locally, suggests a random one to (re)discover, and lets you manage/export your list. No data is sent.",
      features_title:'Features', feat_save:'Save current page or any link via the menu.', feat_random:'Open a random link (excludes links marked “viewed”).', feat_manage:'Manager: search, mark viewed/new, ignore/include, edit, delete, bulk actions.', feat_import:'Import/Export JSON.', feat_theme:'Light/Dark theme with preference saved.',
      privacy_title:'Privacy', privacy_local:'Data stored locally (browser.storage.local).', privacy_none:'No collection, no server.', privacy_perms:'Permissions: storage, tabs, contextMenus.',
      import_title:'Import/Export', import_text:"From the popup: ‘Open manager’ → ‘Export JSON’ / ‘Import JSON’.", 'invalid_page':'Page not supported (http/https only)',
      add_title:'Add URL', ph_url:'https://example.com', ph_title:'Title (optional)', add_btn:'Add'
    }
  };
  function setLangStrings(lang){
    const dict = STRINGS[lang] || STRINGS.fr;
    document.querySelectorAll('[data-t]').forEach(el=>{ const k=el.getAttribute('data-t'); if(dict[k]) el.textContent = dict[k]; });
    document.querySelectorAll('[data-title]').forEach(el=>{ const k=el.getAttribute('data-title'); if(dict[k]) el.setAttribute('title', dict[k]); });
    document.querySelectorAll('[data-ph]').forEach(el=>{ const k=el.getAttribute('data-ph'); if(dict[k]) el.setAttribute('placeholder', dict[k]); });
  }
  const viewHome = document.getElementById('view-home');
  const viewInterface = document.getElementById('view-interface');
  const viewSave = document.getElementById('view-save');
  const viewAdd = document.getElementById('view-add');
  const viewRediscover = document.getElementById('view-rediscover');
  const viewInfo = document.getElementById('view-info');
  const showHome = () => {
    viewHome.classList.remove('hidden');
    viewInterface.classList.add('hidden');
    viewSave.classList.add('hidden');
    viewAdd.classList.add('hidden');
    viewRediscover.classList.add('hidden');
    if (viewInfo) viewInfo.classList.add('hidden');
  };
  const showInterface = () => {
    viewHome.classList.add('hidden');
    viewInterface.classList.remove('hidden');
    viewSave.classList.add('hidden');
    viewAdd.classList.add('hidden');
    viewRediscover.classList.add('hidden');
    if (viewInfo) viewInfo.classList.add('hidden');
  };
  const showSave = () => {
    viewHome.classList.add('hidden');
    viewInterface.classList.add('hidden');
    viewSave.classList.remove('hidden');
    viewAdd.classList.add('hidden');
    viewRediscover.classList.add('hidden');
    if (viewInfo) viewInfo.classList.add('hidden');
  };
  const showAdd = () => {
    viewHome.classList.add('hidden');
    viewInterface.classList.add('hidden');
    viewSave.classList.add('hidden');
    viewAdd.classList.remove('hidden');
    viewRediscover.classList.add('hidden');
    if (viewInfo) viewInfo.classList.add('hidden');
  };
  const showRediscover = () => {
    viewHome.classList.add('hidden');
    viewInterface.classList.add('hidden');
    viewSave.classList.add('hidden');
    viewRediscover.classList.remove('hidden');
    if (viewInfo) viewInfo.classList.add('hidden');
  };
  const showInfo = () => {
    viewHome.classList.add('hidden');
    viewInterface.classList.add('hidden');
    viewSave.classList.add('hidden');
    viewAdd.classList.add('hidden');
    viewRediscover.classList.add('hidden');
    if (viewInfo) viewInfo.classList.remove('hidden');
  };

  // Interface elements
  const backBtnManage = document.getElementById('back-btn-manage');
  const backBtnSave = document.getElementById('back-btn-save');
  const backBtnAdd = document.getElementById('back-btn-add');
  const backBtnRediscover = document.getElementById('back-btn-rediscover');
  const backBtnInfo = document.getElementById('back-btn-info');
  const savePanel = document.getElementById('save-panel');
  const saveConfirm = document.getElementById('save-confirm');
  const saveCancel = document.getElementById('save-cancel');
  const saveForm = document.getElementById('save-form');
  const saveUrlInput = document.getElementById('save-url-input');
  const saveTitleInput = document.getElementById('save-title-input');
  const filterInput = document.getElementById('filter-input');
  const filterChips = document.getElementById('filter-chips');
  const sortSelect = document.getElementById('sort-select');
  const clearBtn = document.getElementById('clear-btn');
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const importFile = document.getElementById('import-file');
  const randomBtn = document.getElementById('random-btn'); // optional legacy
  const saveCurrentBtn = document.getElementById('save-current'); // optional legacy
  const tileSave = document.getElementById('tile-save');
  const tileRediscover = document.getElementById('tile-rediscover');
  const goManage = document.getElementById('go-manage');
  const tileAddUrl = document.getElementById('tile-add-url');
  const tileRandom = document.getElementById('tile-random');
  const homeCount = document.getElementById('home-count');
  const badgeRemaining = document.getElementById('badge-remaining');
  const tileInfo = document.getElementById('tile-info');
  const infoBtn = document.getElementById('info-btn');
  const langSelect = document.getElementById('lang-select');
  const autoToggle = document.getElementById('auto-viewed');
  const addFormView = document.getElementById('add-form-view');
  const addUrlInput = document.getElementById('add-url-input');
  const addTitleInput = document.getElementById('add-title-input');
  const randomOpenBtn = document.getElementById('random-open');
  const banner = document.getElementById('visit-banner');
  const bannerYes = document.getElementById('banner-yes');
  const bannerLater = document.getElementById('banner-later');
  const errorBanner = document.getElementById('error-banner');
  const errorText = document.getElementById('error-text');
  const errorClose = document.getElementById('error-close');
  function showErrorBanner(msg){
    if (!errorBanner || !errorText || !errorClose) { setStatus(msg); return; }
    errorText.textContent = msg || 'Action impossible.';
    errorBanner.classList.remove('hidden');
    const close = ()=>{ errorBanner.classList.add('hidden'); };
    errorClose.onclick = close;
    // auto-hide after 4s
    setTimeout(close, 4000);
  }
  const themeToggle = document.getElementById('theme-toggle');

  // Initial render + migration
  let allLinks = await getLinks();
  // tags migration: 'view' -> 'viewed', add default if missing
  let changed = false;
  const migrated = allLinks.map(l => {
    let tags = Array.isArray(l.tags) ? l.tags.slice() : [];
    if (tags.includes('view')) { tags = tags.map(t => t === 'view' ? 'viewed' : t); changed = true; }
    if (tags.length === 0) {
      tags = (l.visitedCount && l.visitedCount > 0) || l.lastVisitedAt ? ['viewed'] : ['new'];
      changed = true;
    }
    return { ...l, tags };
  });
  if (changed) {
    await saveLinks(migrated);
    allLinks = migrated;
  }
  render(allLinks);
  // Start on Home (simple)
  showHome();

  // Show banner if current tab matches a saved domain
  const match = await detectActiveInList();
  // Check snooze state from background (do not show until reload)
  let snoozed = false;
  try { if (match && typeof match.tabId === 'number') { snoozed = await browser.runtime.sendMessage({ type:'is-banner-snoozed', tabId: match.tabId }); } } catch(_){ }
  if (match && banner && !snoozed) {
    banner.classList.remove('hidden');
    bannerYes.onclick = async () => {
      await markDomainAsViewed(match.domain);
      render(await getLinks());
      banner.classList.add('hidden');
      setStatus(`Marqué comme "vu" pour ${match.domain}`);
    };
    bannerLater.onclick = () => {
      banner.classList.add('hidden');
      try { if (typeof match.tabId === 'number') browser.runtime.sendMessage({ type:'banner-snooze', tabId: match.tabId }); } catch(_){ }
    };
  }
  // Load auto-mark preference and set toggle
  try { const { auto_mark_viewed=false } = await browser.storage.local.get({ auto_mark_viewed:false }); if (autoToggle) autoToggle.setAttribute('aria-checked', String(!!auto_mark_viewed)); } catch(_){ }
  if (autoToggle){
    const toggle = async ()=>{
      const v = autoToggle.getAttribute('aria-checked') === 'true';
      autoToggle.setAttribute('aria-checked', String(!v));
      await browser.storage.local.set({ auto_mark_viewed: !v });
    };
    autoToggle.addEventListener('click', toggle);
    autoToggle.addEventListener('keydown', (e)=>{ if(e.key===' '||e.key==='Enter'){ e.preventDefault(); toggle(); }});
  }

  // Theme: read + apply; toggle button
  async function applyThemeFromStorage(){
    try{
      const { ui_theme=null } = await browser.storage.local.get({ ui_theme:null });
      document.body.classList.remove('theme-dark','theme-light');
      if(ui_theme==='dark') document.body.classList.add('theme-dark');
      else if(ui_theme==='light') document.body.classList.add('theme-light');
      if(themeToggle){ themeToggle.textContent = (ui_theme==='light')? '🌙' : '☀️'; }
    }catch(_){ }
  }
  await applyThemeFromStorage();
  // Language persistence
  try{
    const { ui_lang='fr' } = await browser.storage.local.get({ ui_lang: 'fr' });
    if (langSelect) langSelect.value = ui_lang;
    setLangStrings(ui_lang);
    langSelect?.addEventListener('change', async ()=>{
      const lang = langSelect.value;
      await browser.storage.local.set({ ui_lang: lang });
      setLangStrings(lang);
    });
  }catch(_){ setLangStrings('fr'); }
  if(themeToggle){
    themeToggle.addEventListener('click', async ()=>{
      try{
        const { ui_theme=null } = await browser.storage.local.get({ ui_theme:null });
        const next = ui_theme==='light' ? 'dark' : 'light';
        await browser.storage.local.set({ ui_theme: next });
        await applyThemeFromStorage();
      }catch(_){ }
    });
  }
  // Update home count initially
  try {
    const initLinks = await getLinks();
    if (homeCount) homeCount.textContent = `${initLinks.length} ${initLinks.length>1?'éléments':'élément'}`;
    const c = await getCounts(); if (badgeRemaining) badgeRemaining.textContent = String(c.eligible);
  } catch (_) {}

  // Update home count initially
  try {
    const links = await getLinks();
    if (homeCount) homeCount.textContent = `${links.length} ${links.length>1?'éléments':'élément'}`;
  } catch(_){}

  // No manual URL form anymore

  if (randomBtn) {
    randomBtn.addEventListener('click', async () => {
      try {
        await openRandom();
      } catch (err) {
        setStatus(err.message || 'Erreur');
      }
    });
  }

  async function saveActiveTab() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) { setStatus('Impossible de lire l\'onglet courant.'); return false; }
      if (!/^https?:\/\//i.test(tab.url)) {
        const { ui_lang='fr' } = await browser.storage.local.get({ ui_lang:'fr' });
        showErrorBanner((STRINGS[ui_lang]||STRINGS.fr).invalid_page);
        return false;
      }
      // simple success feedback for http(s) pages (UX simplifié)
      try {
        const el = document.getElementById('tile-save');
        const dot = el ? el.querySelector('.home-emoji') : null;
        if (dot) { dot.textContent = '✅'; setTimeout(()=>{ dot.textContent = '🟣'; }, 1200); }
      } catch(_){}
      try {
        const next = await addLink(tab.url, tab.title || '');
        render(next);
        safeToast('Page enregistrée.', async () => {
          const links = await getLinks();
          const filtered = links.filter(l => l.url !== next[0]?.url);
          await saveLinks(filtered);
          render(filtered);
        });
      } catch (err) {
        // Duplicate or other non-blocking issue -> considérer OK mais informer
        const msg = (err && err.message) ? err.message : '';
        if (/existe d(é|e)jà/i.test(msg)) safeToast('Déjà enregistré.');
        else if (msg) showErrorBanner(msg);
        // Continuer à retourner true pour UX plus simple
      }
      return true;
    } catch (err) {
      setStatus(err?.message || 'Erreur');
      return false;
    }
  }

  if (saveCurrentBtn) {
    saveCurrentBtn.addEventListener('click', async () => {
      try { await saveActiveTab(); } catch (err) { setStatus(err.message || 'Erreur'); }
    });
  }

  // Home tiles navigation
  if (tileSave) tileSave.addEventListener('click', async () => {
    // animate only the save tile
    tileSave.classList.remove('press-anim'); void tileSave.offsetWidth; tileSave.classList.add('press-anim');
    const ok = await saveActiveTab();
    if (ok) setTimeout(() => showHome(), 700);
  });
  if (tileAddUrl) tileAddUrl.addEventListener('click', () => { showAdd(); });
  if (tileRandom) tileRandom.addEventListener('click', async () => { try { await openRandom(); window.close(); } catch(err){ setStatus(err.message||'Erreur'); } });
  if (tileRediscover) tileRediscover.addEventListener('click', () => showRediscover());
  if (goManage) goManage.addEventListener('click', async () => {
    const url = browser.runtime.getURL('manage.html');
    await browser.tabs.create({ url, active: true });
    window.close();
  });
  const onInfo = ()=>{ showInfo(); };
  if (tileInfo) tileInfo.addEventListener('click', onInfo);
  if (infoBtn) infoBtn.addEventListener('click', onInfo);

  if (randomOpenBtn) {
    randomOpenBtn.addEventListener('click', async () => {
      try {
        await openRandom();
        window.close();
      } catch (err) { setStatus(err.message || 'Erreur'); }
    });
  }
  
  backBtnManage.addEventListener('click', () => showHome());
  backBtnSave.addEventListener('click', () => showHome());
  backBtnAdd.addEventListener('click', () => showHome());
  backBtnRediscover.addEventListener('click', () => showHome());
  if (backBtnInfo) backBtnInfo.addEventListener('click', () => showHome());

  // Save confirmation panel
  saveConfirm.addEventListener('click', async () => {
    try {
      const ok = await saveActiveTab();
      // stay on save view; user can go back
      savePanel.classList.remove('hidden');
      setTimeout(() => showHome(), 700);
    } catch (err) {
      setStatus(err.message || 'Erreur');
    }
  });
  saveCancel.addEventListener('click', () => {
    // keep view but hide panel for now
    savePanel.classList.add('hidden');
  });

  // Add URL (dedicated view)
  if (addFormView) {
    addFormView.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const url = addUrlInput.value.trim();
        const title = (addTitleInput.value || '').trim();
        if (!url) { setStatus('Entre une URL valide'); return; }
        const next = await addLink(url, title);
        render(next);
        addFormView.reset();
        safeToast('Lien ajouté.', async () => {
          const links = await getLinks();
          const filtered = links.filter(l => l.url !== next[0]?.url);
          await saveLinks(filtered);
          render(filtered);
        });
        setTimeout(() => showHome(), 700);
      } catch (err) { setStatus(err.message || 'Erreur'); }
    });
  }

  // Manual URL add in Save view
  if (saveForm) {
    saveForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const url = saveUrlInput.value.trim();
        const title = (saveTitleInput.value || '').trim();
        if (!url) { setStatus('Entre une URL valide'); return; }
        const next = await addLink(url, title);
        render(next);
        saveForm.reset();
        safeToast('Lien ajouté.', async () => {
          const links = await getLinks();
          const filtered = links.filter(l => l.url !== next[0]?.url);
          await saveLinks(filtered);
          render(filtered);
        });
        setTimeout(() => showHome(), 700);
      } catch (err) {
        setStatus(err.message || 'Erreur lors de l\'ajout');
      }
    });
  }

  // Filters and sort
  let currentFilter = 'all';
  let currentSort = 'added_desc';
  function applyFilterSort(links) {
    let out = links.slice();
    if (currentFilter === 'new') out = out.filter(l => Array.isArray(l.tags) && l.tags.includes('new'));
    if (currentFilter === 'viewed') out = out.filter(l => Array.isArray(l.tags) && l.tags.includes('viewed'));
    if (currentSort === 'added_desc') out.sort((a,b)=> (b.addedAt||0)-(a.addedAt||0));
    if (currentSort === 'visited_asc') out.sort((a,b)=> (a.visitedCount||0)-(b.visitedCount||0));
    if (currentSort === 'last_visited_desc') out.sort((a,b)=> (b.lastVisitedAt||0)-(a.lastVisitedAt||0));
    return out;
  }
  function refreshList() { render(applyFilterSort(allLinks)); }
  if (filterChips) {
    filterChips.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      currentFilter = btn.dataset.filter;
      for (const c of filterChips.querySelectorAll('.chip')) c.classList.remove('chip-active');
      btn.classList.add('chip-active');
      refreshList();
    });
  }
  if (sortSelect) {
    sortSelect.addEventListener('change', () => { currentSort = sortSelect.value; refreshList(); });
  }

  clearBtn.addEventListener('click', async () => {
    const ok = confirm('Supprimer tous les liens ?');
    if (!ok) return;
    await saveLinks([]);
    await saveBag([]);
    render([]);
    setStatus('Tous les liens ont été supprimés.');
  });

  // Filter in manage view
  if (filterInput) {
    filterInput.addEventListener('input', async () => {
      const q = filterInput.value.trim().toLowerCase();
      const links = await getLinks();
      allLinks = links;
      const filtered = q ? links.filter(l => (l.title||'').toLowerCase().includes(q) || (l.url||'').toLowerCase().includes(q)) : links;
      render(filtered);
    });
  }

  // No popup-wide keyboard shortcuts (disabled on request)

  // Update counts on storage changes
  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    // refresh home count
    try {
      const lks = await getLinks();
      if (homeCount) homeCount.textContent = `${lks.length} ${lks.length>1?'éléments':'élément'}`;
      const c = await getCounts(); if (badgeRemaining) badgeRemaining.textContent = String(c.eligible);
    } catch (_) {}
    if (changes.links) {
      const newLinks = await getLinks();
      render(newLinks);
    }
  });

  // Export / Import
  async function exportLinks() {
    try {
      const links = await getLinks();
      const payload = { version: 1, exportedAt: new Date().toISOString(), links };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `links-export-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus('Export téléchargé.');
    } catch (err) { setStatus('Export impossible'); }
  }

function sanitizeTags(tags) {
  const allow = new Set(['new','viewed','skip','favorite']);
  const arr = Array.isArray(tags) ? tags.filter(t => typeof t === 'string') : [];
  const migrated = arr.map(t => t === 'view' ? 'viewed' : t);
  return Array.from(new Set(migrated.filter(t => allow.has(t))));
}

  function safeJsonParse(str) {
    // strip BOM, trim, attempt tolerant trailing-comma removal
    const cleaned = String(str || '').replace(/^\uFEFF/, '').trim().replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(cleaned); } catch (_) { return null; }
  }

  function coerceArrayFromParsed(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.links)) return parsed.links;
      if (Array.isArray(parsed.items)) return parsed.items;
      if (parsed.data && Array.isArray(parsed.data.links)) return parsed.data.links;
      // Map shape { url: title }
      if (parsed.links && typeof parsed.links === 'object' && !Array.isArray(parsed.links)) {
        return Object.entries(parsed.links).map(([url, title]) => ({ url, title: String(title||'') }));
      }
    }
    return null;
  }

  async function importLinksFromText(text) {
    try {
      const existing = await getLinks();
      const urlSet = new Set(existing.map(l => l.url));
      // Try strict JSON first
      let parsed = safeJsonParse(text);
      let arr = coerceArrayFromParsed(parsed);
      // Fallback: NDJSON or list of URLs (one per line)
      if (!arr) {
        const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const guess = [];
        for (const line of lines) {
          const obj = safeJsonParse(line);
          if (obj && typeof obj === 'object') guess.push(obj); else guess.push({ url: line });
        }
        arr = guess;
      }
      if (!Array.isArray(arr)) throw new Error('Format invalide');
      let added = 0;
      const additions = [];
      for (const raw of arr) {
        let candidate = raw;
        if (!candidate || typeof candidate !== 'object') candidate = { url: String(raw||'') };
        const urlField = candidate.url || candidate.href || candidate.link || candidate.location;
        const normalized = normalizeUrl(String(urlField||''));
        if (!normalized || urlSet.has(normalized)) continue;
        const item = {
          id: makeId(),
          url: normalized,
          title: typeof candidate.title === 'string' ? candidate.title.slice(0,256) : '',
          addedAt: Number(candidate.addedAt) || Date.now(),
          visitedCount: Number(candidate.visitedCount) || 0,
          lastVisitedAt: Number(candidate.lastVisitedAt) || undefined,
          tags: sanitizeTags(candidate.tags)
        };
        if (!item.tags.length) item.tags = (item.visitedCount>0||item.lastVisitedAt)?['viewed']:['new'];
        additions.push(item);
        urlSet.add(normalized);
        added++;
      }
      if (!added) { setStatus('Aucun nouveau lien importé.'); return; }
      const merged = [...additions, ...existing];
      await saveLinks(merged);
      await saveBag([]);
      render(merged);
      try { allLinks = merged; } catch (_) {}
      setStatus(`${added} liens importés.`);
    } catch (err) {
      console.error('Import error', err);
      setStatus(`Import invalide: ${err && err.message ? err.message : 'erreur'}`);
    }
  }

  if (exportBtn) exportBtn.addEventListener('click', exportLinks);
  if (importBtn) {
    importBtn.addEventListener('click', async () => {
      const url = browser.runtime.getURL('import.html');
      await browser.tabs.create({ url, active: true });
      window.close();
    });
  }
});
