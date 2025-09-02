function normalizeUrl(url) {
  try { const hasScheme=/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url); if(hasScheme && !/^https?:/i.test(url)) return null; if(!/^https?:\/\//i.test(url)) url=`https://${url}`; const u=new URL(url); if(!/^https?:$/.test(u.protocol)) return null; return u.toString(); } catch { return null; }
}
function makeId(){ return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
async function getLinks(){ const { links=[] } = await browser.storage.local.get({ links: [] }); return links; }
async function saveLinks(links){ await browser.storage.local.set({ links }); }
async function saveBag(bag){ await browser.storage.local.set({ shuffleBag: bag }); }

function sanitizeTags(tags){ const allow=new Set(['new','viewed','favorite','skip']); const arr=Array.isArray(tags)?tags.filter(t=>typeof t==='string'):[]; const migrated=arr.map(t=>t==='view'?'viewed':t); return Array.from(new Set(migrated.filter(t=>allow.has(t)))); }
function safeJsonParse(str){ const cleaned=String(str||'').replace(/^\uFEFF/,'').trim().replace(/,\s*([}\]])/g,'$1'); try { return JSON.parse(cleaned); } catch { return null; } }
function coerceArrayFromParsed(parsed){ if(Array.isArray(parsed)) return parsed; if(parsed&&typeof parsed==='object'){ if(Array.isArray(parsed.links)) return parsed.links; if(Array.isArray(parsed.items)) return parsed.items; if(parsed.data&&Array.isArray(parsed.data.links)) return parsed.data.links; if(parsed.links&&typeof parsed.links==='object'&&!Array.isArray(parsed.links)){ return Object.entries(parsed.links).map(([url,title])=>({url,title:String(title||'')})); } } return null; }

export async function importText(text){
  const existing=await getLinks(); const urlSet=new Set(existing.map(l=>l.url));
  let parsed=safeJsonParse(text); let arr=coerceArrayFromParsed(parsed);
  if(!arr){ const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean); arr=lines.map(line=>{ const obj=safeJsonParse(line); return obj&&typeof obj==='object'?obj:{url:line}; }); }
  if(!Array.isArray(arr)) throw new Error('Format invalide');
  let added=0; const additions=[];
  for(const raw of arr){ const candidate = (raw&&typeof raw==='object')?raw:{url:String(raw||'')}; const urlField=candidate.url||candidate.href||candidate.link||candidate.location; const normalized=normalizeUrl(String(urlField||'')); if(!normalized||urlSet.has(normalized)) continue; const item={ id:makeId(), url:normalized, title: typeof candidate.title==='string'?candidate.title.slice(0,256):'', addedAt:Number(candidate.addedAt)||Date.now(), visitedCount:Number(candidate.visitedCount)||0, lastVisitedAt:Number(candidate.lastVisitedAt)||undefined, tags:sanitizeTags(candidate.tags) }; if(!item.tags.length) item.tags=(item.visitedCount>0||item.lastVisitedAt)?['viewed']:['new']; additions.push(item); urlSet.add(normalized); added++; }
  if(!added) return { added:0 };
  const merged=[...additions, ...existing]; await saveLinks(merged); await saveBag([]); return { added, total: merged.length };
}

document.addEventListener('DOMContentLoaded', () => {
  // Theme from storage
(async ()=>{ try{ const { ui_theme=null } = await browser.storage.local.get({ ui_theme:null }); document.body.classList.remove('theme-dark','theme-light'); if(ui_theme==='dark') document.body.classList.add('theme-dark'); else if(ui_theme==='light') document.body.classList.add('theme-light'); }catch(_){ } })();
  const fileInput=document.getElementById('file');
  const importBtn=document.getElementById('import-btn');
  const closeBtn=document.getElementById('close-btn');
  const drop=document.getElementById('drop');
  const status=document.getElementById('status');

  async function handleFile(file){ if(!file){ status.textContent='Aucun fichier.'; return; } const text=await file.text(); try{ const res=await importText(text); status.textContent = res.added? `${res.added} liens importés.` : 'Aucun nouveau lien importé.'; }catch(err){ status.textContent=`Import invalide: ${err?.message||'erreur'}`; } }

  importBtn.addEventListener('click', ()=> fileInput.click());
  fileInput.addEventListener('change', ()=>{ const f=fileInput.files&&fileInput.files[0]; if(f) handleFile(f); fileInput.value=''; });
  ;['dragenter','dragover'].forEach(evt=>drop.addEventListener(evt,(e)=>{ e.preventDefault(); e.stopPropagation(); drop.classList.add('dragover'); }));
  ;['dragleave','drop'].forEach(evt=>drop.addEventListener(evt,(e)=>{ e.preventDefault(); e.stopPropagation(); drop.classList.remove('dragover'); }));
  drop.addEventListener('drop',(e)=>{ const f=e.dataTransfer?.files&&e.dataTransfer.files[0]; if(f) handleFile(f); });
  closeBtn.addEventListener('click', ()=> window.close());
});
