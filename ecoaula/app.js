'use strict';

const cfg = window.ECO_CONFIG || {};
const connected = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
const DEMO_KEY = 'ecoaula_7_botones_demo_v1';
const VERSION = 'eco7_indicadores_v1';
const chosen = {};
let dbPromise, toastTimer, saved = false, currentGroup = 'Todos';
const $ = sel => document.querySelector(sel);
const esc = val => String(val ?? '').replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt = (val, dec=1) => val === null || val === undefined || Number.isNaN(val) ? 'Sin dato' : Number(val).toLocaleString('es-BO',{maximumFractionDigits:dec});

// Los puntos medios son una aproximación para describir ACTIVIDADES,
// no factores de emisión ni estimaciones de una huella de carbono completa.
const questions = [
  {id:'transporte',topic:'MOVILIDAD',title:'¿Cómo llegas normalmente a la universidad?',hint:'Selecciona el medio de transporte que utilizas con mayor frecuencia.',options:[
    {id:'pie',label:'Caminando',emoji:'🚶',value:'pie'},{id:'bici',label:'Bicicleta',emoji:'🚲',value:'bici'},
    {id:'micro',label:'Micro / bus',emoji:'🚌',value:'micro'},{id:'moto',label:'Moto',emoji:'🛵',value:'moto'},
    {id:'auto',label:'Auto / taxi',emoji:'🚗',value:'auto'}]},
  {id:'distancia',topic:'MOVILIDAD',title:'¿Qué distancia recorres de ida?',hint:'Desde tu casa hasta la universidad, sin contar el regreso.',options:[
    {id:'d1',label:'0–2 km',emoji:'📍',value:1},{id:'d2',label:'3–5 km',emoji:'🛣️',value:4},
    {id:'d3',label:'6–10 km',emoji:'🚏',value:8},{id:'d4',label:'11–20 km',emoji:'🧭',value:15.5},
    {id:'d5',label:'Más de 20 km',emoji:'🌐',value:25}]},
  {id:'dias',topic:'MOVILIDAD',title:'¿Cuántos días por semana vas a la universidad?',hint:'Piensa en una semana normal de clases.',options:[
    {id:'a1',label:'1–2 días',emoji:'📆',value:1.5},{id:'a2',label:'3–4 días',emoji:'🗓️',value:3.5},
    {id:'a3',label:'5 días',emoji:'✋',value:5},{id:'a4',label:'6 días',emoji:'6️⃣',value:6},{id:'a5',label:'7 días',emoji:'7️⃣',value:7}]},
  {id:'combustible',topic:'MOVILIDAD · SOLO SI APLICA',title:'¿Qué combustible usa el auto o la moto?',hint:'Si es taxi y no lo sabes, marca «No sé».',when:a=>['auto','moto'].includes(a.transporte),options:[
    {id:'gas',label:'Gasolina',emoji:'⛽',value:'gasolina'},{id:'diesel',label:'Diésel',emoji:'🛢️',value:'diesel'},
    {id:'gnv',label:'GNV',emoji:'💨',value:'gnv'},{id:'electrico',label:'Eléctrico',emoji:'🔌',value:'electrico'},
    {id:'no_se',label:'No sé',emoji:'❔',value:'no_se'}]},
  {id:'electricidad',topic:'ELECTRICIDAD',title:'¿Cuánta electricidad consume tu hogar al mes?',hint:'Puedes encontrarlo en la factura: consumo mensual en kWh. «No sé» es válido.',options:[
    {id:'e1',label:'Menos de 50 kWh',emoji:'💡',value:25},{id:'e2',label:'50–100 kWh',emoji:'⚡',value:75},
    {id:'e3',label:'101–200 kWh',emoji:'🔋',value:150.5},{id:'e4',label:'201–300 kWh',emoji:'🏡',value:250.5},
    {id:'e5',label:'Más de 300 kWh',emoji:'🏘️',value:350},{id:'e0',label:'No sé',emoji:'❔',value:null}]},
  {id:'personas',topic:'ELECTRICIDAD',title:'¿Cuántas personas viven en tu hogar?',hint:'Incluyéndote. Para «6 o más» se usa 6 como aproximación conservadora.',options:[
    {id:'p1',label:'1 persona',emoji:'👤',value:1},{id:'p2',label:'2 personas',emoji:'👥',value:2},
    {id:'p3',label:'3 personas',emoji:'🏠',value:3},{id:'p4',label:'4 personas',emoji:'🏡',value:4},
    {id:'p5',label:'5 personas',emoji:'👨‍👩‍👧‍👦',value:5},{id:'p6',label:'6 o más',emoji:'👪',value:6}]},
  {id:'carne',topic:'ALIMENTACIÓN',title:'¿Cuántas veces por semana comes carne de res?',hint:'Cuenta almuerzos o cenas en los que comes carne de res.',options:[
    {id:'c0',label:'Nunca / 0 veces',emoji:'🥗',value:0},{id:'c1',label:'1–2 veces',emoji:'🍽️',value:1.5},
    {id:'c2',label:'3–4 veces',emoji:'🥩',value:3.5},{id:'c3',label:'5–7 veces',emoji:'🍖',value:6}]},
  {id:'porcion',topic:'ALIMENTACIÓN · SOLO SI APLICA',title:'¿Qué tamaño de porción comes normalmente?',hint:'Cantidad aproximada de carne por vez.',when:a=>a.carne!==undefined&&a.carne!=='c0',options:[
    {id:'r1',label:'Pequeña (~80 g)',emoji:'🥄',value:80},{id:'r2',label:'Mediana (~150 g)',emoji:'🍽️',value:150},
    {id:'r3',label:'Grande (~250 g)',emoji:'🍖',value:250}]}
];
const findQuestion = id => questions.find(q=>q.id===id);
const findOpt = id => findQuestion(id)?.options.find(o=>o.id===chosen[id]);
const questionVisible = q => !q.when || q.when(chosen);
const visibleQuestions = () => questions.filter(questionVisible);

