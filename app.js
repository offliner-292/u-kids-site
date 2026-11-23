
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ALMATY_OFFSET_MS=5*60*60*1000,DAYMS=864e5,MAXFILE=25*1024*1024;
const CLOUD_URL='https://rgvzyohqvydrcgcqgwba.supabase.co';
const CLOUD_KEY='sb_publishable_Zbdu5PNBRC0vmU4ej3iEwQ_9OmT7wWJ';
let cloudReady=false,cloudOnline=false,cloudDirty=false,cloudSaving=false,cloudTimer=0,cloudUpdatedAt=null,cloudPollTimer=0,cloudBooted=false,cloudPulling=false;

/* ---------- хранилище ---------- */
const K={users:'uroki.users',tasks:'uroki.tasks',logs:'uroki.logs',branches:'uroki.branches',groups:'uroki.groups',subscriptions:'uroki.subscriptions',lock:'uroki.lock'};
const OLD={users:'demoUsers',tasks:'demoTasks',logs:'demoLogs',branches:'demoBranches',groups:'branchGroups',subscriptions:'demoSubscriptions'};
let corrupted=false;
function load(k,fb,arr=true){
  for(const key of [K[k],OLD[k]].filter(Boolean)){
    let raw=null;try{raw=localStorage.getItem(key)}catch(e){}
    if(raw===null)continue;
    try{const v=JSON.parse(raw);if(arr?Array.isArray(v):(v&&typeof v==='object'&&!Array.isArray(v)))return v}catch(e){}
    corrupted=true;
  }
  return fb;
}
function put(k,v){try{localStorage.setItem(K[k],JSON.stringify(v))}catch(e){toast('Не удалось сохранить данные: память браузера заполнена')}}

const SEED_MENTOR={id:'MN-001',name:'Демо Ментор',phone:'+7 700 000-00-00',branch:'',group:'',role:'Ментор',last:null,active:true};
let users=load('users',[]),tasks=load('tasks',[]),logs=load('logs',[]),branches=load('branches',['Центр','Южный']);
let groups=load('groups',{'Центр':[{name:'Группа А',schedule:'Утренняя'},{name:'Группа В',schedule:'Послеобеда'}],'Южный':[{name:'Группа Б',schedule:'Утренняя'}]},false);
let subscriptions=load('subscriptions',[]);
logs=logs.filter(l=>l&&typeof l==='object');
logs.forEach(l=>{if(l.user==='Демо Ментор')l.user='Демо Ментор';if(typeof l.what==='string')l.what=l.what.replaceAll('Демо Ментор','Демо Ментор')});
if(!users.some(u=>u&&u.role==='Ментор'))users.unshift({...SEED_MENTOR});
{let seen=false;users=users.filter(u=>u&&typeof u==='object');users.forEach(u=>{if(u.role==='Ментор'){if(seen)u.role='Учитель';seen=true}});}
users.forEach(u=>{if(u.id==='MN-001'||u.name==='Демо Ментор')u.name='Демо Ментор'});
users.forEach(u=>{if(u.role==='Ментор'){u.active=true;if(u.id==='MN-001'){u.name='Демо Ментор';u.phone='+7 700 000-00-00';u.branch='';u.group=''}}});
branches=branches.filter(b=>typeof b==='string'&&b);
branches.forEach(b=>{if(!Array.isArray(groups[b]))groups[b]=[]});
subscriptions=subscriptions.filter(s=>s&&typeof s==='object');subscriptions.forEach(s=>{if(!s.id)s.id=uid('P')});
Object.values(groups).flat().forEach(g=>{if(g.schedule==='Дневная')g.schedule='Утренняя';if(g.schedule==='Вечерняя')g.schedule='Послеобеда'});
tasks=tasks.filter(t=>t&&typeof t==='object');
tasks.forEach(t=>{if(!t.id)t.id=uid('T');if(!t.branch)t.branch='Центр';if(typeof t.hasFile!=='boolean')t.hasFile=false;if(t.taskType==='Тест')t.taskType='Документ';delete t.blob});
function uid(p){return p+'-'+Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,5).toUpperCase()}
function saveAll(){put('users',users);put('tasks',tasks);put('logs',logs);put('branches',branches);put('groups',groups);put('subscriptions',subscriptions);if(cloudReady)queueCloudSave()}
saveAll();

/* ---------- облачная демо-синхронизация ---------- */

