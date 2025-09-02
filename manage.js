// Shared helpers (subset)
function normalizeUrl(url){ try{ const hasScheme=/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url); if(hasScheme && !/^https?:/i.test(url)) return null; if(!/^https?:\/\//i.test(url)) url=`https://${url}`; const u=new URL(url); if(!/^https?:$/.test(u.protocol)) return null; return u.toString(); }catch{ return null; } }
function makeId(){ return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`; }
async function getLinks(){ const { links=[] } = await browser.storage.local.get({ links: [] }); return links; }
async function saveLinks(links){ await browser.storage.local.set({ links }); }
async function getBag(){ const { shuffleBag=[] } = await browser.storage.local.get({ shuffleBag: [] }); return shuffleBag; }
async function saveBag(b){ await browser.storage.local.set({ shuffleBag: b }); }
function hostnameOf(u){ try{ return new URL(u).hostname.replace(/^www\./,''); }catch{ return null; } }
function prettyUrl(u){ try{ const url=new URL(u); const host=url.hostname.replace(/^www\./,''); return host + (url.pathname||'/'); }catch{ return (u||'').replace(/^https?:\/\//,'').replace(/^www\./,''); } }
function sanitizeTags(tags){ const allow=new Set(['new','viewed','skip','favorite']); const arr=Array.isArray(tags)?tags.filter(t=>typeof t==='string'):[]; const migrated=arr.map(t=>t==='view'?'viewed':t); return Array.from(new Set(migrated.filter(t=>allow.has(t)))); }
function safeJsonParse(str){ const cleaned=String(str||'').replace(/^\uFEFF/,'').trim().replace(/,\s*([}\]])/g,'$1'); try { return JSON.parse(cleaned); } catch { return null; } }
function coerceArrayFromParsed(parsed){ if(Array.isArray(parsed)) return parsed; if(parsed&&typeof parsed==='object'){ if(Array.isArray(parsed.links)) return parsed.links; if(Array.isArray(parsed.items)) return parsed.items; if(parsed.data&&Array.isArray(parsed.data.links)) return parsed.data.links; if(parsed.links&&typeof parsed.links==='object'&&!Array.isArray(parsed.links)){ return Object.entries(parsed.links).map(([url,title])=>({url,title:String(title||'')})); } } return null; }
async function importLinksText(text){ const existing=await getLinks(); const urlSet=new Set(existing.map(l=>l.url)); let parsed=safeJsonParse(text); let arr=coerceArrayFromParsed(parsed); if(!arr){ const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean); arr=lines.map(line=>{ const obj=safeJsonParse(line); return obj&&typeof obj==='object'?obj:{url:line}; }); } if(!Array.isArray(arr)) throw new Error('Format invalide'); let added=0; const additions=[]; for(const raw of arr){ const candidate=(raw&&typeof raw==='object')?raw:{url:String(raw||'')}; const urlField=candidate.url||candidate.href||candidate.link||candidate.location; const normalized=normalizeUrl(String(urlField||'')); if(!normalized||urlSet.has(normalized)) continue; const item={ id:makeId(), url:normalized, title: typeof candidate.title==='string'?candidate.title.slice(0,256):'', addedAt:Number(candidate.addedAt)||Date.now(), visitedCount:Number(candidate.visitedCount)||0, lastVisitedAt:Number(candidate.lastVisitedAt)||undefined, tags:sanitizeTags(candidate.tags) }; if(!item.tags.length) item.tags=(item.visitedCount>0||item.lastVisitedAt)?['viewed']:['new']; additions.push(item); urlSet.add(normalized); added++; } if(!added) return {added:0}; const merged=[...additions, ...existing]; await saveLinks(merged); await saveBag([]); return {added, total:merged.length}; }

function el(tag, cls, text){ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }

function showToast(text, undo){
  const el=document.getElementById('toast'); if(!el) return;
  el.classList.remove('hidden');
  el.innerHTML = undo ? `${text} <a id="toast-undo">Annuler</a>` : text;
  let timer=setTimeout(()=>el.classList.add('hidden'), 4000);
  if(undo){
    const a=document.getElementById('toast-undo');
    a.onclick=()=>{ clearTimeout(timer); undo(); el.classList.add('hidden'); };
  }
}

var UI_LANG = 'fr';
let selectedIds = new Set();
function updateBatchUI(){
  try{
    const countEl = document.getElementById('batch-count');
    const n = selectedIds.size;
    if (countEl) countEl.textContent = n ? `${n} sélectionné(s)` : '';
    const ids = ['batch-viewed','batch-new','batch-skip','batch-include','batch-delete'];
    for (const id of ids){ const btn = document.getElementById(id); if (btn) btn.disabled = n===0; }
  }catch(_){ }
}

function render(list){
  const D = (typeof UI_LANG !== 'undefined' && UI_LANG==='en') ? {
    open:'↗ Open', viewed:'👁️ Viewed', mark_new:'🆕 New', ignore:'🚫 Ignore', include:'✅ Include', edit:'✏️ Edit', del:'🗑️ Delete'
  } : { open:'↗ Ouvrir', viewed:'👁️ Vu', mark_new:'🆕 Nouveau', ignore:'🚫 Ignorer', include:'✅ Inclure', edit:'✏️ Modifier', del:'🗑️ Supprimer' };
  const ul=document.getElementById('links-list'); const empty=document.getElementById('empty');
  ul.innerHTML='';
  if(!list.length){ empty.classList.remove('hidden'); return; } else empty.classList.add('hidden');
  for(const item of list){
    const li=el('li','item');
    // Selection checkbox
    const selWrap = el('div'); selWrap.style.marginRight = '6px';
    const cb = document.createElement('input'); cb.type='checkbox'; cb.className='sel'; cb.dataset.id = item.id; cb.checked = selectedIds.has(item.id);
    cb.addEventListener('change', ()=>{ if(cb.checked) selectedIds.add(item.id); else selectedIds.delete(item.id); updateBatchUI(); });
    selWrap.appendChild(cb);
    const meta=el('div','meta');
    const url=el('div','url');
    const host=el('span','url-host', hostnameOf(item.url)||'');
    const path=el('span','url-path', new URL(item.url).pathname || '/');
    url.append(host, document.createTextNode(''), path);
    url.title=item.url;
    url.style.cursor='pointer';
    url.onclick=async()=>{ try{ await navigator.clipboard.writeText(item.url); status.textContent='URL copiée.'; setTimeout(()=>status.textContent='',1500); }catch(_){} };
    meta.appendChild(url);
    if(Array.isArray(item.tags)&&item.tags.length){
      const wrap=el('div','tags');
      for(let t of item.tags){ if(t==='view') t='viewed'; wrap.appendChild(el('span',`tag tag-${t}`,t)); }
      meta.appendChild(wrap);
    }
    const actions=el('div','row-actions');
    const openBtn=el('button','primary',D.open); openBtn.title=D.open.replace('↗ ',''); openBtn.onclick=()=>browser.tabs.create({url:item.url,active:true});
    const isViewed = Array.isArray(item.tags)&&item.tags.includes('viewed');
    const toggle=el('button',null, isViewed ? D.mark_new : D.viewed);
    toggle.title='Basculer vu/nouveau';
    toggle.onclick=async()=>{
      const links=await getLinks();
      const next=links.map(l=>{
        if(l.id!==item.id) return l; let tags=Array.isArray(l.tags)?l.tags.slice():[]; tags=tags.filter(t=>!['view','viewed','new'].includes(t)); const viewed=Array.isArray(item.tags)&&item.tags.includes('viewed'); return {...l, tags: viewed?['new']:[...tags,'viewed']};
      });
      await saveLinks(next); render(applyFilterSort(next));
    };
    // Skip button
    const isSkip = Array.isArray(item.tags)&&item.tags.includes('skip');
    const skipBtn = el('button', null, isSkip ? D.include : D.ignore);
    skipBtn.title='Exclure/Inclure du tirage';
    skipBtn.onclick=async()=>{
      const links=await getLinks();
      const next=links.map(l=>{
        if(l.id!==item.id) return l; let tags=Array.isArray(l.tags)?l.tags.slice():[];
        if(tags.includes('skip')) tags=tags.filter(t=>t!=='skip'); else tags.push('skip');
        return {...l, tags:Array.from(new Set(tags))};
      });
      await saveLinks(next); render(applyFilterSort(next));
    };

    const editBtn=el('button',null,D.edit); editBtn.title='Modifier le titre/URL';
    editBtn.onclick=()=>{
      meta.innerHTML=''; const tI=el('input'); tI.type='text'; tI.value=item.title||''; tI.placeholder='Titre';
      const uI=el('input'); uI.type='url'; uI.value=item.url; uI.placeholder='https://exemple.com';
      const row=el('div','row-actions'); const save=el('button','primary','Enregistrer'); const cancel=el('button',null,'Annuler');
      save.onclick=async()=>{ try{ const links=await getLinks(); const normalized=normalizeUrl(uI.value.trim()); if(!normalized) throw new Error('URL invalide'); if(links.some(l=>l.url===normalized && l.id!==item.id)) throw new Error('URL déjà présente'); const updated=links.map(l=>l.id===item.id?{...l,url:normalized,title:tI.value.trim()}:l); await saveLinks(updated); render(applyFilterSort(updated)); }catch(e){ alert(e.message||'Erreur'); } };
      cancel.onclick=async()=>{ render(applyFilterSort(await getLinks())); };
      row.append(save,cancel); meta.append(tI,uI,row); tI.focus();
    };
    const delBtn=el('button','danger',D.del);
    delBtn.title='Supprimer (Shift+clic = sans confirmation)';
    delBtn.onclick=async(e)=>{
      if(!e.shiftKey){ if(!confirm('Supprimer ce lien ?')) return; }
      const links=await getLinks();
      const idx=links.findIndex(l=>l.id===item.id);
      if(idx===-1) return;
      const removed=links[idx];
      const next=links.filter(l=>l.id!==item.id);
      await saveLinks(next);
      render(applyFilterSort(next));
      showToast('Lien supprimé.', async ()=>{
        const current=await getLinks();
        // Ne pas dupliquer si déjà restauré ailleurs
        if(current.some(l=>l.id===removed.id)) return;
        const restored=current.slice();
        // Restaure à la position d’origine si possible
        const pos=Math.min(Math.max(idx,0), restored.length);
        restored.splice(pos,0,removed);
        await saveLinks(restored);
        render(applyFilterSort(restored));
      });
    };
    actions.append(openBtn,toggle,skipBtn,editBtn,delBtn);
    li.style.gridTemplateColumns = 'auto minmax(0,1fr) auto';
    li.prepend(selWrap);
    li.append(meta,actions);
    ul.appendChild(li);
  }
  updateBatchUI();
}

document.addEventListener('DOMContentLoaded', async ()=>{
  // Theme from storage (default light)
  async function applyTheme(){
    try {
      let { ui_theme=null } = await browser.storage.local.get({ ui_theme:null });
      if(ui_theme===null){ ui_theme='light'; await browser.storage.local.set({ ui_theme }); }
      document.body.classList.remove('theme-dark','theme-light');
      if(ui_theme==='dark') document.body.classList.add('theme-dark');
      else document.body.classList.add('theme-light');
      const t=document.getElementById('theme-toggle-manage'); if(t) t.textContent = (ui_theme==='light')?'🌙':'☀️';
    } catch(_){ }
  }
  await applyTheme();
  // Language selector init
  try{ const { ui_lang='fr' } = await browser.storage.local.get({ ui_lang:'fr' }); UI_LANG=ui_lang; }catch(_){ UI_LANG='fr'; }
  const lsel=document.getElementById('lang-select-manage'); if(lsel){ lsel.value=UI_LANG; lsel.addEventListener('change', async ()=>{ UI_LANG=lsel.value; await browser.storage.local.set({ ui_lang:UI_LANG }); applyLang(); render(applyFilterSort(await getLinks())); }); }
  // Apply static labels initially
  function applyLang(){
    const d = (UI_LANG==='en') ? {export_json:'Export JSON', import_json:'Import JSON', search_title:'Search', ph_search:'Search (title or URL)', chip_all:'All', chip_new:'New', chip_viewed:'Viewed', chip_ignored:'Ignored', sort_label:'Sort', sort_added:'Recently added', sort_visited:'Least visited', sort_last:'Recently opened', tip_title:'Tip', tip_text:'Right‑click a link → Save this link. Links marked “viewed” are excluded from random.'} : {export_json:'Exporter JSON', import_json:'Importer JSON', search_title:'Recherche', ph_search:'Rechercher (titre ou URL)', chip_all:'Tous', chip_new:'New', chip_viewed:'Viewed', chip_ignored:'Ignored', sort_label:'Tri', sort_added:'Ajoutés récents', sort_visited:'Moins visités', sort_last:'Récemment ouverts', tip_title:'Astuce', tip_text:'Clic droit sur un lien → Enregistrer ce lien. Les liens “viewed” sont exclus du tirage aléatoire.'};
    try{
      document.querySelectorAll('[data-t]').forEach(el=>{ const k=el.getAttribute('data-t'); if(d[k]) el.textContent=d[k]; });
      document.querySelectorAll('[data-ph]').forEach(el=>{ const k=el.getAttribute('data-ph'); if(d[k]) el.setAttribute('placeholder', d[k]); });
      const chips=document.getElementById('filter-chips'); if(chips){ chips.querySelector('[data-filter="all"]').textContent=d.chip_all; chips.querySelector('[data-filter="new"]').textContent=d.chip_new; chips.querySelector('[data-filter="viewed"]').textContent=d.chip_viewed; chips.querySelector('[data-filter="ignored"]').textContent=d.chip_ignored; }
      const ss=document.getElementById('sort-select'); if(ss){ ss.querySelector('option[value="added_desc"]').textContent=d.sort_added; ss.querySelector('option[value="visited_asc"]').textContent=d.sort_visited; ss.querySelector('option[value="last_visited_desc"]').textContent=d.sort_last; }
    }catch(_){ }
  }
  applyLang();
  const filterInput=document.getElementById('filter-input');
  const chips=document.getElementById('filter-chips');
  const sortSelect=document.getElementById('sort-select');
  const exportBtn=document.getElementById('export-btn');
  const importBtn=document.getElementById('import-btn');
  const importFile=document.getElementById('import-file');
  const clearBtn=document.getElementById('clear-btn');
  const status=document.getElementById('status');
  const themeToggle=document.getElementById('theme-toggle-manage');
  // Batch controls
  const selectAll=document.getElementById('select-all');
  const btnViewed=document.getElementById('batch-viewed');
  const btnNew=document.getElementById('batch-new');
  const btnSkip=document.getElementById('batch-skip');
  const btnInclude=document.getElementById('batch-include');
  const btnDelete=document.getElementById('batch-delete');

  let all=await getLinks();
  // Lightweight migration for tags
  let changed=false; all=all.map(l=>{ let tags=Array.isArray(l.tags)?l.tags.slice():[]; if(tags.includes('view')){ tags=tags.map(t=>t==='view'?'viewed':t); changed=true; } if(!tags.length) { tags=(l.visitedCount>0||l.lastVisitedAt)?['viewed']:['new']; changed=true; } return {...l,tags}; }); if(changed){ await saveLinks(all); }

  let filter='all'; let sort='added_desc';
  function applyFilterSort(list){ let out=list.slice(); if(filter==='new') out=out.filter(l=>Array.isArray(l.tags)&&l.tags.includes('new')); if(filter==='viewed') out=out.filter(l=>Array.isArray(l.tags)&&l.tags.includes('viewed')); if(filter==='ignored') out=out.filter(l=>Array.isArray(l.tags)&&l.tags.includes('skip')); if(sort==='added_desc') out.sort((a,b)=>(b.addedAt||0)-(a.addedAt||0)); if(sort==='visited_asc') out.sort((a,b)=>(a.visitedCount||0)-(b.visitedCount||0)); if(sort==='last_visited_desc') out.sort((a,b)=>(b.lastVisitedAt||0)-(a.lastVisitedAt||0)); return out; }
  window.applyFilterSort=applyFilterSort; // used inside render updates
  render(applyFilterSort(all));
  updateBatchUI();

  filterInput.addEventListener('input', async ()=>{
    const q=filterInput.value.trim().toLowerCase();
    const links=await getLinks(); all=links;
    const filtered=q?links.filter(l=> (l.title||'').toLowerCase().includes(q) || (l.url||'').toLowerCase().includes(q) ):links;
    render(applyFilterSort(filtered));
  });
  chips.addEventListener('click',(e)=>{ const btn=e.target.closest('[data-filter]'); if(!btn) return; filter=btn.dataset.filter; for(const c of chips.querySelectorAll('.chip')) c.classList.remove('chip-active'); btn.classList.add('chip-active'); render(applyFilterSort(all)); });
  sortSelect.addEventListener('change',()=>{ sort=sortSelect.value; render(applyFilterSort(all)); });

  exportBtn.addEventListener('click', async ()=>{
    const links=await getLinks(); const payload={version:1, exportedAt:new Date().toISOString(), links}; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`links-export-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });
  importBtn.addEventListener('click', ()=> importFile.click());
  importFile.addEventListener('change', async ()=>{ const f=importFile.files&&importFile.files[0]; if(!f) return; try{ const text=await f.text(); const res=await importLinksText(text); status.textContent = res.added? `${res.added} liens importés.` : 'Aucun nouveau lien importé.'; render(applyFilterSort(await getLinks())); }catch(e){ status.textContent=`Import invalide`; } finally { importFile.value=''; }
  });
  if(clearBtn){
    clearBtn.addEventListener('click', async ()=>{
      if(!confirm('Supprimer tous les liens ? Cette action est irréversible.')) return;
      await saveLinks([]);
      await saveBag([]);
      render([]);
    });
  }

  // Batch actions logic
  if(selectAll){
    selectAll.addEventListener('change', ()=>{
      const cbs = document.querySelectorAll('#links-list .sel');
      selectedIds = new Set();
      cbs.forEach(cb=>{ cb.checked = selectAll.checked; if(selectAll.checked && cb.dataset.id){ selectedIds.add(cb.dataset.id); }});
      updateBatchUI();
    });
  }

  async function batchModify(mod){
    const links = await getLinks();
    const next = links.map(l => selectedIds.has(l.id) ? mod(l) : l);
    await saveLinks(next);
    render(applyFilterSort(next));
    selectedIds.clear();
    if(selectAll) selectAll.checked = false;
  }
  function withTags(l, fn){ let tags=Array.isArray(l.tags)?l.tags.slice():[]; tags=fn(tags); return {...l, tags:Array.from(new Set(tags))}; }
  if(btnViewed) btnViewed.addEventListener('click', ()=> batchModify(l=> withTags(l, t=>{ t=t.filter(x=>x!=='new'&&x!=='view'); t.push('viewed'); return t; })));
  if(btnNew) btnNew.addEventListener('click', ()=> batchModify(l=> withTags(l, t=>{ t=t.filter(x=>x!=='view'&&x!=='viewed'); t.push('new'); return t; })));
  if(btnSkip) btnSkip.addEventListener('click', ()=> batchModify(l=> withTags(l, t=>{ if(!t.includes('skip')) t.push('skip'); return t; })));
  if(btnInclude) btnInclude.addEventListener('click', ()=> batchModify(l=> withTags(l, t=> t.filter(x=>x!=='skip') )));
  if(btnDelete) btnDelete.addEventListener('click', async ()=>{
    if(selectedIds.size===0) return;
    if(!confirm(`Supprimer ${selectedIds.size} lien(s) sélectionné(s) ?`)) return;
    const links = await getLinks();
    const next = links.filter(l => !selectedIds.has(l.id));
    await saveLinks(next);
    render(applyFilterSort(next));
    selectedIds.clear(); if(selectAll) selectAll.checked=false; updateBatchUI();
  });

  // No global animations on manage page (kept minimal)
  if(themeToggle){
    themeToggle.addEventListener('click', async ()=>{ try{ let { ui_theme=null } = await browser.storage.local.get({ ui_theme:null }); const next = ui_theme==='light' ? 'dark' : 'light'; await browser.storage.local.set({ ui_theme: next }); await (async()=>{ let { ui_theme } = await browser.storage.local.get({ ui_theme:'light' }); document.body.classList.remove('theme-dark','theme-light'); if(ui_theme==='dark') document.body.classList.add('theme-dark'); else document.body.classList.add('theme-light'); themeToggle.textContent = (ui_theme==='light')?'🌙':'☀️'; })(); }catch(_){ } });
  }
});