function notify(message){const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4000)}
function demoRows(){try{return JSON.parse(localStorage.getItem(DEMO_KEY)||'[]')}catch{return []}}
function addDemo(row){const rows=demoRows();rows.push({...row,id:crypto.randomUUID?.()||String(Date.now()),created_at:new Date().toISOString()});localStorage.setItem(DEMO_KEY,JSON.stringify(rows))}
async function getDb(){if(!dbPromise)dbPromise=import('https://esm.sh/@supabase/supabase-js@2.57.0').then(m=>m.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey));return dbPromise}

function metricValues(){
  const distance=findOpt('distancia')?.value;
  const days=findOpt('dias')?.value;
  const electricity=findOpt('electricidad')?.value;
  const household=findOpt('personas')?.value;
  const freq=findOpt('carne')?.value;
  const portion=freq===0?0:findOpt('porcion')?.value;
  return {
    traslado_km_semana: Math.round(distance*2*days*10)/10,
    electricidad_kwh_persona_mes: electricity===null?null:Math.round(electricity/household*10)/10,
    res_kg_semana: Math.round(freq*portion/1000*100)/100
  };
}
function buildQuestions(){
  $('#questions').innerHTML=questions.map((q,i)=>`<section class="question-card" data-question="${q.id}" aria-invalid="false" ${questionVisible(q)?'':'hidden'}>
    <div class="question-top"><span class="question-num">${String(i+1).padStart(2,'0')} · ${esc(q.topic)}</span><span class="question-topic">${q.when?'Condicional':'Respuesta con botón'}</span></div>
    <h3>${esc(q.title)}</h3><p class="hint">${esc(q.hint)}</p>
    <div class="options" role="radiogroup" aria-label="${esc(q.title)}">${q.options.map(o=>`<label class="option"><input type="radio" name="${q.id}" value="${o.id}" ${chosen[q.id]===o.id?'checked':''}>
      <span class="option-emoji" aria-hidden="true">${o.emoji}</span><span class="option-text">${esc(o.label)}</span><span class="option-check" aria-hidden="true">✓</span></label>`).join('')}</div>
  </section>`).join('');
  updateVisibility();
}
function updateProgress(){const visible=visibleQuestions();const n=visible.filter(q=>!!chosen[q.id]).length;$('#progressCount').textContent=`${n} de ${visible.length}`;$('#progressFill').style.width=`${100*n/visible.length}%`}
function updateVisibility(){
  let number = 0;for(const q of questions){const visible=questionVisible(q);const card=document.querySelector(`[data-question="${q.id}"]`);card.hidden=!visible;if(visible){number++;card.querySelector('.question-num').textContent=`${String(number).padStart(2,'0')} · ${q.topic}`;}else{delete chosen[q.id];card.querySelectorAll('input').forEach(i=>i.checked=false)}}
  updateProgress();
}
function validate(){
  const codigo=$('#studentCode').value.trim().toUpperCase(), grupo=$('#classGroup').value.trim();
  if(!/^[A-Z0-9_-]{3,20}$/.test(codigo)){$('#surveyError').textContent='Introduce un código de 3 a 20 letras, números o guiones.';$('#studentCode').focus();return null}
  if(grupo.length<2||grupo.length>40){$('#surveyError').textContent='Escribe el curso o paralelo (2 a 40 caracteres).';$('#classGroup').focus();return null}
  const missing=visibleQuestions().find(q=>!chosen[q.id]);
  if(missing){const card=document.querySelector(`[data-question="${missing.id}"]`);card.setAttribute('aria-invalid','true');card.scrollIntoView({behavior:'smooth',block:'center'});$('#surveyError').textContent='Elige una respuesta para la pregunta marcada.';return null}
  if(!$('#consent').checked){$('#surveyError').textContent='Debes aceptar el uso académico de las respuestas.';$('#consent').focus();return null}
  return {codigo,grupo};
}
function getAnswers(){return Object.fromEntries(questions.map(q=>[q.id,questionVisible(q)?(chosen[q.id]||null):null]))}
function labelFor(id,optionId){return findQuestion(id)?.options.find(o=>o.id===optionId)?.label||'No aplica'}
async function sendSurvey(event){
  event.preventDefault();if(saved)return;
  const details=validate();if(!details)return;
  const metrics=metricValues();
  const row={codigo_alumno:details.codigo,grupo:details.grupo,instrumento_version:VERSION,respuestas:getAnswers(),indicadores:metrics};
  const button=$('#submitSurvey');button.disabled=true;button.textContent='Guardando…';$('#surveyError').textContent='';
  try{
    if(connected){
      const db=await getDb();const {data:sessionData,error:sessionError}=await db.auth.getSession();if(sessionError)throw sessionError;
      let session=sessionData.session;
      if(!session){const signed=await db.auth.signInAnonymously();if(signed.error)throw signed.error;session=signed.data.session}
      if(!session?.user?.id)throw new Error('No se pudo crear la sesión para enviar la encuesta.');
      if(!session.user.is_anonymous)throw new Error('Hay una sesión docente abierta en este navegador. Usa una ventana privada para responder.');
      const {error}=await db.from('encuestas_v2').insert({...row,student_id:session.user.id});if(error)throw error;
    } else addDemo(row);
    saved=true;showResult(row);notify(connected?'Respuesta registrada en Supabase':'Respuesta guardada solo en este navegador (demo)');
  }catch(error){$('#surveyError').textContent=error?.code==='23505'?'Ese código ya respondió en el mismo curso o esta sesión ya se utilizó.':`No se pudo guardar: ${error?.message||'error inesperado'}`}
  finally{button.disabled=false;button.textContent='Enviar mis respuestas ↗'}
}
function showResult(row){
  $('#surveyArea').hidden=true;$('#resultArea').hidden=false;
  const m=row.indicadores;
  $('#resultArea').innerHTML=`<div class="result-card"><div class="result-icon">🌱</div><h3>¡Encuesta enviada!</h3><p>Participante <b>${esc(row.codigo_alumno)}</b> · ${esc(row.grupo)}</p>
    <div class="summary-metrics"><div class="metric-tile"><strong>${fmt(m.traslado_km_semana)}</strong><small>km semanales de traslado (ida y vuelta)</small></div>
    <div class="metric-tile"><strong>${fmt(m.electricidad_kwh_persona_mes)}</strong><small>kWh/mes por persona del hogar (reparto uniforme)</small></div>
    <div class="metric-tile"><strong>${fmt(m.res_kg_semana,2)}</strong><small>kg estimados de carne de res por semana</small></div></div>
    <p>Los resultados utilizan puntos medios de los rangos elegidos. <b>No equivalen a una huella total de carbono ni a emisiones de CO₂.</b></p>
    ${connected?'<div class="notice">Tus respuestas están guardadas para el análisis estadístico del docente autorizado.</div>':'<div class="notice warn"><b>Modo demostración:</b> estas respuestas se almacenan solo en este navegador. Para reunir encuestas de distintos celulares hay que configurar Supabase.</div>'}
    <div class="result-actions">${connected?'':'<button type="button" class="btn btn-outline" id="anotherSurvey">Nueva encuesta</button>'}<button type="button" class="btn btn-primary" id="seeAdmin">Panel estadístico ▥</button></div></div>`;
  $('#seeAdmin').addEventListener('click',openAdmin);
  $('#anotherSurvey')?.addEventListener('click',()=>{saved=false;Object.keys(chosen).forEach(k=>delete chosen[k]);$('#surveyForm').reset();$('#surveyArea').hidden=false;$('#resultArea').hidden=true;buildQuestions();$('#encuesta').scrollIntoView({behavior:'smooth'})});
  $('#encuesta').scrollIntoView({behavior:'smooth',block:'start'});
}
const avg=ns=>ns.length?ns.reduce((s,x)=>s+x,0)/ns.length:null;
const median=ns=>{if(!ns.length)return null;const x=[...ns].sort((a,b)=>a-b),i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2};
const std=ns=>{if(!ns.length)return null;const mean=avg(ns);return Math.sqrt(ns.reduce((s,x)=>s+(x-mean)**2,0)/ns.length)};
const vals=(rows,key)=>rows.map(r=>r.indicadores?.[key]).filter(v=>typeof v==='number'&&Number.isFinite(v));
function csvFile(rows){
  const cols=[['created_at','Fecha'],['codigo_alumno','Código'],['grupo','Curso'],...questions.map(q=>[q.id,q.title]),
    ['traslado_km_semana','Traslado km/semana'],['electricidad_kwh_persona_mes','Electricidad kWh/mes/persona'],['res_kg_semana','Carne de res kg/semana']];
  const safe=value=>{let str=String(value??'');if(/^[\s\uFEFF]*[=+@-]/.test(str))str="'"+str;return '"'+str.replaceAll('"','""')+'"'};
  const lines=[cols.map(c=>safe(c[1])).join(';')];
  for(const row of rows){lines.push(cols.map(([key])=>safe(questions.some(q=>q.id===key)?labelFor(key,row.respuestas?.[key]):key in (row.indicadores||{})?row.indicadores[key]:row[key])).join(';'))}
  return '\ufeff'+lines.join('\r\n')+'\r\n';
}
function downloadCsv(rows){if(!rows.length)return;const blob=new Blob([csvFile(rows)],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`EcoAula_7_respuestas_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1800);notify(`${rows.length} respuestas exportadas para Excel`)}
function renderDashboard(rows,demo){
  const groups=[...new Set(rows.map(r=>r.grupo||'Sin curso'))].sort((a,b)=>a.localeCompare(b,'es'));
  if(currentGroup!=='Todos'&&!groups.includes(currentGroup))currentGroup='Todos';
  const filtered=currentGroup==='Todos'?rows:rows.filter(r=>r.grupo===currentGroup);
  const keys=[['traslado_km_semana','Traslado (km/sem)'],['electricidad_kwh_persona_mes','Electricidad (kWh/persona/mes)'],['res_kg_semana','Carne res (kg/sem)']];
  const travel=vals(filtered,'traslado_km_semana');const electricity=vals(filtered,'electricidad_kwh_persona_mes');const beef=vals(filtered,'res_kg_semana');
  const counts=q=>q.options.map(o=>({label:o.label,count:filtered.filter(r=>r.respuestas?.[q.id]===o.id).length}));
  $('#adminContent').innerHTML=`<div class="notice ${demo?'warn':''}">${demo?'<b>Modo demostración:</b> solo datos de este navegador. Los resultados de otros alumnos NO llegan aquí hasta conectar Supabase.':'Datos del grupo almacenados en Supabase. El panel está protegido mediante inicio de sesión docente.'}</div>
    <div class="dashboard-tools"><label for="courseFilter" style="font-size:12px;font-weight:800">Curso</label><select id="courseFilter"><option value="Todos">Todos los cursos</option>${groups.map(g=>`<option value="${esc(g)}" ${g===currentGroup?'selected':''}>${esc(g)}</option>`).join('')}</select>
    <button type="button" class="btn btn-primary" id="exportCsv" ${filtered.length?'':'disabled'}>↓ Exportar a Excel (CSV)</button>
    <button type="button" class="btn btn-outline" id="refreshData">↻ Actualizar</button>${demo?'':'<button type="button" class="btn btn-outline" id="logoutAdmin">Cerrar sesión</button>'}</div>
    <div class="stats"><div class="stat-card"><small>Alumnos</small><strong>${filtered.length}</strong></div><div class="stat-card"><small>Prom. km/semana</small><strong>${fmt(avg(travel))}</strong></div><div class="stat-card"><small>Prom. kWh/persona</small><strong>${fmt(avg(electricity))}</strong></div><div class="stat-card"><small>Prom. res kg/sem</small><strong>${fmt(avg(beef),2)}</strong></div></div>
    <div class="charts"><div class="chart-card"><h3>Transporte utilizado</h3>${counts(questions[0]).map(x=>`<div class="bar-row"><span>${esc(x.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${filtered.length?100*x.count/filtered.length:0}%"></div></div><b>${x.count}</b></div>`).join('')}</div>
    <div class="chart-card"><h3>Resumen estadístico de indicadores</h3><div class="table-outer"><table class="data-table"><thead><tr><th>Variable</th><th>N válido</th><th>Media</th><th>Mediana</th><th>Desv. est.</th></tr></thead><tbody>${keys.map(([k,label])=>{const n=vals(filtered,k);return `<tr><td>${esc(label)}</td><td>${n.length}</td><td>${fmt(avg(n))}</td><td>${fmt(median(n))}</td><td>${fmt(std(n))}</td></tr>`}).join('')}</tbody></table></div></div></div>
    <h3 style="font-size:17px;margin:23px 0 11px">Frecuencia de respuestas por pregunta</h3>
    <div class="freq-grid">${questions.map((q,i)=>{const n=filtered.filter(r=>r.respuestas?.[q.id]!==null&&r.respuestas?.[q.id]!==undefined).length;return `<section class="freq-card"><h4>${i+1}. ${esc(q.title)}</h4>${counts(q).map(o=>`<div class="freq-line"><span>${esc(o.label)}</span><strong>${o.count} (${n?Math.round(o.count/n*100):0}%)</strong></div>`).join('')}<p class="admin-footnote">Respuestas válidas: ${n}</p></section>`}).join('')}</div>
    <h3 style="font-size:17px;margin:23px 0 11px">Respuestas individuales</h3><div class="table-outer"><table class="data-table"><thead><tr><th>Código</th><th>Curso</th><th>Medio</th><th>km/sem</th><th>kWh/persona</th><th>kg res/sem</th></tr></thead><tbody>${filtered.length?filtered.map(r=>`<tr><td>${esc(r.codigo_alumno)}</td><td>${esc(r.grupo)}</td><td>${esc(labelFor('transporte',r.respuestas?.transporte))}</td><td>${fmt(r.indicadores?.traslado_km_semana)}</td><td>${fmt(r.indicadores?.electricidad_kwh_persona_mes)}</td><td>${fmt(r.indicadores?.res_kg_semana,2)}</td></tr>`).join(''):'<tr><td colspan="6" class="no-data">Aún no hay respuestas registradas.</td></tr>'}</tbody></table></div>
    <p class="admin-footnote">La exportación contiene las respuestas originales y tres indicadores aproximados. «No sé» en electricidad no se incorpora al promedio. No interpretar los resultados como huella total de carbono.</p>`;
  $('#courseFilter').addEventListener('change',e=>{currentGroup=e.target.value;renderDashboard(rows,demo)});
  $('#exportCsv').addEventListener('click',()=>downloadCsv(filtered));
  $('#refreshData').addEventListener('click',()=>demo?renderDashboard(demoRows(),true):loadDashboard());
  $('#logoutAdmin')?.addEventListener('click',async()=>{const db=await getDb();await db.auth.signOut();renderLogin()});
}
async function loadDashboard(){
  $('#adminContent').innerHTML='<p>Cargando respuestas…</p>';
  try{const db=await getDb();const rows=[];const limit=500;for(let from=0;from<20000;from+=limit){
    const {data,error}=await db.from('encuestas_v2').select('id,created_at,codigo_alumno,grupo,instrumento_version,respuestas,indicadores')
      .eq('instrumento_version',VERSION).order('created_at',{ascending:false}).range(from,from+limit-1);
    if(error)throw error;rows.push(...data);if(data.length<limit)break;
  }renderDashboard(rows,false)}catch(e){$('#adminContent').innerHTML=`<p class="error">No se pudo consultar: ${esc(e.message)}</p>`}
}
function renderLogin(message=''){
  $('#adminContent').innerHTML=`<form class="admin-form" id="loginForm"><p>Escribe el correo docente autorizado para acceder al panel privado. Recibirás un enlace de acceso.</p><label for="adminEmail">Correo del docente</label><input type="email" id="adminEmail" placeholder="docente@universidad.edu" autocomplete="email" required><p class="error" id="loginMessage">${esc(message)}</p><button class="btn btn-primary" type="submit">Enviar enlace de acceso ↗</button></form>`;
  $('#loginForm').addEventListener('submit',async e=>{
    e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;
    try{const db=await getDb();const {error}=await db.auth.signInWithOtp({email:$('#adminEmail').value.trim(),options:{emailRedirectTo:location.origin+location.pathname,shouldCreateUser:true}});
      $('#loginMessage').style.color=error?'#b74330':'#286d48';$('#loginMessage').textContent=error?error.message:'Revisa tu correo y abre el enlace. Solo personas autorizadas pueden ver los datos.';
    }catch(e){$('#loginMessage').textContent=e.message}finally{button.disabled=false}
  });
}
async function openAdmin(){const dlg=$('#adminDialog');if(!dlg.open)dlg.showModal();$('#adminContent').innerHTML='<p>Abriendo panel…</p>';
  if(!connected){renderDashboard(demoRows(),true);return}
  try{const db=await getDb();const {data,error}=await db.auth.getUser();if(error)throw error;
    if(data.user&&!data.user.is_anonymous){const access=await db.rpc('is_admin');if(access.error)throw access.error;if(access.data){await loadDashboard();return}}
    renderLogin();
  }catch(e){renderLogin(`No se pudo verificar la sesión: ${e.message}`)}
}

buildQuestions();
$('#questions').addEventListener('change',event=>{
  if(!event.target.matches('input[type="radio"]'))return;
  chosen[event.target.name]=event.target.value;
  event.target.closest('.question-card').setAttribute('aria-invalid','false');
  $('#surveyError').textContent='';updateVisibility();
});
$('#surveyForm').addEventListener('submit',sendSurvey);
$('#adminLink').addEventListener('click',openAdmin);
$('#closeAdmin').addEventListener('click',()=>$('#adminDialog').close());
$('#adminDialog').addEventListener('click',e=>{if(e.target===$('#adminDialog'))$('#adminDialog').close()});
if(!connected)document.querySelector('.intro-meta').insertAdjacentHTML('beforeend','<span>🧪 Modo demo</span>');