async function cloudRequest(path,options={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),path.includes('/storage/')?60000:12000);
  let response;
  try{
    response=await fetch(CLOUD_URL+path,{...options,headers:{...(options.headers||{}),apikey:CLOUD_KEY},cache:'no-store',signal:controller.signal});
  }finally{clearTimeout(timeout)}
  if(!response.ok){const detail=await response.text().catch(()=> '');throw new Error(`Supabase ${response.status}: ${detail.slice(0,220)}`)}
  return response;
}
function cloudPayload(){return {users,tasks,logs,branches,groups,subscriptions}}
function writeLocalPayload(p){
  put('users',p.users);put('tasks',p.tasks);put('logs',p.logs);put('branches',p.branches);put('groups',p.groups);put('subscriptions',p.subscriptions||[]);
}
async function readCloudRow(){
  const response=await cloudRequest('/rest/v1/ukids_demo_state?select=payload,updated_at&id=eq.1');
  const rows=await response.json();
  if(!Array.isArray(rows)||!rows[0])throw new Error('Не найдена строка демо-базы');
  return rows[0];
}
function updateCloudBadge(){
  const el=$('cloudStatus');if(!el)return;
  el.innerHTML=`<i class="dot" style="background:${cloudOnline?'#36a276':'#c95d5d'}"></i> Доступ 06:00–20:00 · ${cloudOnline?'облако':'локально'}`;
}
function applyCloudPayload(p,updatedAt){
  if(!p||!Array.isArray(p.users)||!p.users.length)return false;
  users=p.users.filter(x=>x&&typeof x==='object');
  if(!users.some(x=>x.role==='Ментор'))users.unshift({...SEED_MENTOR});
  tasks=Array.isArray(p.tasks)?p.tasks.filter(x=>x&&typeof x==='object'):[];
  logs=Array.isArray(p.logs)?p.logs.filter(x=>x&&typeof x==='object'):[];
  branches=Array.isArray(p.branches)&&p.branches.length?p.branches.filter(x=>typeof x==='string'&&x):['Центр','Южный'];
  groups=p.groups&&typeof p.groups==='object'&&!Array.isArray(p.groups)?p.groups:{'Центр':[{name:'Группа А',schedule:'Утренняя'},{name:'Группа В',schedule:'Послеобеда'}],'Южный':[{name:'Группа Б',schedule:'Утренняя'}]};
  subscriptions=Array.isArray(p.subscriptions)?p.subscriptions.filter(s=>s&&typeof s==='object'):[];subscriptions.forEach(s=>{if(!s.id)s.id=uid('P')});
  branches.forEach(b=>{if(!Array.isArray(groups[b]))groups[b]=[]});
  cloudUpdatedAt=updatedAt||cloudUpdatedAt;
  writeLocalPayload(cloudPayload());
  return true;
}
function refreshAfterCloud(){
  if(!cloudBooted)return;
  if(me){
    const next=users.find(x=>x.id===me.id&&x.active!==false&&x.passHash);
    if(!next){me=null;try{sessionStorage.removeItem('uroki.sid')}catch(e){}loginScreen()}
    else{me=next;next.mustChange?changeScreen():render()}
  }else boot();
}
async function writeCloudState(){
  if(!cloudReady||cloudSaving||!cloudDirty)return false;
  cloudSaving=true;cloudDirty=false;
  try{
    const response=await cloudRequest('/rest/v1/ukids_demo_state?id=eq.1&select=updated_at',{method:'PATCH',headers:{'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify({payload:cloudPayload(),updated_at:new Date().toISOString()})});
    const rows=await response.json();if(rows[0]?.updated_at)cloudUpdatedAt=rows[0].updated_at;
    cloudOnline=true;return true;
  }catch(e){
    cloudDirty=true;cloudOnline=false;console.warn('Не удалось синхронизировать демо-базу',e);return false;
  }finally{
    cloudSaving=false;updateCloudBadge();
    if(cloudDirty&&cloudReady){clearTimeout(cloudTimer);cloudTimer=setTimeout(writeCloudState,8000)}
  }
}
function queueCloudSave(){
  cloudDirty=true;clearTimeout(cloudTimer);cloudTimer=setTimeout(writeCloudState,500);
}
async function pollCloudState(){
  if(!cloudReady||cloudSaving||cloudDirty||cloudPulling||document.hidden)return;
  cloudPulling=true;
  try{
    const row=await readCloudRow();
    cloudOnline=true;
    if(row.updated_at&&row.updated_at!==cloudUpdatedAt&&applyCloudPayload(row.payload,row.updated_at))refreshAfterCloud();
  }catch(e){cloudOnline=false;console.warn('Не удалось обновить демо-базу',e)}
  finally{cloudPulling=false;updateCloudBadge()}
}
async function startCloud(){
  try{
    const row=await readCloudRow(),p=row.payload||{};
    if(Array.isArray(p.users)&&p.users.length){
      if(!applyCloudPayload(p,row.updated_at))throw new Error('Некорректное состояние демо-базы');
      cloudReady=true;cloudOnline=true;
    }else{
      // Do not upload this browser's old local records into the public demo database.
      users=[{...SEED_MENTOR}];tasks=[];logs=[];branches=['Центр','Южный'];
      groups={'Центр':[{name:'Группа А',schedule:'Утренняя'},{name:'Группа В',schedule:'Послеобеда'}],'Южный':[{name:'Группа Б',schedule:'Утренняя'}]};subscriptions=[];
      try{sessionStorage.removeItem('uroki.sid')}catch(e){}
      writeLocalPayload(cloudPayload());cloudUpdatedAt=row.updated_at;cloudReady=true;cloudOnline=true;cloudDirty=true;
      await writeCloudState();
    }
    cloudPollTimer=setInterval(pollCloudState,5000);
  }catch(e){
    cloudReady=false;cloudOnline=false;console.warn('Облачная демо-база пока недоступна',e);
  }finally{cloudBooted=true;updateCloudBadge()}
}

/* ---------- время (Алматы) ---------- */
let skew=0;
function syncClock(){try{fetch(location.href,{method:'HEAD',cache:'no-store'}).then(r=>{const d=r.headers.get('Date');if(d&&!isNaN(new Date(d)))skew=new Date(d)-Date.now()}).catch(()=>{})}catch(e){}}
syncClock();setInterval(syncClock,10*60*1000);
const now=()=>new Date(Date.now()+skew);
const almatyDate=d=>new Date((d||now()).getTime()+ALMATY_OFFSET_MS);
const fmtAlmaty=(d,options)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',...options}).format(almatyDate(d));
const dayKey=d=>{const x=almatyDate(d);return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}-${String(x.getUTCDate()).padStart(2,'0')}`};
const hourNow=()=>almatyDate().getUTCHours();
const timeNow=()=>{const x=almatyDate();return `${String(x.getUTCHours()).padStart(2,'0')}:${String(x.getUTCMinutes()).padStart(2,'0')}`};
const isOpen=()=>{const h=hourNow();return h>=6&&h<20};
const displayDay=d=>d?new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'}).format(new Date(d+'T12:00:00Z')):'Дата не задана';
const dayLabel=d=>d===dayKey()?'Сегодня':displayDay(d);
function greeting(){const h=hourNow();return h>=5&&h<12?'Доброе утро':h>=12&&h<18?'Добрый день':h>=18&&h<23?'Добрый вечер':'Доброй ночи'}
function fmtTs(v){
  if(typeof v!=='number')return v?esc(v):'Ещё не входил';
  const d=new Date(v),t=fmtAlmaty(d,{hour:'2-digit',minute:'2-digit',hour12:false}),k=dayKey(d);
  if(k===dayKey())return 'Сегодня, '+t;
  if(k===dayKey(new Date(now().getTime()-DAYMS)))return 'Вчера, '+t;
  return fmtAlmaty(d,{day:'numeric',month:'short'})+', '+t;
}

/* ---------- состояние ---------- */
let me=null,page='Главная',search='',groupFilter='Все группы',taskBranchFilter='Все филиалы',typeFilter='Все типы',sortBy='dateDesc',busy=false,confirmCb=null,openDayKey=null,selectedGroupBranch='',rosterGroupIndex=null;
const t0=dayKey().split('-');const cal={y:+t0[0],m:+t0[1]-1};
const isM=()=>!!me&&me.role==='Ментор';
function need(){const m=me&&users.find(u=>u.id===me.id);if(m&&m.role==='Ментор'&&m.active!==false)return true;toast('Это действие доступно только ментору');return false}
const icons={Главная:'⌂',Задания:'▤',Календарь:'▦',Пользователи:'♙',Филиалы:'⌖',Группы:'▦',Абонементы:'▣',Журнал:'◷',Настройки:'⚙',Профиль:'◉'};
const MENTOR_PAGES=['Пользователи','Филиалы','Группы','Абонементы','Журнал','Настройки'];
const initials=s=>String(s).split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();

function log(what,kind){
  logs.unshift({user:me?me.name:'—',uid:me?me.id:'',branch:me?me.branch:'',what,kind:kind||'',ts:Date.now(),day:dayKey()});
  const lim=Date.now()-30*DAYMS;
  logs=logs.filter(l=>!l.ts||l.ts>=lim).slice(0,5000);
}

/* ---------- телефоны и пароли ---------- */
const digits=s=>String(s||'').replace(/\D/g,'');
function normPhone(s){let d=digits(s);if(d.length===11&&d[0]==='8')d='7'+d.slice(1);return d.length===11&&d[0]==='7'?d:null}
const fmtPhone=d=>`+7 ${d.slice(1,4)} ${d.slice(4,7)}-${d.slice(7,9)}-${d.slice(9,11)}`;
const b64=buf=>btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function hashPw(pw,salt){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);
  return b64(await crypto.subtle.deriveBits({name:'PBKDF2',salt:unb64(salt),iterations:150000,hash:'SHA-256'},key,256));
}
async function setPw(u,pw,must){u.salt=b64(crypto.getRandomValues(new Uint8Array(16)));u.passHash=await hashPw(pw,u.salt);u.mustChange=!!must}
function pwError(a,b){if(!a||a.length<8)return 'Пароль должен быть не короче 8 символов';if(b!==undefined&&a!==b)return 'Пароли не совпадают';return ''}
function getLock(){try{return JSON.parse(localStorage.getItem(K.lock))||{n:0,until:0}}catch(e){return {n:0,until:0}}}
function setLock(v){try{localStorage.setItem(K.lock,JSON.stringify(v))}catch(e){}}

/* ---------- файлы (IndexedDB) ---------- */
let dbp;
const db=()=>dbp||(dbp=new Promise((res,rej)=>{const r=indexedDB.open('uroki',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
async function localFilePut(id,blob){const d=await db();return new Promise((res,rej)=>{const t=d.transaction('files','readwrite');t.objectStore('files').put(blob,id);t.oncomplete=res;t.onerror=()=>rej(t.error)})}
async function fput(id,blob){
  await localFilePut(id,blob);
  if(cloudReady)await cloudRequest('/storage/v1/object/ukids-demo-files/'+encodeURIComponent(id),{method:'POST',headers:{'Content-Type':blob.type||'application/octet-stream','x-upsert':'true'},body:blob});
}
async function fget(id){
  if(cloudReady){try{const response=await cloudRequest('/storage/v1/object/ukids-demo-files/'+encodeURIComponent(id));const blob=await response.blob();await localFilePut(id,blob);return blob}catch(e){}}
  const d=await db();return new Promise((res,rej)=>{const r=d.transaction('files').objectStore('files').get(id);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error)})
}
async function fdel(id){
  if(cloudReady){try{await cloudRequest('/storage/v1/object/ukids-demo-files',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[id]})})}catch(e){console.warn('Не удалось удалить файл из облака',e)}}
  try{const d=await db();await new Promise(res=>{const t=d.transaction('files','readwrite');t.objectStore('files').delete(id);t.oncomplete=res;t.onerror=res})}catch(e){}
}
const EXT={
  'Картинка':['jpg','jpeg','png','gif','webp','bmp','avif','tif','tiff'],
  'Документ':['pdf','doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp','rtf','txt','csv'],
  'Музыка':['mp3','wav','m4a','aac','ogg','oga','opus','flac','wma','mid','midi','mp4']
};
const ACCEPT={
  'Картинка':'.jpg,.jpeg,.png,.gif,.webp,.bmp,.avif,.tif,.tiff',
  'Документ':'.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.csv',
  'Музыка':'.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.wma,.mid,.midi,.mp4'
};
const FORMAT_HINT={
  'Картинка':'JPG, PNG, GIF, WebP, BMP, AVIF, TIFF',
  'Документ':'PDF, Word, Excel, PowerPoint, OpenDocument, RTF, TXT, CSV',
  'Музыка':'MP3, WAV, M4A, AAC, OGG, OPUS, FLAC, WMA, MIDI, MP4'
};
const MIME={
  pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt:'application/vnd.oasis.opendocument.text',ods:'application/vnd.oasis.opendocument.spreadsheet',odp:'application/vnd.oasis.opendocument.presentation',
  rtf:'application/rtf',txt:'text/plain',csv:'text/csv',
  jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',bmp:'image/bmp',avif:'image/avif',tif:'image/tiff',tiff:'image/tiff',
  mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',aac:'audio/aac',ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/opus',flac:'audio/flac',wma:'audio/x-ms-wma',mid:'audio/midi',midi:'audio/midi',mp4:'video/mp4'
};
const extOf=n=>(String(n).match(/\.([^.]+)$/)?.[1]||'').toLowerCase();
function iconFor(ext,cat){
  if(EXT['Картинка'].includes(ext))return 'img';
  if(EXT['Музыка'].includes(ext))return 'music';
  if(['doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp','rtf','txt','csv'].includes(ext))return 'doc';
  if(ext==='pdf')return 'pdf';
  return {'Картинка':'img','Документ':'doc','Музыка':'music'}[cat]||'doc';
}
async function sniff(f,ext){
  const b=new Uint8Array(await f.slice(0,12).arrayBuffer());const h=(...a)=>a.every((v,i)=>b[i]===v);
  switch(ext){
    case 'pdf':return h(0x25,0x50,0x44,0x46);
    case 'png':return h(0x89,0x50,0x4e,0x47);
    case 'jpg':case 'jpeg':return h(0xff,0xd8,0xff);
    case 'gif':return h(0x47,0x49,0x46,0x38);
    case 'webp':return h(0x52,0x49,0x46,0x46)&&b[8]===0x57&&b[9]===0x45;
    case 'bmp':return h(0x42,0x4d);
    case 'avif':return b[4]===0x66&&b[5]===0x74&&b[6]===0x79&&b[7]===0x70&&String.fromCharCode(...b.slice(8,12)).startsWith('avif');
    case 'tif':case 'tiff':return h(0x49,0x49,0x2a,0x00)||h(0x4d,0x4d,0x00,0x2a);
    case 'docx':case 'xlsx':case 'pptx':case 'odt':case 'ods':case 'odp':return h(0x50,0x4b,3,4);
    case 'doc':case 'xls':case 'ppt':return h(0xd0,0xcf,0x11,0xe0);
    case 'rtf':return h(0x7b,0x5c,0x72,0x74,0x66);
    case 'txt':case 'csv':return !b.includes(0x00);
    case 'mp3':return h(0x49,0x44,0x33)||(b[0]===0xff&&(b[1]&0xe0)===0xe0);
    case 'wav':return h(0x52,0x49,0x46,0x46)&&b[8]===0x57;
    case 'm4a':case 'mp4':return b[4]===0x66&&b[5]===0x74&&b[6]===0x79&&b[7]===0x70;
    case 'aac':return h(0xff,0xf1)||h(0xff,0xf9);
    case 'ogg':case 'oga':case 'opus':return h(0x4f,0x67,0x67,0x53);
    case 'flac':return h(0x66,0x4c,0x61,0x43);
    case 'wma':return h(0x30,0x26,0xb2,0x75,0x8e,0x66,0xcf,0x11);
    case 'mid':case 'midi':return h(0x4d,0x54,0x68,0x64);
  }
  return false;
}
async function decodesAsImage(file){
  if(typeof createImageBitmap==='function'){
    try{const image=await createImageBitmap(file);image.close();return true}catch(e){return false}
  }
  return new Promise(resolve=>{
    const url=URL.createObjectURL(file),image=new Image();
    image.onload=()=>{URL.revokeObjectURL(url);resolve(true)};
    image.onerror=()=>{URL.revokeObjectURL(url);resolve(false)};
    image.src=url;
  });
}
async function checkFile(f,cat){
  const ext=extOf(f.name);
  if(!EXT[cat].includes(ext))return 'Файл не соответствует выбранному типу';
  if(!f.size)return 'Файл пустой';
  if(f.size>MAXFILE)return 'Файл слишком большой (максимум 25 МБ)';
  if(!(await sniff(f,ext))&&!(cat==='Картинка'&&await decodesAsImage(f)))return 'Не удалось открыть файл как изображение. Проверьте формат файла и его расширение';
  return '';
}
const sizeText=n=>n>=1048576?(n/1048576).toFixed(1)+' МБ':Math.max(1,Math.round(n/1024))+' КБ';

/* ---------- видимость заданий ---------- */
const normAssignment=v=>String(v||'').trim().replace(/\s*·\s*(Утренняя|Послеобеда)$/i,'').toLocaleLowerCase('ru');
const sameGroup=t=>String(t.branch||'Центр').trim().toLocaleLowerCase('ru')===String(me.branch||'').trim().toLocaleLowerCase('ru')&&normAssignment(t.group)===normAssignment(me.group);
const assignedToMe=t=>!t.userId||String(t.userId)===String(me.id);
function visibleTasks(){return isM()?tasks:tasks.filter(t=>t.accessDate===dayKey()&&(t.userId?String(t.userId)===String(me.id):sameGroup(t)))}
const canSee=t=>isM()||(t.accessDate===dayKey()&&(t.userId?String(t.userId)===String(me.id):sameGroup(t)));
function gate(){if(!isM()&&!isOpen()){toast('Файлы доступны с 06:00 до 20:00 по Алматы');return false}return true}

/* ---------- окна ---------- */
function openModal(id,html,opts={}){
  closeModal(id);
  const o=document.createElement('div');o.className='overlay show';o.id=id;if(opts.closable!==false)o.dataset.closable='1';
  o.innerHTML=`<div class="modal${opts.wide?' wide':''}" role="dialog" aria-modal="true" aria-labelledby="${id}-t" tabindex="-1">${html}</div>`;
  o._prev=document.activeElement;document.body.appendChild(o);
  (o.querySelector('input:not([type=hidden]):not([disabled]),select,textarea')||o.querySelector('.modal')).focus();
  return o;
}
function closeEl(o){if(!o)return;const p=o._prev;if(o._cleanup)o._cleanup();o.remove();if(p&&p.focus&&document.contains(p))p.focus()}
function closeModal(id){closeEl($(id))}
function closeAllModals(){document.querySelectorAll('.overlay').forEach(o=>closeEl(o))}
function confirmBox(title,text,okLabel,cb){confirmCb=cb;openModal('mConfirm',`<h2 id="mConfirm-t">${esc(title)}</h2><p>${esc(text)}</p><div class="modalfoot"><button type="button" class="btn secondary" data-act="close">Отмена</button><button type="button" class="btn danger" data-act="confirmYes">${esc(okLabel)}</button></div>`)}
function ferr(f,msg){const e=f.querySelector('.err');if(e)e.textContent=msg;return false}
let toastT;function toast(s){const t=$('toast');t.textContent=s;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2600)}

/* ---------- экраны входа ---------- */
function authShell(inner){return `<div class="welcome"><div class="login"><div class="brand"><img class="brandlogo" src="ukids-logo.jpg" alt="U kids"></div>${inner}<div class="notice" role="note"><b>Публичная демо-версия.</b> Данные общие для посетителей. Используйте вымышленные имена, телефоны и уникальные пароли; не добавляйте сведения о детях или личные файлы.${cloudOnline?' Облако подключено.':' Сейчас доступен только локальный режим.'}</div></div></div>`}
function loginScreen(){
  $('app').innerHTML=authShell(`<h1>Рады видеть вас</h1><p class="sub">Войдите в кабинет учебного центра.</p><form data-form="login" novalidate><label for="l_phone">Номер телефона</label><input id="l_phone" name="phone" type="tel" autocomplete="username" placeholder="+7 7XX XXX-XX-XX"><label for="l_pw">Пароль</label><input id="l_pw" name="password" type="password" autocomplete="current-password" placeholder="Введите пароль"><div class="err" id="lerr" role="alert"></div><button class="btn" type="submit">Войти в кабинет</button></form><div class="loginfoot">Доступ только по приглашению ментора<br><br>Забыли пароль? Обратитесь к ментору — он выдаст временный.</div>`);
  applyProtect();
}
function setupScreen(){
  const m=users.find(u=>u.role==='Ментор');
  $('app').innerHTML=authShell(`<h1>Первый запуск</h1><p class="sub">Задайте пароль ментора. Вход выполняется по номеру <b>${esc(m.phone)}</b>.</p><form data-form="setup" novalidate><label for="s_pw">Новый пароль (не короче 8 символов)</label><input id="s_pw" name="pw" type="password" autocomplete="new-password"><label for="s_pw2">Повторите пароль</label><input id="s_pw2" name="pw2" type="password" autocomplete="new-password"><div class="err" role="alert"></div><button class="btn" type="submit">Сохранить и войти</button></form>`);
  applyProtect();
}
function changeScreen(){
  $('app').innerHTML=authShell(`<h1>Смените пароль</h1><p class="sub">Вы вошли с временным паролем. Придумайте свой.</p><form data-form="change" novalidate><label for="c_pw">Новый пароль (не короче 8 символов)</label><input id="c_pw" name="pw" type="password" autocomplete="new-password"><label for="c_pw2">Повторите пароль</label><input id="c_pw2" name="pw2" type="password" autocomplete="new-password"><div class="err" role="alert"></div><button class="btn" type="submit">Сохранить</button></form><div class="loginfoot"><a href="#" data-act="logout" style="color:var(--green)">Выйти</a></div>`);
  applyProtect();
}
function startSession(u){
  me=u;try{sessionStorage.setItem('uroki.sid',u.id)}catch(e){}
  u.last=Date.now();log('Вошёл(а) в кабинет','login');saveAll();page='Главная';
  u.mustChange?changeScreen():shell();
}
function logout(){
  if(me)log('Вышел(а) из кабинета','login');saveAll();
  me=null;try{sessionStorage.removeItem('uroki.sid')}catch(e){}
  closeAllModals();page='Главная';search='';loginScreen();
}
function boot(){
  if(!(window.crypto&&crypto.subtle&&window.indexedDB)){$('app').innerHTML=authShell('<h1>Нужен защищённый адрес</h1><p class="sub">Откройте сайт по адресу с https:// — иначе вход и хранение файлов недоступны.</p>');return}
  const mentor=users.find(u=>u.role==='Ментор');
  if(!mentor.passHash)return setupScreen();
  let sid=null;try{sid=sessionStorage.getItem('uroki.sid')}catch(e){}
  const u=sid&&users.find(x=>x.id===sid&&x.active!==false&&x.passHash);
  if(u){me=u;return u.mustChange?changeScreen():shell()}
  loginScreen();
  if(corrupted)toast('Часть сохранённых данных была повреждена и сброшена');
}

/* ---------- оболочка ---------- */
function avatarContent(u){return u.photoData?`<img src="${u.photoData}" alt="Фото профиля" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:esc(initials(u.name))}
function shell(){
  const menu=isM()?['Главная','Задания','Календарь','Пользователи','Филиалы','Группы','Абонементы','Журнал','Настройки','Профиль']:['Главная','Задания','Профиль'];
  if(page!=='Профиль'&&!menu.includes(page))page='Главная';
  $('app').innerHTML=`<div class="app"><aside class="side"><div class="brand" role="button" tabindex="0" data-act="go" data-page="Главная" title="На главную" style="cursor:pointer"><img class="brandlogo" src="ukids-logo.jpg" alt="U kids"></div><div class="workspace"><b>${isM()?'U kids · Администратор':esc(me.branch)}</b>Алматы · рабочее пространство</div><div class="navlabel">Меню</div><nav class="nav${menu.length>4?' nav-many':''}">${menu.map(x=>`<button class="${page===x?'active':''}" data-act="go" data-page="${x}"><span class="ico">${icons[x]}</span><span>${x}</span></button>`).join('')}</nav><div class="sidebottom"><div class="profile-mini" role="button" tabindex="0" data-act="go" data-page="Профиль" title="Профиль"><div class="avatar">${avatarContent(me)}</div><div><b>${esc(me.name)}</b><small>${isM()?'Администратор сайта':esc(me.role)+' · '+esc(me.id)}</small></div></div></div></aside><main class="main"><div class="top"><div class="crumb">U kids <span style="padding:0 6px">/</span> ${page}</div><div class="topright"><div class="status" id="cloudStatus"><i class="dot" style="background:${cloudOnline?'#36a276':'#c95d5d'}"></i> Доступ 06:00–20:00 · ${cloudOnline?'облако':'локально'}</div><div class="date" id="date"></div><button class="btn secondary small" data-act="logout">Выйти</button><div class="avatar" role="button" tabindex="0" data-act="go" data-page="Профиль" title="Профиль">${avatarContent(me)}</div></div></div><div id="content"></div></main></div>`;
  $('date').textContent=fmtAlmaty(now(),{weekday:'short',day:'numeric',month:'long'});
  render();applyProtect();
}
function go(p){
  if(!me)return;
  if(MENTOR_PAGES.includes(p)&&!need())return;
  page=p;renderNav();render();
}
function renderNav(){document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.textContent.trim()===page))}
function render(){
  const c=$('content');if(!c||!me)return;
  if(MENTOR_PAGES.includes(page)&&!isM())page='Главная';
  if(page==='Календарь'&&!isM())page='Главная';
  c.innerHTML=({Главная:home,Задания:taskPage,Календарь:calendarPage,Пользователи:userPage,Журнал:logPage,Филиалы:branchPage,Группы:groupsPage,Абонементы:subscriptionsPage,Профиль:profilePage,Настройки:settingsPage}[page]||home)();
}

/* ---------- защита ---------- */
function applyProtect(){
  const on=!!me&&!isM();document.body.classList.toggle('prot',on);
  const w=$('wm');
  if(on){
    const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='300' height='180'><text x='150' y='90' text-anchor='middle' transform='rotate(-25 150 90)' font-family='sans-serif' font-size='15' fill='rgba(23,33,31,0.10)'>${esc(me.name+' · '+me.id)}</text></svg>`;
    w.style.backgroundImage=`url("data:image/svg+xml,${encodeURIComponent(svg)}")`;w.style.display='block';
  }else w.style.display='none';
}
const hideP=()=>{if(me&&!isM()&&!$('mPreview'))$('privacy').classList.add('show')};
const showP=()=>$('privacy').classList.remove('show');
window.addEventListener('blur',hideP);
window.addEventListener('focus',()=>{if(!document.hidden)showP()});
document.addEventListener('visibilitychange',()=>document.hidden?hideP():showP());

/* ---------- главная ---------- */
function scope(){
  const act=users.filter(u=>u.active!==false);
  return isM()?{users:act,tasks}:{users:act.filter(u=>u.branch===me.branch),tasks:tasks.filter(t=>(t.branch||'Центр')===me.branch)};
}
function home(){
  const today=dayKey(),sc=scope(),todays=sc.tasks.filter(t=>t.accessDate===today);
  const dl=logs.filter(l=>l.kind==='download'&&l.day===today&&(isM()||l.branch===me.branch)).length;
  const first=me.name.split(' ')[0];
  const who=first;
  const elapsed=hourNow()+almatyDate().getUTCMinutes()/60,pct=Math.max(0,Math.min(100,Math.round((elapsed-6)/14*100)));
  const list=visibleTasks().filter(t=>t.accessDate===today).slice(0,4);
  const fourth=isM()?`<div class="stat" role="button" tabindex="0" data-act="viewGroups"><div class="stat-label">Активные филиалы <span class="spark">⌖</span></div><div class="stat-num">${branches.length}</div><div class="stat-note">${esc(branches.join(', '))||'—'}</div></div>`:`<div class="stat" role="button" tabindex="0" data-act="viewGroups"><div class="stat-label">Группы <span class="spark">⌖</span></div><div class="stat-num">${(groups[me.branch]||[]).length}</div><div class="stat-note">в вашем филиале</div></div>`;
  return `<div class="heading"><div><h1>${greeting()}, ${esc(who)} 👋</h1><p class="sub">${isM()?'Вот что происходит в вашем центре сегодня.':'Вот что происходит в филиале «'+esc(me.branch)+'» сегодня.'}</p></div>${isM()?'<button class="btn" data-act="openTask">＋ Добавить задание</button>':''}</div>
<div class="stats"><div class="stat" role="button" tabindex="0" data-act="viewColleagues"><div class="stat-label">Пользователи <span class="spark">↗</span></div><div class="stat-num">${sc.users.length}</div><div class="stat-note">${isM()?'в учебном центре':'в вашем филиале'}</div></div>
<div class="stat" role="button" tabindex="0" data-act="go" data-page="Задания"><div class="stat-label">Задания на сегодня <span class="spark">▤</span></div><div class="stat-num">${todays.length}</div><div class="stat-note">${isM()?'для разных групп':'для вашего филиала'}</div></div>
<div class="stat" role="button" tabindex="0" data-act="viewDownloads"><div class="stat-label">Скачивания сегодня <span class="spark">↓</span></div><div class="stat-num">${dl}</div><div class="stat-note">за текущий день</div></div>${fourth}</div>
<div class="grid"><section class="card"><div class="cardhead"><h2>Задания на сегодня</h2><button class="link" data-act="go" data-page="Задания">Все задания →</button></div>${list.map(taskRow).join('')||'<p class="sub">На сегодня заданий пока нет.</p>'}</section>
<section class="card"><div class="cardhead"><h2>Доступ к заданиям</h2><span class="pill" style="background:${isOpen()?'var(--mint)':'#fff0ee'};color:${isOpen()?'var(--green)':'#b84f4f'}">${isOpen()?'Открыт':'Закрыт'}</span></div><div class="today"><div class="todaytop"><b>${fmtAlmaty(now(),{day:'numeric',month:'long'})}</b><span>● ${isOpen()?'Открыто':'Закрыто'}</span></div><div class="progress"><i style="width:${pct}%"></i></div><div class="muted">${isOpen()?'Доступ закрывается в 20:00':hourNow()<6?'Доступ откроется в 06:00':'Доступ откроется завтра в 06:00'} · Алматы</div></div>${isM()?`<div class="cardhead" style="margin:20px 0 14px"><h2>Последние события</h2><button class="link" data-act="go" data-page="Журнал">Журнал →</button></div><div class="activity">${logs.slice(0,3).map(eventRow).join('')||'<p class="sub">Событий пока нет.</p>'}</div>`:''}</section></div>`;
}
function viewColleagues(){
  const list=users.filter(u=>u.active!==false&&(isM()||u.branch===me.branch)).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  const title=isM()?'Пользователи учебного центра':`Коллеги · ${me.branch}`;
  const items=list.map(u=>{
    const context=isM()?[u.branch,u.group].filter(Boolean).join(' · '):u.group;
    return `<div class="task"><div class="avatar">${esc(initials(u.name))}</div><div class="taskinfo"><b>${esc(u.name)}</b><small>${esc(u.role||'Участник')}${context?' · '+esc(context):''}</small></div></div>`;
  }).join('')||'<p class="sub">В филиале пока нет активных пользователей.</p>';
  openModal('mColleagues',`<h2 id="mColleagues-t">${esc(title)}</h2><p>${isM()?'Активные участники и их группы.':'Активные участники вашего филиала.'}</p><div>${items}</div><div class="modalfoot"><button type="button" class="btn secondary" data-act="close">Закрыть</button></div>`);
}
function viewTodayDownloads(){
  const rows=logs.filter(l=>l.kind==='download'&&l.day===dayKey()&&(isM()||l.branch===me.branch)).sort((a,b)=>(b.ts||0)-(a.ts||0));
  const items=rows.map(l=>`<div class="event"><i class="eventdot"></i><div><b>${esc(l.user||'Пользователь')}</b><small>${esc(l.what||'Скачал(а) файл')}${l.ts?' · '+fmtTs(l.ts):''}${isM()&&l.branch?' · '+esc(l.branch):''}</small></div></div>`).join('');
  openModal('mDownloads',`<h2 id="mDownloads-t">Скачивания сегодня</h2><p>${isM()?'По всему учебному центру.':`В филиале «${esc(me.branch)}».`}</p><div class="activity">${items||'<p class="sub">Сегодня скачиваний пока нет.</p>'}</div><div class="modalfoot"><button type="button" class="btn secondary" data-act="close">Закрыть</button></div>`);
}
function viewGroupChildren(bi,gi){
  const b=branches[bi],g=(groups[b]||[])[gi];if(!g)return;
  if(!isM()&&(b!==me.branch||g.name!==me.group))return toast('Можно просматривать детей только своей группы');
  const kids=ensureChildren(g);
  const rows=kids.map(c=>`<div class="task"><div class="avatar">${esc(initials(c.fullName||'Ребёнок'))}</div><div class="taskinfo"><b>${esc(c.fullName||'Без имени')}</b><small>${esc(c.status||'Ходит')}</small></div></div>`).join('');
  const mentorAction=isM()?`<button type="button" class="btn" data-act="openRoster" data-i="${bi}" data-j="${gi}">Открыть карточку группы</button>`:'';
  openModal('mGroupChildren',`<h2 id="mGroupChildren-t">Дети · ${esc(g.name)}</h2><p>${esc(b)} · ${esc(g.schedule||'Расписание не указано')}</p><div>${rows||'<p class="sub">В этой группе пока нет детей.</p>'}</div><div class="modalfoot"><button type="button" class="btn secondary" data-act="close">Назад</button>${mentorAction}</div>`,{wide:true});
}
function viewBranchGroups(){
  const branchList=isM()?branches:[me.branch].filter(Boolean);
  const html=branchList.map(b=>{
    const bi=branches.indexOf(b);
    const items=(groups[b]||[]).map((g,j)=>{
      const canView=isM()||g.name===me.group;
      const row=`<div class="taskinfo"><b>${esc(g.name)}</b><small>${esc(g.schedule||'Расписание не указано')} · ${ensureChildren(g).length} детей</small></div><span class="pill">${canView?'Посмотреть детей →':'Группа'}</span>`;
      return canView?`<button type="button" class="task" style="width:100%;border:0;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer" data-act="viewGroupChildren" data-i="${bi}" data-j="${j}">${row}</button>`:`<div class="task">${row}</div>`;
    }).join('');
    return `<section style="margin-bottom:16px"><h3 style="margin:0 0 8px">${esc(b)}</h3>${items||'<p class="sub">В филиале пока нет групп.</p>'}</section>`;
  }).join('');
  openModal('mBranchGroups',`<h2 id="mBranchGroups-t">${isM()?'Группы по филиалам':`Группы · ${esc(me.branch)}`}</h2><div>${html}</div><div class="modalfoot"><button type="button" class="btn secondary" data-act="close">Закрыть</button></div>`,{wide:true});
}

function eventRow(l){return `<div class="event"><i class="eventdot"></i><div><b>${esc(l.user)} · ${esc(l.what)}</b><small>${l.ts?fmtTs(l.ts):esc(l.time||'')}</small></div></div>`}

/* ---------- задания ---------- */
function taskRow(t){
  const type=['img','doc','pdf','music'].includes(t.type)?t.type:'doc',id=esc(t.id);
  const icon=type==='img'
    ?'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3 3 2-2 6 5"/></svg>'
    :type==='music'
      ?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="18" cy="16" rx="3" ry="2.5"/><path d="M9 8 21 6"/></svg>'
      :'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 20V5a1.5 1.5 0 0 1 1-1.5Z"/><path d="M14 4v5h5M9 13h6M9 17h6"/></svg>';
  return `<div class="task"><div class="fileico ${type}">${icon}</div><div class="taskinfo"><b>${esc(t.name)}</b><small>${esc(t.taskType||'Задание')} · ${esc(t.group)} · ${esc(t.branch||'Центр')} · ${esc(t.time||'')} · ${esc(t.size||'—')}${t.userId?' · персональный доступ':''}</small></div><span class="pill">${esc(dayLabel(t.accessDate))}</span><button class="action" title="Просмотр" data-act="preview" data-id="${id}">👁</button>${isM()?`<button class="action" title="Изменить" data-act="editTask" data-id="${id}">✎</button><button class="action" title="Удалить" data-act="delTask" data-id="${id}">🗑</button>`:''}<button class="action" title="Скачать" data-act="download" data-id="${id}">↓</button></div>`;
}
function allGroupNames(){return [...new Set(Object.values(groups).flat().map(g=>g.name))]}
function taskPage(){
  const m=isM(),q=search.toLowerCase();
  if(taskBranchFilter!=='Все филиалы'&&!branches.includes(taskBranchFilter))taskBranchFilter='Все филиалы';
  const taskGroups=taskBranchFilter==='Все филиалы'?allGroupNames():[...new Set((groups[taskBranchFilter]||[]).map(g=>g.name))];
  if(groupFilter!=='Все группы'&&!taskGroups.includes(groupFilter))groupFilter='Все группы';
  let list=visibleTasks().filter(t=>t.name.toLowerCase().includes(q)&&(!m||taskBranchFilter==='Все филиалы'||(t.branch||'Центр')===taskBranchFilter)&&(!m||groupFilter==='Все группы'||t.group===groupFilter)&&(typeFilter==='Все типы'||t.taskType===typeFilter));
  const cmp={dateDesc:(a,b)=>b.accessDate.localeCompare(a.accessDate),dateAsc:(a,b)=>a.accessDate.localeCompare(b.accessDate),name:(a,b)=>a.name.localeCompare(b.name,'ru'),group:(a,b)=>a.group.localeCompare(b.group,'ru')||b.accessDate.localeCompare(a.accessDate)}[sortBy];
  if(m)list=[...list].sort(cmp);
  const opt=(v,cur)=>`<option ${v===cur?'selected':''}>${esc(v)}</option>`;
  return `<div class="heading"><div><h1>Задания</h1><p class="sub">${m?'Все задания: прошлые, сегодняшние и будущие. Пользователи видят задание только в день открытия.':'Задания вашей группы на сегодня.'}</p></div>${m?'<button class="btn" data-act="openTask">＋ Добавить задание</button>':''}</div>
<div class="filters"><input class="field" data-in="search" aria-label="Найти задание" placeholder="⌕  Найти задание" value="${esc(search)}">${m?`<select class="select" aria-label="Филиал" data-chg="taskBranchFilter">${['Все филиалы',...branches].map(b=>opt(b,taskBranchFilter)).join('')}</select><select class="select" aria-label="Группа" data-chg="groupFilter">${['Все группы',...taskGroups].map(g=>opt(g,groupFilter)).join('')}</select>`:''}<select class="select" aria-label="Тип" data-chg="typeFilter">${['Все типы','Картинка','Документ','Музыка'].map(g=>opt(g,typeFilter)).join('')}</select>${m?`<select class="select" aria-label="Сортировка" data-chg="sortBy"><option value="dateDesc" ${sortBy==='dateDesc'?'selected':''}>Сначала новые</option><option value="dateAsc" ${sortBy==='dateAsc'?'selected':''}>Сначала старые</option><option value="name" ${sortBy==='name'?'selected':''}>По названию</option><option value="group" ${sortBy==='group'?'selected':''}>По группе</option></select>`:`<span class="pill" style="padding:10px 13px">Сегодня · ${fmtAlmaty(now(),{day:'numeric',month:'long'})}</span>`}</div>
<div class="card">${list.map(taskRow).join('')||`<p class="sub">${m?'Заданий пока нет.':'На сегодня заданий пока нет.'}</p>`}${m?'':'<div class="notice">🔒 Вчерашние и будущие задания не отображаются. Скачивание доступно с 06:00 до 20:00 по времени Алматы.</div>'}</div>`;
}
function fillGroupSelect(selId,branch,sel){
  const s=$(selId);if(!s)return;const gs=groups[branch]||[];
  s.innerHTML=gs.length?gs.map(g=>`<option value="${esc(g.name)}" ${g.name===sel?'selected':''}>${esc(g.name)} · ${esc(g.schedule)}</option>`).join(''):'<option value="">Нет групп — добавьте их в разделе «Филиалы»</option>';
}
function setTaskGroups(){
  const host=$('branchGroupSelectors');if(!host)return;
  const prev={};host.querySelectorAll('select[data-branch]').forEach(s=>prev[s.dataset.branch]=s.value);
  const bs=[...document.querySelectorAll('input[name="f_branch"]:checked')].map(x=>x.value);
  host.innerHTML=bs.map((b,i)=>`<label>Группа филиала «${esc(b)}» <span class="req">*</span><select id="f_group_${i}" data-branch="${esc(b)}"></select></label>`).join('');
  bs.forEach((b,i)=>fillGroupSelect('f_group_'+i,b,prev[b]));
}
function taskForm(t,day){
  if(!need())return;
  const edit=!!t,cat=t?.taskType==='Тест'?'Документ':(t?.taskType||'Картинка'),today=dayKey();
  const where=edit?`<label>Филиал <span class="req">*</span><select id="f_branch" data-chg="taskBranch">${branches.map(b=>`<option ${b===(t.branch||'Центр')?'selected':''}>${esc(b)}</option>`).join('')}</select></label><label>Группа <span class="req">*</span><select id="f_group"></select></label>`:
  `<fieldset class="full"><legend>Филиалы для задания <span class="req">*</span></legend><div style="display:flex;gap:12px;flex-wrap:wrap">${branches.map((b,i)=>`<label><input type="checkbox" name="f_branch" value="${esc(b)}" data-chg="taskBranches" ${i===0?'checked':''}> ${esc(b)}</label>`).join('')}</div></fieldset><div class="full" id="branchGroupSelectors"></div>`;
  const o=openModal('mTask',`<form data-form="task" data-id="${edit?esc(t.id):''}" novalidate><h2 id="mTask-t">${edit?'Редактировать задание':'Новое задание'}</h2><p>${edit?'Измените данные задания. Файл можно заменить.':'Загрузите файл и выберите филиал, группу и дату доступа.'}</p><div class="formgrid">
<label class="full">Название задания<input id="f_task" value="${edit?esc(t.name):''}"></label>
<label class="full">Тип <span class="req">*</span><select id="f_type" data-chg="taskType">${['Картинка','Документ','Музыка'].map(c=>`<option ${c===cat?'selected':''}>${c}</option>`).join('')}</select></label>
<label class="full">Файл${edit?' (оставьте пустым, чтобы не менять)':''}<input id="f_file" type="file" accept="${ACCEPT[cat]}"></label>${edit?`<div class="full" style="font-size:11px;color:var(--muted)">Текущий файл: ${esc(t.fileName||'не прикреплён')}</div>`:''}
${where}
<label>Для кого<select id="f_user"><option value="">Вся группа</option>${users.filter(u=>u.active!==false).map(u=>`<option value="${esc(u.id)}" ${edit&&t.userId===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></label>
<label>Дата доступа <span class="req">*</span><input id="f_day" type="date" value="${edit?esc(t.accessDate):esc(day||today)}" ${edit?'':`min="${today}"`}></label>
<div class="full" id="formatHint" style="font-size:11px;color:var(--muted)">Форматы: ${FORMAT_HINT[cat]}. До 25 МБ. Можно загрузить заранее и назначить день открытия.</div></div><div class="err" role="alert"></div><div class="modalfoot"><button type="button" class="btn secondary" data-act="close">Отмена</button><button class="btn" type="submit">${edit?'Сохранить':'Добавить задание'}</button></div></form>`);
  if(edit)fillGroupSelect('f_group',t.branch||'Центр',t.group);else setTaskGroups();
}
async function saveTask(f){
  if(!need())return;
  const id=f.dataset.id,edit=!!id,t=edit?tasks.find(x=>x.id===id):null;
  if(edit&&!t)return ferr(f,'Задание не найдено');
  const n=$('f_task').value.trim(),file=$('f_file').files[0],cat=$('f_type').value,date=$('f_day').value,today=dayKey();
  if(!n&&!file&&!(edit&&t.hasFile))return ferr(f,'Добавьте название или выберите файл');
  if(!date)return ferr(f,'Укажите дату доступа');
  if(!edit&&date<today)return ferr(f,'Для нового задания выберите сегодняшнюю или будущую дату');
  if(file){const e=await checkFile(file,cat);if(e)return ferr(f,e)}
  let sel;
  if(edit){sel=[{branch:$('f_branch').value,group:$('f_group').value}]}
  else sel=[...f.querySelectorAll('#branchGroupSelectors select[data-branch]')].map(s=>({branch:s.dataset.branch,group:s.value}));
  if(!sel.length)return ferr(f,'Выберите хотя бы один филиал');
  if(sel.some(x=>!x.group))return ferr(f,'В выбранном филиале сначала создайте группу');
  const ext=file?extOf(file.name):'';
  const blob=file?new Blob([file],{type:MIME[ext]||file.type}):null;
  try{
    if(edit){
      t.name=n||(file?file.name:t.name);t.taskType=cat;t.branch=sel[0].branch;t.group=sel[0].group;t.userId=$('f_user').value;t.accessDate=date;
      if(file){await fput(t.id,blob);t.hasFile=true;t.fileName=file.name;t.size=sizeText(file.size)}
      t.type=iconFor(t.hasFile?extOf(t.fileName||''):'',cat);
      log(`Изменил(а) задание «${t.name}»`,'task');
    }else{
      for(const {branch,group} of sel){
        const nt={id:uid('T'),name:n||file.name,type:iconFor(ext,cat),group,branch,userId:$('f_user').value,taskType:cat,accessDate:date,time:timeNow(),size:file?sizeText(file.size):'—',hasFile:!!file,fileName:file?file.name:''};
        if(file)await fput(nt.id,blob);
        tasks.unshift(nt);
      }
      log(`Добавил(а) задание «${n||file.name}» для ${sel.map(x=>x.branch+' / '+x.group).join(', ')}`,'task');
    }
  }catch(e){console.error(e);return ferr(f,'Не удалось сохранить файл. Проверьте свободное место в браузере.')}
  saveAll();closeModal('mTask');toast(edit?'Задание обновлено':'Задание назначено выбранным группам');render();refreshDay();
}
function delTask(id){
  if(!need())return;const t=tasks.find(x=>x.id===id);if(!t)return;
  confirmBox('Удалить задание?',`«${t.name}» будет удалено вместе с файлом. Это нельзя отменить.`,'Удалить',async()=>{
    if(!need())return;
    tasks=tasks.filter(x=>x.id!==id);await fdel(id);log(`Удалил(а) задание «${t.name}»`,'task');saveAll();render();refreshDay();toast('Задание удалено');
  });
}
async function download(id){
  const t=tasks.find(x=>x.id===id);if(!t||!canSee(t))return toast('Задание недоступно для вашей группы');
  if(!gate())return;
  let b=null;try{b=t.hasFile?await fget(id):null}catch(e){}
  if(!b)return toast('К этому заданию файл не прикреплён');
  const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=t.fileName||t.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);
  log(`Скачал(а) «${t.name}»`,'download');saveAll();toast('Скачивание началось');if(page==='Главная')render();
}
async function preview(id){
  const t=tasks.find(x=>x.id===id);if(!t||!canSee(t))return toast('Задание недоступно для вашей группы');
  if(!gate())return;
  let b=null;try{b=t.hasFile?await fget(id):null}catch(e){}
  const ext=extOf(t.fileName||'');let body='<p>К этому заданию файл не прикреплён.</p>',url=null;
  if(b){
    url=URL.createObjectURL(b);
    if(EXT['Картинка'].includes(ext))body=`<img class="pv" src="${url}" alt="">`;
    else if(ext==='pdf')body=`<iframe class="pv" src="${url}" title="Просмотр файла"></iframe>`;
    else if(['mp4'].includes(ext))body=`<video controls class="pv" src="${url}"></video>`;
    else if(EXT['Музыка'].includes(ext))body=`<audio controls class="pvaudio" src="${url}"></audio>`;
    else body='<p>Предпросмотр этого документа недоступен. Скачайте файл.</p>';
  }
  const o=openModal('mPreview',`<h2 id="mPreview-t">${esc(t.name)}</h2><p>${esc(t.taskType||'Задание')} · ${esc(t.group)} · ${esc(dayLabel(t.accessDate))}</p><div class="previewbox">${body}</div><div class="modalfoot"><button type="button" class="btn secondary" data-act="close">Закрыть</button>${b?`<button type="button" class="btn" data-act="download" data-id="${esc(t.id)}">↓ Скачать</button>`:''}</div>`,{wide:true});
  if(url)o._cleanup=()=>URL.revokeObjectURL(url);
}

/* ---------- календарь ---------- */
function calendarPage(){
  const y=cal.y,m=cal.m,mm=isM(),first=new Date(Date.UTC(y,m,1)),offset=(first.getUTCDay()+6)%7,days=new Date(Date.UTC(y,m+1,0)).getUTCDate();
  const by={};visibleTasks().forEach(t=>(by[t.accessDate]||(by[t.accessDate]=[])).push(t));
  const today=dayKey(),cells=Array(offset).fill('<div></div>');
  for(let d=1;d<=days;d++){
    const key=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,l=by[key]||[];
    cells.push(`<div class="calday${key===today?' today':''}${mm?' click':''}"${mm?` role="button" tabindex="0" data-act="day" data-day="${key}"`:''}><b>${d}</b>${l.slice(0,3).map(t=>`<small title="${esc(t.name)}">${esc(t.name)}</small>`).join('')}${l.length>3?`<small class="more">+${l.length-3} ещё</small>`:''}</div>`);
  }
  return `<div class="heading"><div><h1>Календарь заданий</h1><p class="sub">${mm?'Нажмите на день, чтобы посмотреть, добавить или изменить задания. Листать можно на любой срок.':'Показываются только названия и даты заданий.'}</p></div><div><button class="btn secondary small" data-act="calPrev" aria-label="Предыдущий месяц">←</button> <b>${new Intl.DateTimeFormat('ru-RU',{timeZone:'UTC',month:'long',year:'numeric'}).format(first)}</b> <button class="btn secondary small" data-act="calNext" aria-label="Следующий месяц">→</button> <button class="btn secondary small" data-act="calToday">Сегодня</button></div></div><div class="card calendar"><div class="calgrid calhead">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=>`<b>${d}</b>`).join('')}</div><div class="calgrid">${cells.join('')}</div></div>`;
}
function calShift(d){cal.m+=d;while(cal.m>11){cal.m-=12;cal.y++}while(cal.m<0){cal.m+=12;cal.y--}render()}
function showDay(day){
  if(!need())return;openDayKey=day;
  const list=tasks.filter(t=>t.accessDate===day);
  openModal('mDay',`<h2 id="mDay-t">${esc(displayDay(day))}</h2><p>${list.length?'Задания этого дня:':'На этот день заданий нет.'}</p><div>${list.map(taskRow).join('')}</div><div class="modalfoot"><button type="button" class="btn secondary" data-act="close">Закрыть</button>${day>=dayKey()?`<button type="button" class="btn" data-act="addTaskDay" data-day="${day}">＋ Добавить задание</button>`:''}</div>`,{wide:true});
}
function refreshDay(){if($('mDay')&&openDayKey)showDay(openDayKey)}

/* ---------- пользователи ---------- */
function userPage(){
  const q=search.toLowerCase();
  return `<div class="heading"><div><h1>Пользователи</h1><p class="sub">Роли, филиалы и доступы вашего центра.</p></div><button class="btn" data-act="openInvite">＋ Пригласить</button></div><div class="filters"><input class="field" data-in="search" aria-label="Поиск" placeholder="⌕  Имя, телефон или ID" value="${esc(search)}"><select class="select" aria-label="Филиал"><option>Все филиалы</option>${branches.map(b=>`<option>${esc(b)}</option>`).join('')}</select><select class="select" aria-label="Роль"><option>Все роли</option><option>Учитель</option><option>Помощник</option><option>Директор центра</option></select></div>
<div class="card tablewrap"><table class="table"><thead><tr><th>Пользователь</th><th>Роль</th><th>Филиал / группа</th><th>Последний вход</th><th>Статус</th><th></th></tr></thead><tbody>${users.filter(u=>(u.name+u.phone+u.id).toLowerCase().includes(q)).map(u=>{const mn=u.role==='Ментор',id=esc(u.id);return `<tr><td><div class="person"><div class="avatar">${esc(initials(u.name))}</div><div><b>${esc(u.name)}</b><small>${esc(u.phone)} · ${id}</small></div></div></td><td><span class="tag ${mn?'mentor':u.role==='Учитель'?'teacher':'admin'}">${esc(u.role)}</span></td><td>${mn?'Весь сайт · все филиалы и группы':esc(u.branch)}<small style="display:block;color:#89948e;margin-top:4px">${mn?'Администратор':esc(u.group)}</small></td><td>${fmtTs(u.last)}</td><td><span class="pill" style="background:${u.active!==false?'var(--mint)':'#fff0ee'};color:${u.active!==false?'var(--green)':'#b84f4f'}">${u.active!==false?'Активен':'Отключён'}</span>${mn?'':` <button class="btn secondary small" data-act="resetUser" data-id="${id}">Сброс</button>`}</td><td><div style="display:flex;gap:5px"><button class="btn secondary small" data-act="editUser" data-id="${id}">Изменить</button>${mn?'':`<button class="btn secondary small" data-act="toggleUser" data-id="${id}">${u.active!==false?'Отключить':'Включить'}</button><button class="btn secondary small" data-act="delUser" data-id="${id}">Удалить</button>`}</div></td></tr>`}).join('')}</tbody></table></div><div class="notice">🔐 Пароли хранятся только в виде хэша и никому не видны. Если участник забыл пароль, ментор нажимает «Сброс» и выдаёт временный пароль — при входе его попросят сменить.</div>`;
}
const ROLES=['Учитель','Помощник','Директор центра'];
function inviteForm(){
  if(!need())return;
  openModal('mInvite',`<form data-form="invite" novalidate autocomplete="off"><h2 id="mInvite-t">Новое приглашение</h2><p>Создайте учётную запись и выдайте человеку доступ.</p><div class="formgrid">
<label class="full">Имя и фамилия <span class="req">*</span><input id="f_name"></label>
<label>Номер телефона <span class="req">*</span><input id="f_phone" type="tel" placeholder="+7 7XX XXX-XX-XX"></label>
<label>Роль<select id="f_role">${ROLES.map(r=>`<option>${r}</option>`).join('')}</select></label>
<label>Филиал<select id="f_branch" data-chg="inviteBranch">${branches.map(b=>`<option>${esc(b)}</option>`).join('')}</select></label>
<label>Группа <span class="req">*</span><select id="f_group"></select></label>
<label class="full">Временный пароль (не короче 8 символов) <span class="req">*</span><input id="f_pass" type="password" autocomplete="new-password"></label>
<div class="full" style="font-size:11px;color:var(--muted)">Временный пароль сообщите участнику отдельно. При первом входе система попросит его сменить.</div></div><div class="err" role="alert"></div><div class="modalfoot"><button type="button" class="btn secondary" data-act="close">Отмена</button><button class="btn" type="submit">Создать доступ</button></div></form>`);
  fillGroupSelect('f_group',branches[0]);
}
async function saveInvite(f){
  if(!need())return;
  const name=$('f_name').value.trim(),p=normPhone($('f_phone').value),pw=$('f_pass').value,group=$('f_group').value;
  if(!name)return ferr(f,'Укажите имя и фамилию');
  if(!p)return ferr(f,'Введите телефон в формате +7 7XX XXX-XX-XX');
  if(users.some(u=>normPhone(u.phone)===p))return ferr(f,'Пользователь с таким номером уже есть');
  if(!group)return ferr(f,'В выбранном филиале сначала создайте группу');
  const e=pwError(pw);if(e)return ferr(f,e);
  let id;do{id='ID-'+Math.random().toString(36).slice(2,6).toUpperCase()}while(users.some(u=>u.id===id));
  const u={id,name,phone:fmtPhone(p),branch:$('f_branch').value,group,role:$('f_role').value,last:null,active:true};
  await setPw(u,pw,true);users.unshift(u);log(`Создал(а) доступ для ${name}`,'user');saveAll();closeModal('mInvite');toast('Пользователь добавлен');render();
}
function editUser(id){
  if(!need())return;const u=users.find(x=>x.id===id);if(!u)return;const mn=u.role==='Ментор';
  openModal('mEditUser',`<form data-form="editUser" data-id="${esc(id)}" novalidate><h2 id="mEditUser-t">Редактировать пользователя</h2><p>Измените профиль и назначение сотрудника.</p><div class="formgrid">
<label class="full">Имя и фамилия <span class="req">*</span><input id="eu_name" value="${esc(u.name)}"></label>
<label>Телефон <span class="req">*</span><input id="eu_phone" type="tel" value="${esc(u.phone)}"></label>
<label>Роль${mn?'<input value="Ментор" disabled>':`<select id="eu_role">${ROLES.map(r=>`<option ${u.role===r?'selected':''}>${r}</option>`).join('')}</select>`}</label>
<label>Филиал<select id="eu_branch" data-chg="editBranch">${branches.map(b=>`<option ${u.branch===b?'selected':''}>${esc(b)}</option>`).join('')}</select></label>
<label>Группа <span class="req">*</span><select id="eu_group"></select></label></div><div class="err" role="alert"></div><div class="modalfoot"><button type="button" class="btn secondary" data-act="close">Отмена</button><button class="btn" type="submit">Сохранить</button></div></form>`);
  if(!mn)fillGroupSelect('eu_group',u.branch,u.group);
}
function saveEditedUser(f){
  if(!need())return;const u=users.find(x=>x.id===f.dataset.id);if(!u)return;
  const name=$('eu_name').value.trim(),p=normPhone($('eu_phone').value),group=u.role==='Ментор'?'':$('eu_group')?.value;
  if(!name)return ferr(f,'Укажите имя и фамилию');
  if(!p)return ferr(f,'Введите телефон в формате +7 7XX XXX-XX-XX');
  if(users.some(x=>x.id!==u.id&&normPhone(x.phone)===p))return ferr(f,'Пользователь с таким номером уже есть');
  if(u.role!=='Ментор'&&!group)return ferr(f,'Выберите группу');
  u.name=name;u.phone=fmtPhone(p);if(u.role!=='Ментор'){u.branch=$('eu_branch').value;u.group=group}else{u.branch='';u.group=''};
  if(u.role!=='Ментор')u.role=$('eu_role').value;
  saveAll();closeModal('mEditUser');if(me.id===u.id)shell();else render();toast('Данные пользователя сохранены');
}
function resetUser(id){
  if(!need())return;const u=users.find(x=>x.id===id);if(!u||u.role==='Ментор')return;
  openModal('mReset',`<form data-form="reset" data-id="${esc(id)}" novalidate autocomplete="off"><h2 id="mReset-t">Сброс пароля</h2><p>Задайте временный пароль для ${esc(u.name)}. При входе человека попросят сменить его.</p><div class="formgrid"><label class="full">Временный пароль (не короче 8 символов) <span class="req">*</span><input id="r_pw" type="password" autocomplete="new-password"></label></div><div class="err" role="alert"></div><div class="modalfoot"><button type="button" class="btn secondary" data-act="close">Отмена</button><button class="btn" type="submit">Сбросить пароль</button></div></form>`);
}
async function saveReset(f){
  if(!need())return;const u=users.find(x=>x.id===f.dataset.id);if(!u||u.role==='Ментор')return;
  const pw=$('r_pw').value,e=pwError(pw);if(e)return ferr(f,e);
  await setPw(u,pw,true);log(`Сбросил(а) пароль для ${u.name}`,'user');saveAll();closeModal('mReset');toast('Временный пароль задан. Сообщите его участнику отдельно');
}
function toggleUser(id){
  if(!need())return;const u=users.find(x=>x.id===id);if(!u||u.role==='Ментор')return;
  u.active=u.active===false;saveAll();render();toast(u.active?'Доступ восстановлен':'Доступ отключён');
}
function delUser(id){
  if(!need())return;const u=users.find(x=>x.id===id);if(!u||u.role==='Ментор')return;
  confirmBox('Удалить пользователя?',`«${u.name}» будет удалён. Персональный доступ к заданиям будет снят.`,'Удалить',()=>{
    if(!need())return;users=users.filter(x=>x.id!==id);tasks.forEach(t=>{if(t.userId===id)t.userId=''});
    log(`Удалил(а) пользователя ${u.name}`,'user');saveAll();render();toast('Пользователь удалён');
  });
}

/* ---------- журнал и настройки ---------- */
function logPage(){
  const q=search.toLowerCase();
  return `<div class="heading"><div><h1>Журнал активности</h1><p class="sub">Входы и скачивания за последние 30 дней. IP-адреса не сохраняются.</p></div><button class="btn secondary small">↓ Экспорт журнала</button></div><div class="filters"><input class="field" data-in="search" aria-label="Поиск" placeholder="⌕  Имя или событие" value="${esc(search)}"><select class="select" aria-label="Период"><option>Последние 30 дней</option><option>Сегодня</option><option>7 дней</option></select></div><div class="card tablewrap"><table class="table"><thead><tr><th>Пользователь</th><th>Действие</th><th>Дата и время</th><th>Устройство</th></tr></thead><tbody>${logs.filter(l=>(l.user+l.what).toLowerCase().includes(q)).map(l=>`<tr><td><b>${esc(l.user)}</b></td><td>${esc(l.what)}</td><td>${l.ts?fmtTs(l.ts):esc(l.time||'')}</td><td style="color:var(--muted)">Браузер</td></tr>`).join('')}</tbody></table></div>`;
}
function settingsPage(){
  return `<div class="heading"><div><h1>Настройки центра</h1><p class="sub">Рабочее пространство и расписание доступа.</p></div></div><div class="grid"><section class="card"><div class="cardhead"><h2>Учебный центр</h2><button class="link">Изменить</button></div><div class="task"><div class="taskinfo"><b>Часовой пояс</b><small>Asia/Almaty (UTC+5)</small></div></div><div class="task"><div class="taskinfo"><b>Окно доступа к заданиям</b><small>Каждый день с 06:00 до 20:00</small></div></div><div class="task"><div class="taskinfo"><b>Хранение журнала</b><small>30 дней · без IP-адресов</small></div></div></section><section class="card"><div class="cardhead"><h2>Защита материалов</h2><span class="pill">Включена</span></div><p class="sub" style="line-height:1.8">Водяной знак с именем и ID поверх страницы. Скрытие содержимого, когда окно неактивно. Запрет выделения и контекстного меню на заданиях. Файлы можно скачать только в день задания.</p><div class="notice">Защита снижает риск утечки, но не может остановить снимок экрана внешним устройством.</div></section></div>`;
}

/* ---------- филиалы и группы ---------- */
function branchPage(){
  return `<div class="heading"><div><h1>Филиалы</h1><p class="sub">Выберите филиал, чтобы открыть список его групп.</p></div><button class="btn" data-act="addBranch">＋ Добавить филиал</button></div><div class="grid branch-grid">${branches.map((b,i)=>`<section class="card branch-card"><div class="cardhead"><h2>${esc(b)}</h2></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="selectBranch" data-i="${i}">Открыть группы</button><button class="btn secondary small" data-act="editBranch" data-i="${i}">Изменить филиал</button><button class="btn secondary small" data-act="delBranch" data-i="${i}">Удалить</button></div></section>`).join('')||'<section class="card"><p class="sub">Филиалов пока нет.</p></section>'}</div>`;
}
function ensureChildren(g){
  if(!Array.isArray(g.children))g.children=[];
  g.children=g.children.filter(c=>c&&typeof c==='object');
  g.children.forEach(c=>{if(!c.id)c.id=uid('C')});
  return g.children;
}
function groupsPage(){
  if(!need())return '';
  if(!branches.includes(selectedGroupBranch))selectedGroupBranch=branches[0]||'';
  const b=selectedGroupBranch;
  if(rosterGroupIndex!==null){
    const g=(groups[b]||[])[rosterGroupIndex];
    if(g)return groupRosterPage(b,rosterGroupIndex,g);
    rosterGroupIndex=null;
  }
  const opts=branches.map(x=>`<option value="${esc(x)}" ${x===b?'selected':''}>${esc(x)}</option>`).join('');
  const gs=groups[b]||[];
  return `<div class="heading"><div><h1>Группы</h1><p class="sub">Выберите филиал и откройте группу, чтобы увидеть список детей.</p></div>${b?`<button class="btn secondary" data-act="groups" data-i="${branches.indexOf(b)}">＋ Добавить группу</button>`:''}</div><section class="card" style="margin-bottom:18px"><div style="display:grid;gap:8px;max-width:420px"><label for="groupBranchSelect" style="display:block">Филиал</label><select id="groupBranchSelect" class="select" data-chg="groupBranch" style="width:100%" ${branches.length?'':'disabled'}>${opts}</select></div></section><div class="grid branch-grid">${b?gs.map((g,j)=>`<section class="card branch-card"><div class="cardhead"><div><h2>${esc(g.name)}</h2><small class="sub">${esc(g.schedule||'Расписание не указано')} · ${ensureChildren(g).length} детей</small></div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="openRoster" data-i="${branches.indexOf(b)}" data-j="${j}">Дети группы</button><button class="btn secondary small" data-act="editGroup" data-i="${branches.indexOf(b)}" data-j="${j}">Изменить</button><button class="btn secondary small" data-act="delGroup" data-i="${branches.indexOf(b)}" data-j="${j}">Удалить</button></div></section>`).join(''):'<section class="card"><p class="sub">Сначала добавьте филиал.</p></section>'}${b&&!gs.length?'<section class="card"><p class="sub">В этом филиале пока нет групп. Нажмите «Добавить группу».</p></section>':''}</div>`;
}
function subscriptionAmount(value){
  const n=Number(value);
  return Number.isFinite(n)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n):'—';
}
function subscriptionsPage(){
  if(!need())return '';
  const cards=subscriptions.map(s=>`<section class="card" style="margin-bottom:14px"><div class="cardhead"><div><h2>${esc(s.name)}</h2><small class="sub">${subscriptionAmount(s.amount)} · ${esc(s.lessons)} занятий</small></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn secondary small" data-act="editSubscription" data-id="${esc(s.id)}">Изменить</button><button class="btn secondary small" data-act="delSubscription" data-id="${esc(s.id)}">Удалить</button></div></div></section>`).join('');
  return `<div class="heading"><div><h1>Абонементы</h1><p class="sub">Создавайте абонементы и назначайте их детям в карточке ребёнка.</p></div><button class="btn" data-act="addSubscription">＋ Создать абонемент</button></div>${cards||'<section class="card"><p class="sub">Абонементов пока нет. Создайте первый абонемент.</p></section>'}`;
}
function subscriptionForm(id){
  if(!need())return;
  const s=id?subscriptions.find(x=>x.id===id):null;if(id&&!s)return;
  openModal('mSubscription',`<form data-form="subscription" data-id="${s?esc(s.id):''}" novalidate><h2 id="mSubscription-t">${s?'Редактировать абонемент':'Новый абонемент'}</h2><div class="formgrid"><label class="full">Название <span class="req">*</span><input name="name" value="${esc(s?.name||'')}" required></label><label>Сумма <span class="req">*</span><input name="amount" type="number" min="0" step="0.01" value="${esc(s?.amount??'')}" required></label><label>Количество занятий <span class="req">*</span><input name="lessons" type="number" min="1" step="1" value="${esc(s?.lessons??'')}" required></label></div><div class="err" role="alert"></div><div class="modalfoot"><button type="button" class="btn secondary" data-act="close">Отмена</button><button class="btn" type="submit">Сохранить</button></div></form>`);
}
function saveSubscription(f){
  if(!need())return;
  const name=f.elements.name.value.trim(),amountRaw=f.elements.amount.value,lessonsRaw=f.elements.lessons.value;
  if(!name)return ferr(f,'Введите название абонемента');
  if(amountRaw===''||!Number.isFinite(Number(amountRaw))||Number(amountRaw)<0)return ferr(f,'Укажите корректную сумму');
  if(lessonsRaw===''||!Number.isInteger(Number(lessonsRaw))||Number(lessonsRaw)<1)return ferr(f,'Количество занятий должно быть целым числом от 1');
  const id=f.dataset.id,old=id?subscriptions.find(s=>s.id===id):null;
  if(id&&!old)return ferr(f,'Абонемент уже удалён или изменён');
  if(subscriptions.some(s=>s.id!==id&&s.name.trim().toLowerCase()===name.toLowerCase()))return ferr(f,'Абонемент с таким названием уже существует');
  const record={id:old?.id||uid('P'),name,amount:Number(amountRaw),lessons:Number(lessonsRaw)};
  if(old)subscriptions[subscriptions.indexOf(old)]=record;else subscriptions.push(record);
  saveAll();closeModal('mSubscription');render();toast(old?'Абонемент обновлён':'Абонемент создан');
}
function deleteSubscription(id){
  if(!need())return;
  const s=subscriptions.find(x=>x.id===id);if(!s)return;
  const used=Object.values(groups).flat().some(g=>Array.isArray(g.children)&&g.children.some(c=>c.subscriptionId===id));
  if(used)return toast('Сначала выберите детям другой абонемент');
  confirmBox('Удалить абонемент?',`«${s.name}» будет удалён из списка.`,'Удалить',()=>{
    if(!need())return;
    subscriptions=subscriptions.filter(x=>x.id!==id);saveAll();render();toast('Абонемент удалён');
  });
}
function childGroupOptions(branch,selected){
  const select=$('childGroup');
  if(!select)return;
  const gs=groups[branch]||[];
  select.innerHTML=gs.length?gs.map(g=>`<option value="${esc(g.name)}" ${g.name===selected?'selected':''}>${esc(g.name)} · ${esc(g.schedule||'')}</option>`).join(''):'<option value="">В этом филиале нет групп</option>';
  select.disabled=!gs.length;
}

function groupRosterPage(b,i,g){
  const kids=ensureChildren(g);
  const fields=[['ФИО родителя','parentName'],['Номер телефона','parentPhone'],['Абонемент','subscriptionId'],['Использовано занятий','lessonsUsed'],['Скидка','discount'],['Этап','stage'],['Дата обратной связи','feedbackDate'],['Статус обратной связи','feedbackStatus'],['Примечание','notes']];
  const items=kids.map((c,k)=>`<section class="card" style="margin-bottom:14px"><div class="cardhead"><div><h2>${esc(c.fullName||'Без имени')}</h2><small class="sub">${esc(b)} · ${esc(g.name)}</small></div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="pill">${esc(c.status||'Ходит')}</span><button class="btn secondary small" data-act="editChild" data-i="${branches.indexOf(b)}" data-j="${i}" data-k="${k}">Изменить</button><button class="btn secondary small" data-act="delChild" data-i="${branches.indexOf(b)}" data-j="${i}" data-k="${k}">Удалить</button></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px 18px">${fields.map(([label,key])=>{let value=c[key];if(key==='subscriptionId'){const sub=subscriptions.find(s=>s.id===c.subscriptionId);value=sub?`${sub.name} · ${subscriptionAmount(sub.amount)} · ${sub.lessons} занятий`:(c.subscriptionType||'—')}if(key==='feedbackStatus')value=value||'Не отправлено';return `<div><small style="display:block;color:var(--muted);margin-bottom:4px">${label}</small><b style="font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere">${esc(value===0?0:(value||'—'))}</b></div>`}).join('')}${c.feedback?`<div><small style="display:block;color:var(--muted);margin-bottom:4px">Комментарий к обратной связи</small><b style="font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere">${esc(c.feedback)}</b></div>`:''}</div></section>`).join('');
  return `<div class="heading"><div><h1>${esc(g.name)}</h1><p class="sub">${esc(b)} · ${esc(g.schedule||'Расписание не указано')}</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn secondary" data-act="backGroups">← К группам</button><button class="btn" data-act="addChild" data-i="${branches.indexOf(b)}" data-j="${i}">＋ Добавить ребёнка</button></div></div>${items||'<section class="card"><p class="sub">В этой группе пока нет детей. Добавьте первого ребёнка.</p></section>'}`;
}

function childForm(bi,gi,ci){
  if(!need())return;
  const b=branches[bi],g=(groups[b]||[])[gi];if(!g)return;
  const kids=ensureChildren(g),edit=ci!==undefined&&ci!==null,child=edit?kids[ci]:null;
  if(edit&&!child)return;
  const branch=branches.find(x=>x===(child?.branch||b))||b;
  const groupName=child?.group||g.name;
  const statusOptions=['Ходит','Заморозка','Ушёл','Болеет'].map(x=>`<option value="${esc(x)}" ${x===(child?.status||'Ходит')?'selected':''}>${esc(x)}</option>`).join('');
  const stages=['Партнер по развитию','Резидент','Стратег семьи','Куратор семьи'];
  const stageOptions=(child?.stage&&!stages.includes(child.stage)?[`<option value="${esc(child.stage)}" selected>${esc(child.stage)}</option>`]:[]).concat(stages.map(x=>`<option value="${esc(x)}" ${x===child?.stage?'selected':''}>${esc(x)}</option>`)).join('');
  const branchOptions=branches.map(x=>`<option value="${esc(x)}" ${x===branch?'selected':''}>${esc(x)}</option>`).join('');
  const planOptions=subscriptions.map(s=>`<option value="${esc(s.id)}" ${s.id===child?.subscriptionId?'selected':''}>${esc(s.name)} · ${subscriptionAmount(s.amount)} · ${esc(s.lessons)} занятий</option>`).join('');
  const groupOptions=(groups[branch]||[]).map(x=>`<option value="${esc(x.name)}" ${x.name===groupName?'selected':''}>${esc(x.name)} · ${esc(x.schedule||'')}</option>`).join('');
  const input=(label,name,type='text',value='',attrs='',full=false)=>`<label${full?' class="full"':''}>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
  openModal('mChild',`<form data-form="child" data-i="${bi}" data-j="${gi}" data-k="${edit?ci:''}" novalidate><h2 id="mChild-t">${edit?'Редактировать данные ребёнка':'Добавить ребёнка'}</h2><p>Выберите филиал и группу для записи ребёнка.</p><div class="formgrid"><label>Филиал<select name="childBranch" id="childBranch" data-chg="childBranch">${branchOptions}</select></label><label>Группа<select name="childGroup" id="childGroup" ${groupOptions?'':'disabled'}>${groupOptions||'<option value="">Сначала добавьте группу</option>'}</select></label>${input('ФИО ребёнка <span class="req">*</span>','fullName','text',child?.fullName||'','required',true)}${input('ФИО родителя <span class="req">*</span>','parentName','text',child?.parentName||'','required')}${input('Номер телефона родителя <span class="req">*</span>','parentPhone','tel',child?.parentPhone||'','required autocomplete="tel"')}${input('Использовано занятий','lessonsUsed','number',child?.lessonsUsed??0,'min="0" step="1"')}${input('Скидка','discount','text',child?.discount??'')}<label>Этап<select name="stage">${stageOptions}</select></label><label>Дата обратной связи<input name="feedbackDate" type="date" value="${esc(child?.feedbackDate||'')}"></label><label>Статус<select name="status">${statusOptions}</select></label><label>Абонемент<select name="subscriptionId"><option value="">Не выбран</option>${child?.subscriptionId&&!subscriptions.some(s=>s.id===child.subscriptionId)?`<option value="${esc(child.subscriptionId)}" selected>Абонемент не найден</option>`:''}${planOptions}</select><small style="color:var(--muted);font-weight:400">${subscriptions.length?'Выберите абонемент ребёнка.':'Сначала создайте абонемент в меню «Абонементы».'}</small></label><label>Обратная связь<select name="feedbackStatus"><option ${(child?.feedbackStatus||'Не отправлено')==='Не отправлено'?'selected':''}>Не отправлено</option><option ${child?.feedbackStatus==='Отправлено'?'selected':''}>Отправлено</option></select></label><label class="full">Примечание<textarea name="notes" rows="3" style="width:100%;border:1px solid var(--line);border-radius:9px;padding:11px;resize:vertical">${esc(child?.notes||'')}</textarea></label></div><div class="err" role="alert"></div><div class="modalfoot"><button type="button" class="btn secondary" data-act="close">Отмена</button><button class="btn" type="submit">Сохранить</button></div></form>`,{wide:true});
}
function saveChild(f){
  if(!need())return;
  const bi=+f.dataset.i,gi=+f.dataset.j,sourceBranch=branches[bi],sourceGroup=(groups[sourceBranch]||[])[gi];if(!sourceGroup)return;
  const el=name=>f.elements.namedItem(name),value=name=>String(el(name)?.value||'').trim();
  const fullName=value('fullName'),parentName=value('parentName'),parentPhone=value('parentPhone');
  if(!fullName)return ferr(f,'Укажите ФИО ребёнка');
  if(!parentName)return ferr(f,'Укажите ФИО родителя');
  if(parentPhone.replace(/\D/g,'').length<7)return ferr(f,'Проверьте номер телефона родителя');
  const targetBranch=value('childBranch'),targetGroupName=value('childGroup'),targetGroupIndex=(groups[targetBranch]||[]).findIndex(x=>x.name===targetGroupName),targetGroup=(groups[targetBranch]||[])[targetGroupIndex];
  if(!targetGroup)return ferr(f,'Выберите филиал и группу');
  const lessonsRaw=value('lessonsUsed'),lessons=lessonsRaw===''?0:Number(lessonsRaw),discount=value('discount');
  if(!Number.isInteger(lessons)||lessons<0)return ferr(f,'Количество использованных занятий должно быть целым числом от 0');
  const subscriptionId=value('subscriptionId');
  if(subscriptionId&&!subscriptions.some(s=>s.id===subscriptionId))return ferr(f,'Выберите существующий абонемент');
  const sourceKids=ensureChildren(sourceGroup),edit=f.dataset.k!=='',idx=+f.dataset.k,old=edit?sourceKids[idx]:null;
  if(edit&&!old)return ferr(f,'Ребёнок уже удалён или изменён');
  const targetKids=ensureChildren(targetGroup);
  const record={...(old||{}),id:old?.id||uid('C'),fullName,parentName,parentPhone,status:value('status')||'Ходит',subscriptionId,lessonsUsed:lessons,discount,stage:value('stage'),feedbackDate:value('feedbackDate'),feedbackStatus:value('feedbackStatus')||'Не отправлено',notes:value('notes')};
  const sameGroup=edit&&sourceBranch===targetBranch&&sourceGroup===targetGroup;
  if(sameGroup)sourceKids[idx]=record;
  else{
    if(edit)sourceKids.splice(idx,1);
    targetKids.push(record);
  }
  saveAll();closeModal('mChild');selectedGroupBranch=targetBranch;rosterGroupIndex=targetGroupIndex;render();
  toast(edit?(sameGroup?'Данные ребёнка обновлены':'Ребёнок перенесён в выбранную группу'):'Ребёнок добавлен в группу');
}

function deleteChild(bi,gi,ci){
  if(!need())return;
  const b=branches[bi],g=(groups[b]||[])[gi],kids=g&&ensureChildren(g),c=kids&&kids[ci];if(!c)return;
  confirmBox('Удалить ребёнка?',`Запись «${c.fullName||'Без имени'}» будет удалена из группы.`,'Удалить',()=>{
    if(!need())return;
    const branch=branches[bi],group=(groups[branch]||[])[gi],list=group&&ensureChildren(group);if(!list||!list[ci])return;
    list.splice(ci,1);saveAll();selectedGroupBranch=branch;rosterGroupIndex=gi;render();toast('Запись ребёнка удалена');
  });
}

function branchForm(i){
  if(!need())return;const edit=i!==undefined&&i!=='';const b=edit?branches[+i]:'';
  openModal('mBranch',`<form data-form="branch" data-i="${edit?+i:''}" novalidate><h2 id="mBranch-t">${edit?'Редактировать филиал':'Новый филиал'}</h2><p>${edit?'Новое название обновится также у связанных пользователей и заданий.':'Введите название филиала.'}</p><div class="formgrid"><label class="full">Название филиала <span class="req">*</span><input id="branchName" value="${esc(b)}"></label></div><div class="err" role="alert"></div><div class="modalfoot"><button type="button" class="btn secondary" data-act="close">Отмена</button><button class="btn" type="submit">Сохранить</button></div></form>`);
}
function saveBranch(f){
  if(!need())return;const n=$('branchName').value.trim(),edit=f.dataset.i!=='',i=+f.dataset.i;
  if(!n)return ferr(f,'Введите название филиала');
  if(branches.some((b,j)=>(!edit||j!==i)&&b.toLowerCase()===n.toLowerCase()))return ferr(f,'Такой филиал уже существует');
  if(edit){
    const old=branches[i];branches[i]=n;if(selectedGroupBranch===old)selectedGroupBranch=n;
    if(groups[old]&&old!==n){groups[n]=groups[old];delete groups[old]}
    users.forEach(u=>{if(u.branch===old)u.branch=n});tasks.forEach(t=>{if(t.branch===old)t.branch=n});
    if(me.branch===old)me.branch=n;
  }else{branches.push(n);groups[n]=[]}
  saveAll();closeModal('mBranch');render();toast(edit?'Филиал и связанные записи обновлены':'Филиал создан');
}
function delBranch(i){
  if(!need())return;const b=branches[+i];if(b===undefined)return;
  if(users.some(u=>u.branch===b)||tasks.some(t=>(t.branch||'Центр')===b))return toast('Сначала переназначьте пользователей и задания из этого филиала');
  if((groups[b]||[]).some(g=>Array.isArray(g.children)&&g.children.length))return toast('Сначала перенесите или удалите детей из групп филиала');
  confirmBox('Удалить филиал?',`Филиал «${b}» и его группы будут удалены.`,'Удалить',()=>{
    if(!need())return;branches.splice(+i,1);delete groups[b];saveAll();render();toast('Филиал удалён');
  });
}
function groupsModal(i){
  if(!need())return;const b=branches[+i];if(b===undefined)return;const gs=groups[b]||[];
  openModal('mGroups',`<h2 id="mGroups-t">Группы · ${esc(b)}</h2><div>${gs.map((g,j)=>`<div class="task"><div class="taskinfo"><b>${esc(g.name)}</b><small>${esc(g.schedule)}</small></div><button class="btn secondary small" data-act="editGroup" data-i="${i}" data-j="${j}">Изменить</button><button class="btn secondary small" data-act="delGroup" data-i="${i}" data-j="${j}">Удалить</button></div>`).join('')||'<p class="sub">Групп пока нет.</p>'}</div><form data-form="addGroup" data-i="${+i}" novalidate><div class="formgrid" style="margin-top:14px"><label>Название группы <span class="req">*</span><input id="newGroupName"></label><label>Расписание<select id="newGroupSchedule"><option>Утренняя</option><option>Послеобеда</option></select></label></div><div class="err" role="alert"></div><div class="modalfoot"><button type="button" class="btn secondary" data-act="close">Закрыть</button><button class="btn" type="submit">＋ Добавить группу</button></div></form>`);
}
function addGroup(f){
  if(!need())return;const i=+f.dataset.i,b=branches[i],n=$('newGroupName').value.trim();
  if(!n)return ferr(f,'Введите название группы');
  groups[b]=groups[b]||[];
  if(groups[b].some(g=>g.name.toLowerCase()===n.toLowerCase()))return ferr(f,'Такая группа уже есть в филиале');
  groups[b].push({name:n,schedule:$('newGroupSchedule').value,children:[]});saveAll();groupsModal(i);render();toast('Группа добавлена');
}
function editGroup(i,j){
  if(!need())return;const b=branches[+i],g=(groups[b]||[])[+j];if(!g)return;
  openModal('mGroup',`<form data-form="saveGroup" data-i="${+i}" data-j="${+j}" novalidate><h2 id="mGroup-t">Редактировать группу</h2><div class="formgrid"><label>Название группы <span class="req">*</span><input id="g_name" value="${esc(g.name)}"></label><label>Расписание<select id="g_sched"><option ${g.schedule==='Утренняя'?'selected':''}>Утренняя</option><option ${g.schedule==='Послеобеда'?'selected':''}>Послеобеда</option></select></label></div><div class="err" role="alert"></div><div class="modalfoot"><button type="button" class="btn secondary" data-act="close">Отмена</button><button class="btn" type="submit">Сохранить</button></div></form>`);
}
function saveGroup(f){
  if(!need())return;const i=+f.dataset.i,j=+f.dataset.j,b=branches[i],g=(groups[b]||[])[j];if(!g)return;
  const n=$('g_name').value.trim();if(!n)return ferr(f,'Введите название группы');
  if(groups[b].some((x,k)=>k!==j&&x.name.toLowerCase()===n.toLowerCase()))return ferr(f,'Такая группа уже есть в филиале');
  const old=g.name;g.name=n;g.schedule=$('g_sched').value;
  users.forEach(u=>{if(u.branch===b&&u.group===old)u.group=n});tasks.forEach(t=>{if((t.branch||'Центр')===b&&t.group===old)t.group=n});
  if(me.branch===b&&me.group===old)me.group=n;
  saveAll();closeModal('mGroup');groupsModal(i);render();toast('Группа обновлена');
}
function delGroup(i,j){
  if(!need())return;const b=branches[+i],g=(groups[b]||[])[+j];if(!g)return;
  if(users.some(u=>u.branch===b&&u.group===g.name)||tasks.some(t=>(t.branch||'Центр')===b&&t.group===g.name))return toast('Сначала переназначьте пользователей и задания этой группы');
  if(Array.isArray(g.children)&&g.children.length)return toast('Сначала перенесите или удалите детей из этой группы');
  confirmBox('Удалить группу?',`Группа «${g.name}» будет удалена.`,'Удалить',()=>{
    if(!need())return;groups[b].splice(+j,1);saveAll();groupsModal(+i);render();toast('Группа удалена');
  });
}

/* ---------- профиль ---------- */
function profilePage(){
  const m=isM();
  return `<div class="heading"><div><h1>Мой профиль</h1><p class="sub">Личные данные и пароль.</p></div><button class="btn secondary" data-act="logout">Выйти</button></div>
<div class="card"><form data-form="profile" novalidate><div class="formgrid"><label class="full">Фото профиля<input id="p_photo_file" type="file" accept="image/*"><small style="color:var(--muted);font-weight:400">Изображение до 1 МБ. Фото будет видно в профиле.</small></label><label>Имя и фамилия<input id="p_name" value="${esc(me.name)}" ${m?'':'disabled'}></label><label>Телефон<input id="p_phone" type="tel" value="${esc(me.phone)}" ${m?'':'disabled'}></label><label>Уникальный ID<input value="${esc(me.id)}" disabled></label><label>${m?'Уровень доступа':'Филиал / группа'}<input value="${m?'Администратор всего сайта':esc(me.branch+' / '+me.group)}" disabled></label></div><div class="err" role="alert"></div><button class="btn" type="submit">${m?'Сохранить профиль':'Сохранить фото'}</button></form></div>
<div class="card" style="margin-top:17px"><div class="cardhead"><h2>Смена пароля</h2></div><form data-form="password" novalidate><div class="formgrid"><label class="full">Текущий пароль<input id="pw_old" type="password" autocomplete="current-password"></label><label>Новый пароль (не короче 8 символов)<input id="pw_new" type="password" autocomplete="new-password"></label><label>Повторите новый пароль<input id="pw_new2" type="password" autocomplete="new-password"></label></div><div class="err" role="alert"></div><button class="btn" type="submit">Сменить пароль</button></form></div>`;
}
async function saveProfile(f){
  const photo=$('p_photo_file')?.files?.[0],manager=isM();
  let name,p;
  if(manager){name=$('p_name').value.trim();p=normPhone($('p_phone').value);if(!name)return ferr(f,'Укажите имя и фамилию');if(!p)return ferr(f,'Введите телефон в формате +7 7XX XXX-XX-XX');if(users.some(x=>x.id!==me.id&&normPhone(x.phone)===p))return ferr(f,'Этот номер уже используется')}
  if(photo){if(!photo.type.startsWith('image/'))return ferr(f,'Выберите файл изображения');if(photo.size>1024*1024)return ferr(f,'Фото должно быть не больше 1 МБ')}
  let photoData=null;if(photo){try{photoData=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Не удалось прочитать изображение'));r.readAsDataURL(photo)})}catch(e){return ferr(f,'Не удалось прочитать фото. Выберите другой файл')}}
  if(manager){me.name=name;me.phone=fmtPhone(p)}if(photoData)me.photoData=photoData;
  saveAll();shell();toast(photoData?'Фото профиля сохранено':'Изменения профиля сохранены');
}
async function savePassword(f){
  const o=$('pw_old').value,n=$('pw_new').value,n2=$('pw_new2').value;
  if(await hashPw(o,me.salt)!==me.passHash)return ferr(f,'Текущий пароль неверный');
  const e=pwError(n,n2);if(e)return ferr(f,e);
  await setPw(me,n,false);log('Сменил(а) пароль','auth');saveAll();f.reset();ferr(f,'');toast('Пароль изменён');
}

/* ---------- формы ---------- */
const MGR_FORMS=['invite','editUser','reset','branch','addGroup','saveGroup','task','child','subscription'];
const FORMS={
  async login(f){
    const err=$('lerr');err.textContent='';
    const lk=getLock();if(lk.until>Date.now()){err.textContent='Слишком много попыток. Повторите через '+Math.ceil((lk.until-Date.now())/60000)+' мин.';return}
    const p=normPhone(f.elements.phone.value),u=p&&users.find(x=>normPhone(x.phone)===p);
    let ok=false;
    if(u&&u.passHash&&u.active!==false)ok=(await hashPw(f.elements.password.value,u.salt))===u.passHash;
    else await hashPw('x','AAAAAAAAAAAAAAAAAAAAAA==');
    if(!ok){const n=(lk.n||0)+1;setLock(n>=5?{n:0,until:Date.now()+5*60000}:{n,until:0});err.textContent=n>=5?'Слишком много попыток. Повторите через 5 мин.':'Неверный номер или пароль';return}
    setLock({n:0,until:0});startSession(u);
  },
  async setup(f){
    const e=pwError(f.elements.pw.value,f.elements.pw2.value);if(e)return ferr(f,e);
    const m=users.find(u=>u.role==='Ментор');await setPw(m,f.elements.pw.value,false);saveAll();startSession(m);
  },
  async change(f){
    const e=pwError(f.elements.pw.value,f.elements.pw2.value);if(e)return ferr(f,e);
    await setPw(me,f.elements.pw.value,false);log('Сменил(а) пароль','auth');saveAll();shell();toast('Пароль изменён');
  },
  invite:saveInvite,editUser:saveEditedUser,reset:saveReset,branch:saveBranch,addGroup,saveGroup,child:saveChild,subscription:saveSubscription,task:saveTask,profile:saveProfile,password:savePassword
};
async function guard(fn){if(busy)return;busy=true;try{await fn()}catch(e){console.error(e);toast('Произошла ошибка. Попробуйте ещё раз')}finally{busy=false}}
document.addEventListener('submit',e=>{
  const f=e.target.closest('form[data-form]');if(!f)return;e.preventDefault();
  const n=f.dataset.form;if(MGR_FORMS.includes(n)&&!need())return;
  guard(()=>FORMS[n](f));
});

/* ---------- действия ---------- */
const MGR_ACTS=['openTask','addTaskDay','editTask','delTask','openInvite','editUser','toggleUser','delUser','resetUser','addBranch','editBranch','delBranch','groups','editGroup','delGroup','selectBranch','openRoster','addChild','editChild','delChild','addSubscription','editSubscription','delSubscription','day'];
const A={
  go:d=>go(d.page),viewColleagues:()=>viewColleagues(),viewDownloads:()=>viewTodayDownloads(),viewGroups:()=>viewBranchGroups(),viewGroupChildren:d=>viewGroupChildren(+d.i,+d.j),logout:()=>logout(),close:(d,el)=>closeEl(el.closest('.overlay')),
  confirmYes:()=>{const cb=confirmCb;confirmCb=null;closeModal('mConfirm');if(cb)cb()},
  openTask:()=>taskForm(null),addTaskDay:d=>taskForm(null,d.day),editTask:d=>{const t=tasks.find(x=>x.id===d.id);if(t)taskForm(t)},delTask:d=>delTask(d.id),
  download:d=>guard(()=>download(d.id)),preview:d=>guard(()=>preview(d.id)),
  calPrev:()=>calShift(-1),calNext:()=>calShift(1),calToday:()=>{const t=dayKey().split('-');cal.y=+t[0];cal.m=+t[1]-1;render()},day:d=>showDay(d.day),
  openInvite:inviteForm,editUser:d=>editUser(d.id),toggleUser:d=>toggleUser(d.id),delUser:d=>delUser(d.id),resetUser:d=>resetUser(d.id),
  addBranch:()=>branchForm(),editBranch:d=>branchForm(d.i),delBranch:d=>delBranch(d.i),groups:d=>groupsModal(d.i),editGroup:d=>editGroup(d.i,d.j),delGroup:d=>delGroup(d.i,d.j),addSubscription:()=>subscriptionForm(),editSubscription:d=>subscriptionForm(d.id),delSubscription:d=>deleteSubscription(d.id),selectBranch:d=>{selectedGroupBranch=branches[+d.i]||'';rosterGroupIndex=null;go('Группы')},openRoster:d=>{closeAllModals();selectedGroupBranch=branches[+d.i]||'';rosterGroupIndex=+d.j;go('Группы')},backGroups:()=>{rosterGroupIndex=null;go('Группы')},addChild:d=>childForm(+d.i,+d.j),editChild:d=>childForm(+d.i,+d.j,+d.k),delChild:d=>deleteChild(+d.i,+d.j,+d.k)
};
document.addEventListener('click',e=>{
  if(e.target.classList&&e.target.classList.contains('overlay')&&e.target.dataset.closable){closeEl(e.target);return}
  if(e.target.id==='privacy'||e.target.closest('#privacy')){showP();window.focus();return}
  const el=e.target.closest('[data-act]');if(!el)return;
  const a=el.dataset.act,fn=A[a];if(!fn)return;
  e.preventDefault();
  if(MGR_ACTS.includes(a)&&!need())return;
  fn(el.dataset,el);
});
const CHG={
  groupFilter:el=>{groupFilter=el.value;render()},taskBranchFilter:el=>{taskBranchFilter=el.value;groupFilter='Все группы';render()},typeFilter:el=>{typeFilter=el.value;render()},sortBy:el=>{sortBy=el.value;render()},
  groupBranch:el=>{selectedGroupBranch=el.value;rosterGroupIndex=null;render()},childBranch:el=>childGroupOptions(el.value,''),
  inviteBranch:el=>fillGroupSelect('f_group',el.value),editBranch:el=>fillGroupSelect('eu_group',el.value),
  taskBranch:el=>fillGroupSelect('f_group',el.value),taskBranches:()=>setTaskGroups(),
  taskType:el=>{const f=$('f_file');if(f){f.accept=ACCEPT[el.value];f.value=''}const h=$('formatHint');if(h)h.textContent=`Форматы: ${FORMAT_HINT[el.value]}. До 25 МБ. Можно загрузить заранее и назначить день открытия.`}
};
document.addEventListener('change',e=>{const k=e.target.dataset&&e.target.dataset.chg;if(k&&CHG[k])CHG[k](e.target)});
document.addEventListener('input',e=>{
  if(!(e.target.dataset&&e.target.dataset.in==='search'))return;
  search=e.target.value;
  const start=e.target.selectionStart,end=e.target.selectionEnd;
  render();
  const replacement=document.querySelector('[data-in="search"]');
  if(replacement){replacement.focus();if(start!==null&&end!==null)replacement.setSelectionRange(start,end)}
});
document.addEventListener('keydown',e=>{
  if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('[role=button][data-act]')){e.preventDefault();e.target.click();return}
  if(e.key==='Enter'&&e.target.id==='privacy'){showP();return}
  const o=[...document.querySelectorAll('.overlay')].pop();if(!o)return;
  if(e.key==='Escape'&&o.dataset.closable){closeEl(o);return}
  if(e.key==='Tab'){
    const f=[...o.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null);
    if(!f.length)return;const a=f[0],z=f[f.length-1];
    if(e.shiftKey&&(document.activeElement===a||document.activeElement===o.querySelector('.modal'))){e.preventDefault();z.focus()}
    else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}
  }
});
document.addEventListener('contextmenu',e=>{if(me&&!isM()&&e.target.closest&&e.target.closest('.task,.calday,.previewbox'))e.preventDefault()});

$('app').innerHTML=authShell('<p class="sub">Подключаем демо-базу…</p>');
startCloud().finally(boot);
})();
