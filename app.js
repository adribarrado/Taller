
const UNITS=["ud","m","cm","kg","g","L","ml","caja","rollo","bote","par","juego","m²"];
const ESTADOS={idea:"Idea",pendiente:"Pendiente",curso:"En curso",terminado:"Terminado"};
const ESTADO_PILL={idea:"steel",pendiente:"warn",curso:"ok",terminado:"steel"};
const PRIO={alta:"Alta",media:"Media",baja:"Baja"};
const S={tq:"",tf:"todas",mats:new Map(),projs:new Map(),compras:new Map(),movs:[],tab:"resumen",q:"",cat:"",pf:"activos",ready:{m:0,p:0,c:0}};
let db=null,sb=null,me="",myId=null,canWrite=true;
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const eur=n=>new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"}).format(+n||0);
const eurU=n=>{n=+n||0;return new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:n&&Math.abs(n)<1?4:2}).format(n)};
const qf=n=>{n=+n||0;return Number.isInteger(n)?String(n):n.toLocaleString("es-ES",{maximumFractionDigits:3})};
const num=v=>{const n=parseFloat(String(v).replace(",","."));return isFinite(n)?n:0};
try{const t=localStorage.getItem("taller.tab");if(t)S.tab=t}catch(e){}

function toast(msg){document.querySelectorAll(".toast").forEach(x=>x.remove());const d=document.createElement("div");d.className="toast";d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),2600)}
async function guard(fn,okMsg){if(!db){toast("Sin conexión con los datos compartidos");return false}
  if(!canWrite){toast("Sin conexión: los cambios se podrán hacer cuando vuelva internet");return false}
  try{await fn();if(okMsg)toast(okMsg);return true}catch(e){toast("No se pudo guardar: "+(e?.message||e?.code||"error"));return false}}
async function log(texto){try{await sb.from("movimientos").insert({usuario:me||"Alguien",texto})}catch(e){}}

/* ---------- cálculos ---------- */
const activeProj=p=>(p.estado==="pendiente"||p.estado==="curso")&&!p.consumido;
function linePrice(l){if(l.matId){const m=S.mats.get(l.matId);return m?num(m.precio):num(l.precio)}return num(l.precio)}
function lineName(l){if(l.matId){const m=S.mats.get(l.matId);return m?m.nombre:(l.nombre||"(material borrado)")}return l.nombre}
function needs(){const n=new Map();for(const [pid,p] of S.projs){if(!activeProj(p))continue;for(const l of p.lineas||[]){if(!l.matId)continue;const e=n.get(l.matId)||{q:0,ps:[]};e.q+=num(l.cantidad);e.ps.push(p.nombre);n.set(l.matId,e)}}return n}
function projCalc(p){let total=0,falta=0,have=0;const need=new Map();
  for(const l of p.lineas||[]){const c=num(l.cantidad)*linePrice(l);total+=c;
    if(l.matId){const m=S.mats.get(l.matId);const st=m?num(m.cantidad):0;const used=need.get(l.matId)||0;const avail=Math.max(0,st-used);const covered=p.consumido?num(l.cantidad):Math.min(avail,num(l.cantidad));need.set(l.matId,used+num(l.cantidad));have+=covered*linePrice(l);falta+=(num(l.cantidad)-covered)*linePrice(l)}
    else if(l.ok||p.consumido){have+=c}else{falta+=c}}
  const otros=num(p.otros);return{total:total+otros,mat:total,otros,falta,have,pct:total?have/total:1}}
function shopping(){const out=[];const n=needs();
  for(const [id,m] of S.mats){const need=n.get(id)?.q||0;const min=num(m.minimo);const st=num(m.cantidad);const falta=Math.max(0,need+min-st);
    if(falta>0){const why=[];if(st<min)why.push("bajo mínimo");if(need>0&&need>st)why.push("para "+[...new Set(n.get(id).ps)].join(", "));else if(need>0)why.push("reservado para trabajos");
      out.push({kind:"mat",id,nombre:m.nombre,unidad:m.unidad,cant:falta,precio:num(m.precio),why:why.join(" · ")||"reponer",ubic:m.ubicacion})}}
  for(const [pid,p] of S.projs){if(!activeProj(p))continue;(p.lineas||[]).forEach((l,i)=>{if(!l.matId&&!l.ok)out.push({kind:"proj",pid,i,nombre:l.nombre,unidad:l.unidad||"ud",cant:num(l.cantidad),precio:num(l.precio),why:"para "+p.nombre})})}
  for(const [id,c] of S.compras)out.push({kind:"man",id,nombre:c.nombre,unidad:c.unidad||"ud",cant:num(c.cantidad),precio:num(c.precio),why:c.nota||"añadido a mano"});
  return out}

/* ---------- render ---------- */
function setTab(t){S.tab=t;try{localStorage.setItem("taller.tab",t)}catch(e){}
  document.querySelectorAll("nav button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===t));render()}
function render(){const sh=shopping();const b=$("#bCompras");b.hidden=!sh.length;b.textContent=sh.length;
  if(!started){return}
  const v={resumen:vResumen,stock:vStock,herramientas:vHerr,compras:vCompras,proyectos:vProyectos,asesor:vAsesor,historial:vHistorial}[S.tab]||vResumen;
  const keep=document.activeElement?.id;const pos=document.activeElement?.selectionStart;
  $("#main").innerHTML=(canWrite?"":`<div class="notice">Sin conexión. Ves la última copia guardada en este dispositivo; podrás hacer cambios cuando vuelva internet.</div>`)+v(sh);
  if(keep){const el=document.getElementById(keep);if(el){el.focus();try{el.setSelectionRange(pos,pos)}catch(e){}}}
  $("#fab").hidden=S.tab==="asesor";hydratePhotos();
  if(S.tab==="asesor"&&S.chatScroll){S.chatScroll=false;const last=document.querySelector(".chat .msg:last-child");last&&last.scrollIntoView({block:"start",behavior:"smooth"})}}

function stockValue(){let v=0,n=0;for(const m of S.mats.values()){if(m.herramienta)continue;v+=num(m.cantidad)*num(m.precio);n++}return{v,n}}
function vResumen(sh){const sv=stockValue();const low=[...S.mats.values()].filter(m=>!m.herramienta&&num(m.minimo)>0&&num(m.cantidad)<num(m.minimo)).length;
  const act=[...S.projs.values()].filter(activeProj);const pres=act.reduce((a,p)=>a+projCalc(p).total,0);const comp=sh.reduce((a,x)=>a+x.cant*x.precio,0);
  const byCat=new Map();for(const m of S.mats.values()){if(m.herramienta)continue;const c=m.categoria||"Sin categoría";byCat.set(c,(byCat.get(c)||0)+num(m.cantidad)*num(m.precio))}
  const cats=[...byCat].sort((a,b)=>b[1]-a[1]);const max=cats[0]?.[1]||1;
  return `<section class="kpis">
    <div class="panel kpi"><span class="eyebrow">Valor del stock</span><span class="v">${eur(sv.v)}</span><span class="muted">${sv.n} materiales</span></div>
    <div class="panel kpi ${low?"alert":""}"><span class="eyebrow">Bajo mínimo</span><span class="v">${low}</span><span class="muted">materiales por reponer</span></div>
    <div class="panel kpi"><span class="eyebrow">Lista de compra</span><span class="v">${eur(comp)}</span><span class="muted">${sh.length} líneas estimadas</span></div>
    ${(()=>{const h=tools();const pr=h.filter(x=>x.prestamo);const ov=pr.filter(overdue).length;return `<div class="panel kpi ${ov?"alert":""}" data-act="goTab" data-t="herramientas" style="cursor:pointer"><span class="eyebrow">Herramientas</span><span class="v">${h.length}</span><span class="muted">${pr.length?`${pr.length} prestada${pr.length>1?"s":""}${ov?` · ${ov} sin devolver a tiempo`:""}`:"todas en el taller"}</span></div>`})()}
    <div class="panel kpi"><span class="eyebrow">Trabajos abiertos</span><span class="v">${act.length}</span><span class="muted">presupuesto ${eur(pres)}</span></div>
  </section>
  <section class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start">
    <div class="panel section"><div class="row"><h2>Valor por categoría</h2></div>
      ${cats.length?cats.map(([c,v])=>`<div><div class="money"><span>${esc(c)}</span><span class="num">${eur(v)}</span></div><div class="bar"><i style="width:${(v/max*100).toFixed(1)}%;background:var(--steel)"></i></div></div>`).join(""):`<p class="muted">Aún no hay materiales. Empieza en la pestaña Stock.</p>`}
    </div>
    ${tasksPanel()}
    <div class="panel section"><div class="row"><h2>Próximos trabajos</h2><span class="spacer"></span><button class="btn sm" data-act="newProj">+ Trabajo</button></div>
      ${act.length?act.sort(prioSort).slice(0,6).map(p=>{const c=projCalc(p);return `<div class="row" style="cursor:pointer" data-act="editProj" data-id="${p._id}"><span class="pill ${ESTADO_PILL[p.estado]}">${ESTADOS[p.estado]}</span><span style="font-weight:600;flex:1;min-width:0">${esc(p.nombre)}</span><span class="num muted">${eur(c.total)}</span></div>`}).join(""):`<p class="muted">No hay trabajos pendientes. Apunta la próxima reparación o idea.</p>`}
    </div>
  </section>`}
const prioSort=(a,b)=>({alta:0,media:1,baja:2}[a.prioridad||"media"]-{alta:0,media:1,baja:2}[b.prioridad||"media"])||String(a.fecha||"9").localeCompare(String(b.fecha||"9"));

function vStock(){const n=needs();const cats=[...new Set([...S.mats.values()].filter(m=>!m.herramienta).map(m=>m.categoria||"Sin categoría"))].sort();
  const q=S.q.toLowerCase();let ms=[...S.mats.entries()].map(([id,m])=>({...m,_id:id})).filter(m=>!m.herramienta&&(!S.cat||(m.categoria||"Sin categoría")===S.cat)&&(!q||[m.nombre,m.categoria,m.ubicacion,m.notas].join(" ").toLowerCase().includes(q)));
  ms.sort((a,b)=>(a.categoria||"~").localeCompare(b.categoria||"~")||a.nombre.localeCompare(b.nombre));
  let html=`<div class="row"><h2>Stock</h2><span class="spacer"></span><button class="btn" data-act="capture">Desde captura</button><button class="btn primary" data-act="newMat">+ Material</button></div>
  <div class="toolbar"><input type="search" id="q" placeholder="Buscar por nombre, ubicación, nota…" value="${esc(S.q)}"><select id="cat"><option value="">Todas las categorías</option>${cats.map(c=>`<option ${c===S.cat?"selected":""}>${esc(c)}</option>`).join("")}</select></div>`;
  if(![...S.mats.values()].some(m=>!m.herramienta))return html+`<div class="panel empty"><strong>El almacén está vacío</strong><span>Añade tu primer material: nombre, cantidad, precio por unidad y dónde está guardado.</span><button class="btn primary" data-act="newMat">+ Añadir material</button></div>`;
  if(!ms.length)return html+`<div class="panel empty"><span>No tienes nada que se llame «${esc(S.q)}».</span><button class="btn primary" data-act="newMatQ">+ Añadir «${esc(S.q)}» al stock</button></div>`;
  let cur=null,rows="";
  for(const m of ms){const c=m.categoria||"Sin categoría";if(c!==cur){cur=c;const tv=ms.filter(x=>(x.categoria||"Sin categoría")===c).reduce((a,x)=>a+num(x.cantidad)*num(x.precio),0);rows+=`<div class="catgroup"><span>${esc(c)}</span><span class="num">${eur(tv)}</span></div>`}
    const st=num(m.cantidad),min=num(m.minimo),res=n.get(m._id)?.q||0;const low=min>0&&st<min;
    rows+=`<div class="item ${low?"low":""}"><div style="min-width:0;display:flex;flex-direction:column;gap:3px">
      <div class="row" style="gap:8px;flex-wrap:nowrap">${m.foto?`<span data-act="editMat" data-id="${m._id}" style="display:flex;cursor:pointer">${thumb(m.foto)}</span>`:""}<span class="row" style="gap:6px 8px;min-width:0"><span class="name" data-act="editMat" data-id="${m._id}" tabindex="0">${esc(m.nombre)}</span>${low?`<span class="pill bad">bajo mínimo</span>`:""}${res?`<span class="pill warn">${qf(res)} reservado</span>`:""}</span></div>
      <div class="meta">${m.ubicacion?`<span class="loc">${esc(m.ubicacion)}</span>`:""}<span class="num">${eurU(m.precio)}/${esc(m.unidad||"ud")}</span>${min?`<span>mín. ${qf(min)}</span>`:""}<span class="num">valor ${eur(st*num(m.precio))}</span></div></div>
      <div class="qty"><button aria-label="Quitar uno" data-act="dec" data-id="${m._id}">−</button><button class="n num qtap" data-act="qty" data-id="${m._id}" aria-label="Cambiar cantidad"><b>${qf(st)}</b> ${esc(m.unidad||"ud")}</button><button aria-label="Añadir uno" data-act="inc" data-id="${m._id}">+</button></div></div>`}
  return html+`<div class="panel list">${rows}</div>${S.q?`<div class="row"><button class="btn ghost" data-act="newMatQ">+ Añadir «${esc(S.q)}» como material nuevo</button></div>`:""}`}

function vCompras(sh){const total=sh.reduce((a,x)=>a+x.cant*x.precio,0);
  let html=`<div class="row"><h2>Lista de compra</h2><span class="spacer"></span><span class="num" style="font-weight:600">${eur(total)}</span><button class="btn" data-act="capture" data-dest="compra">Desde captura</button><button class="btn primary" data-act="newCompra">+ Añadir</button></div>
  <p class="muted" style="margin:0">Se rellena sola con lo que está bajo mínimo y lo que falta para los trabajos pendientes o en curso. Al marcar algo como comprado entra en el stock.</p>`;
  if(!sh.length)return html+`<div class="panel empty"><strong>No falta nada</strong><span>Todo está por encima del mínimo y los trabajos abiertos tienen su material.</span></div>`;
  return html+`<div class="panel tblwrap"><table class="shop"><thead><tr><th>Material</th><th>Motivo</th><th class="r">Cantidad</th><th class="r">Estimado</th><th></th></tr></thead><tbody>${sh.map((x,i)=>`<tr>
    <td><b>${esc(x.nombre)}</b>${x.ubic?`<br><span class="loc">${esc(x.ubic)}</span>`:""}</td><td class="muted" style="font-size:.86rem">${esc(x.why)}</td>
    <td class="r num">${qf(x.cant)} ${esc(x.unidad)}</td><td class="r num">${x.precio?eur(x.cant*x.precio):"—"}</td>
    <td class="r" style="white-space:nowrap"><button class="btn sm primary" data-act="buy" data-i="${i}">Comprado</button>${x.kind==="man"?` <button class="btn sm ghost" data-act="delCompra" data-id="${x.id}" aria-label="Quitar">✕</button>`:""}</td></tr>`).join("")}</tbody></table></div>`}

function vProyectos(){const f=S.pf;let ps=[...S.projs.entries()].map(([id,p])=>({...p,_id:id}));
  ps=ps.filter(p=>f==="todos"||(f==="activos"?p.estado!=="terminado":f==="terminado"?p.estado==="terminado":p.estado===f)).sort(prioSort);
  let html=`<div class="row"><h2>Trabajos y proyectos</h2><span class="spacer"></span><select id="pf" style="width:auto">${[["activos","Abiertos"],["idea","Ideas"],["pendiente","Pendientes"],["curso","En curso"],["terminado","Terminados"],["todos","Todos"]].map(([k,l])=>`<option value="${k}" ${k===f?"selected":""}>${l}</option>`).join("")}</select><button class="btn primary" data-act="newProj">+ Trabajo</button></div>`;
  if(!ps.length)return html+`<div class="panel empty"><strong>Sin trabajos aquí</strong><span>Apunta una reparación o un proyecto con su lista de materiales y te calculo el presupuesto y lo que falta comprar.</span><button class="btn primary" data-act="newProj">+ Nuevo trabajo</button></div>`;
  return html+`<div class="projs">${ps.map(p=>{const c=projCalc(p);return `<button class="panel proj" data-act="editProj" data-id="${p._id}">
    <div class="row" style="gap:6px"><span class="pill ${ESTADO_PILL[p.estado]}">${ESTADOS[p.estado]||p.estado}</span><span class="eyebrow">${p.tipo==="reparacion"?"Reparación":"Proyecto"}</span><span class="spacer"></span>${p.prioridad==="alta"?`<span class="pill bad">Prioridad alta</span>`:""}</div>
    <div class="row" style="gap:10px;flex-wrap:nowrap">${p.foto?thumb(p.foto):""}<h3>${esc(p.nombre)}</h3></div>${(p.tareas||[]).length?`<span class="muted" style="font-size:.88rem">✓ ${(p.tareas||[]).filter(t=>t.ok).length}/${p.tareas.length} tareas</span>`:""}${p.descripcion?`<span class="muted" style="font-size:.88rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(p.descripcion)}</span>`:""}
    <div class="money"><span class="muted">Presupuesto</span><b class="num">${eur(c.total)}</b></div>
    ${c.mat?`<div class="bar" title="Material disponible"><i style="width:${(c.pct*100).toFixed(0)}%"></i></div><div class="money"><span class="muted">${(p.lineas||[]).length} materiales</span><span class="num ${c.falta>0?"":"muted"}" style="${c.falta>0?"color:var(--warn)":""}">${c.falta>0?"falta "+eur(c.falta):"todo disponible"}</span></div>`:`<span class="muted" style="font-size:.86rem">Sin materiales asignados</span>`}
    ${p.fecha?`<span class="muted num" style="font-size:.8rem">Para el ${new Date(p.fecha+"T00:00").toLocaleDateString("es-ES")}</span>`:""}</button>`}).join("")}</div>`}

function vHistorial(){
  return `<div class="row"><h2>Historial</h2><span class="muted">últimos ${S.movs.length} movimientos</span></div>
  <div class="panel section">${S.movs.length?`<ul class="log">${S.movs.map(m=>{const d=new Date(m.at);return `<li><time>${d.toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit"})} ${d.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}</time><span><b>${esc(m.usuario||"Alguien")}</b> ${esc(m.texto)}</span></li>`}).join("")}</ul>`:`<p class="muted">Aquí aparecerá quién añade, gasta o compra cada cosa.</p>`}</div>`}

/* ---------- modales ---------- */
function openModal(html,onMount){$("#modalRoot").innerHTML=`<div class="ov" data-act="ovClose"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;const f=$("#modalRoot input:not([type=file]):not([type=checkbox]), #modalRoot select");f&&f.focus();onMount&&onMount($("#modalRoot .modal"));hydratePhotos()}
function closeModal(){$("#modalRoot").innerHTML=""}
function datalist(id,vals){return `<datalist id="${id}">${[...new Set(vals.filter(Boolean))].sort().map(v=>`<option value="${esc(v)}">`).join("")}</datalist>`}

function matModal(id,pre,blob){const m=id?S.mats.get(id):{nombre:"",categoria:"",unidad:"ud",cantidad:0,minimo:0,precio:0,ubicacion:"",notas:"",...(pre||{})};const all=[...S.mats.values()];
  photoDraft={orig:id?m.foto||null:null,path:id?m.foto||null:null,blob:blob||null,url:blob?URL.createObjectURL(blob):null};
  openModal(`<div class="row"><h2>${id?"Editar material":"Nuevo material"}</h2><span class="spacer"></span>${id?"":`<button class="btn sm" data-act="capture" data-dest="stock">Rellenar desde captura</button>`}</div>
  <div class="photo" id="phBox">${photoInner()}</div>
  <form id="fMat" class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
    <label class="f" style="grid-column:1/-1">Nombre<input id="mNombre" required value="${esc(m.nombre)}" placeholder="Tornillo rosca chapa 4,2×19"></label>
    <label class="f">Categoría<input id="mCat" list="dlCat" value="${esc(m.categoria)}" placeholder="Tornillería"></label>
    <label class="f">Ubicación<input id="mUbic" list="dlUbic" value="${esc(m.ubicacion)}" placeholder="Estante A · caja 3"></label>
    <label class="f">Cantidad<input id="mCant" inputmode="decimal" value="${qf(m.cantidad)}"></label>
    <label class="f">Unidad<select id="mUnid">${UNITS.map(u=>`<option ${u===(m.unidad||"ud")?"selected":""}>${u}</option>`).join("")}</select></label>
    <label class="f">Stock mínimo<input id="mMin" inputmode="decimal" value="${qf(m.minimo)}"></label>
    <label class="f">Precio por unidad (€)<input id="mPrecio" inputmode="decimal" value="${m.precio?String(+(+m.precio).toFixed(4)).replace(".",","):""}" placeholder="0,00"></label>
    <label class="f" style="grid-column:1/-1">Notas<textarea id="mNotas" placeholder="Proveedor, referencia, medidas…">${esc(m.notas)}</textarea></label>
  </form>${datalist("dlCat",all.map(x=>x.categoria))}${datalist("dlUbic",all.map(x=>x.ubicacion))}
  <div class="foot">${id?`<button class="btn danger" data-act="delMat" data-id="${id}">Borrar</button><button class="btn" data-act="dupMat" data-id="${id}">Duplicar</button><span class="spacer"></span>`:""}<button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="saveMat" data-id="${id||""}">Guardar</button></div>`)}

async function saveMat(id){const nombre=$("#mNombre").value.trim();if(!nombre){toast("Ponle un nombre al material");return}
  const d={nombre,categoria:$("#mCat").value.trim(),ubicacion:$("#mUbic").value.trim(),cantidad:num($("#mCant").value),unidad:$("#mUnid").value,minimo:num($("#mMin").value),precio:num($("#mPrecio").value),notas:$("#mNotas").value.trim(),updatedAt:Date.now()};
  const prev=id?S.mats.get(id):null;
  let newId=null;const btn=$("[data-act=saveMat]");if(btn){btn.disabled=true;btn.textContent="Guardando…"}
  const ok=await guard(async()=>{const f=await commitPhoto("materiales");if(f)d.foto=f;if(id)await db.doc("materiales/"+id).set(d);else newId=(await db.collection("materiales").add(d)).id},id?"Material guardado":"Material añadido");
  if(!ok&&btn){btn.disabled=false;btn.textContent="Guardar"}
  if(ok&&newId){const mt=listMatches(d.nombre);if(mt.length){matchModal(newId,d,mt);log(`añadió ${qf(d.cantidad)} ${d.unidad} de ${d.nombre}`);return}}
  if(ok){closeModal();log(id?(prev&&num(prev.cantidad)!==d.cantidad?`ajustó ${d.nombre}: ${qf(prev.cantidad)} → ${qf(d.cantidad)} ${d.unidad}`:`editó ${d.nombre}`):`añadió ${qf(d.cantidad)} ${d.unidad} de ${d.nombre}`)}}

const qtyTimers={};
function bump(id,delta){const m=S.mats.get(id);if(!m)return;let t=qtyTimers[id];if(!t)t=qtyTimers[id]={from:num(m.cantidad),to:num(m.cantidad)};
  t.to=Math.max(0,t.to+delta);m.cantidad=t.to;render();clearTimeout(t.h);
  t.h=setTimeout(async()=>{delete qtyTimers[id];const {from,to}=t;if(from===to)return;
    const ok=await guard(()=>db.doc("materiales/"+id).update({cantidad:to,updatedAt:Date.now()}));if(ok)log(`${to<from?"gastó":"añadió"} ${qf(Math.abs(to-from))} ${m.unidad||"ud"} de ${m.nombre} (quedan ${qf(to)})`)},800)}

let draft=null;
function projModal(id,copy){const p=copy||(id?JSON.parse(JSON.stringify(S.projs.get(id))):{nombre:"",tipo:"reparacion",estado:"pendiente",prioridad:"media",fecha:"",descripcion:"",otros:0,lineas:[],tareas:[]});if(!p.tareas)p.tareas=[];draft={id,p};
  photoDraft={orig:id?p.foto||null:null,path:id?p.foto||null:null,blob:null,url:null};drawProj()}
function lineState(p,l,i){const m=l.matId&&S.mats.get(l.matId);const st=m?num(m.cantidad):0;return p.consumido?`<span class="pill steel">usado</span>`:l.matId?(st>=num(l.cantidad)?`<span class="pill ok">en stock</span>`:`<span class="pill warn">faltan ${qf(num(l.cantidad)-st)}</span>`):`<label class="row" style="gap:4px;font-size:.82rem;white-space:nowrap"><input type="checkbox" style="width:auto;min-height:0" data-act="lineOk" data-i="${i}" ${l.ok?"checked":""}>lo tengo</label>`}
function sumHTML(c){return `<div class="money"><span>Materiales</span><span class="num">${eur(c.mat)}</span></div><div class="money"><span>Otros</span><span class="num">${eur(c.otros)}</span></div><div class="money"><span class="muted">Falta por comprar</span><span class="num" style="color:var(--warn)">${eur(c.falta)}</span></div><div class="money" style="font-weight:600;border-top:1px solid var(--line);padding-top:4px"><span>Presupuesto total</span><span class="num">${eur(c.total)}</span></div>`}
function refreshProj(){readProjForm();const p=draft.p;(p.lineas||[]).forEach((l,i)=>{const a=document.getElementById("lc"+i),b=document.getElementById("ls"+i);if(a)a.textContent=eur(num(l.cantidad)*linePrice(l));if(b&&l.matId)b.innerHTML=lineState(p,l,i)});const ps=document.getElementById("pSum");if(ps)ps.innerHTML=sumHTML(projCalc(p))}
function drawProj(){const {id,p}=draft;const c=projCalc(p);const mats=[...S.mats.entries()].sort((a,b)=>a[1].nombre.localeCompare(b[1].nombre));
  const lines=(p.lineas||[]).map((l,i)=>{const state=lineState(p,l,i);
    return `<tr><td>${l.matId?`<b>${esc(lineName(l))}</b>`:`<input id="ln${i}" data-f="nombre" data-i="${i}" value="${esc(l.nombre)}" placeholder="Material">`}</td>
      <td class="r" style="width:90px"><input id="lq${i}" data-f="cantidad" data-i="${i}" inputmode="decimal" value="${qf(l.cantidad)}" style="text-align:right"></td>
      <td class="r" style="width:100px">${l.matId?`<span class="num">${eurU(linePrice(l))}</span>`:`<input id="lp${i}" data-f="precio" data-i="${i}" inputmode="decimal" value="${l.precio?String(l.precio).replace(".",","):""}" placeholder="€/ud" style="text-align:right">`}</td>
      <td class="r num" id="lc${i}">${eur(num(l.cantidad)*linePrice(l))}</td><td id="ls${i}">${state}</td><td><button class="btn sm ghost" data-act="lineDel" data-i="${i}" aria-label="Quitar línea">✕</button></td></tr>`}).join("");
  openModal(`<div class="row"><h2>${id?"Editar trabajo":"Nuevo trabajo"}</h2></div>
  <div class="grid2">
    <label class="f" style="grid-column:1/-1">Nombre<input id="pNombre" value="${esc(p.nombre)}" placeholder="Cambiar rodamiento lavadora"></label>
    <label class="f">Tipo<select id="pTipo"><option value="reparacion" ${p.tipo==="reparacion"?"selected":""}>Reparación</option><option value="proyecto" ${p.tipo==="proyecto"?"selected":""}>Proyecto</option></select></label>
    <label class="f">Estado<select id="pEstado">${Object.entries(ESTADOS).map(([k,v])=>`<option value="${k}" ${k===p.estado?"selected":""}>${v}</option>`).join("")}</select></label>
    <label class="f">Prioridad<select id="pPrio">${Object.entries(PRIO).map(([k,v])=>`<option value="${k}" ${k===p.prioridad?"selected":""}>${v}</option>`).join("")}</select></label>
    <label class="f">Para cuándo<input id="pFecha" type="date" value="${esc(p.fecha)}"></label>
    <label class="f" style="grid-column:1/-1">Descripción<textarea id="pDesc" placeholder="Qué hay que hacer, medidas, enlaces…">${esc(p.descripcion)}</textarea></label>
  </div>
  <div class="photo" id="phBox">${photoInner()}</div>
  <div class="row"><h3>Tareas</h3><span class="muted num">${p.tareas.filter(t=>t.ok).length}/${p.tareas.length}</span></div>
  ${p.tareas.length?`<ul class="tasks">${p.tareas.map((t,i)=>`<li><input type="checkbox" aria-label="Hecha" data-act="tOk" data-i="${i}" ${t.ok?"checked":""}><input id="tt${i}" data-t="${i}" value="${esc(t.t)}" class="${t.ok?"done":""}"><button class="btn sm ghost" data-act="tDel" data-i="${i}" aria-label="Quitar tarea">✕</button></li>`).join("")}</ul>`:""}
  <div class="row"><input id="tNew" placeholder="Nueva tarea (ej. desmontar tapa) y pulsa Enter" style="flex:1 1 200px;width:auto"><button class="btn" data-act="tAdd">+ Tarea</button></div>
  <div class="row"><h3>Materiales</h3><span class="spacer"></span></div>
  <div class="tblwrap"><table class="lines"><thead><tr><th>Material</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Coste</th><th></th><th></th></tr></thead><tbody>${lines||`<tr><td colspan="6" class="muted">Añade materiales del almacén o cosas que tengas que comprar.</td></tr>`}</tbody></table></div>
  <div class="row"><select id="addMat" style="flex:1 1 220px;width:auto"><option value="">+ Añadir del almacén…</option>${mats.map(([mid,m])=>`<option value="${mid}">${esc(m.nombre)} (${qf(m.cantidad)} ${esc(m.unidad||"ud")})</option>`).join("")}</select><button class="btn" data-act="lineFree">+ Algo que no está en stock</button></div>
  <div class="grid2"><label class="f">Otros gastos (€): mano de obra, envíos, herramientas<input id="pOtros" inputmode="decimal" value="${p.otros?String(p.otros).replace(".",","):""}" placeholder="0,00"></label>
    <div class="panel section" id="pSum" style="gap:4px;background:var(--bg)">${sumHTML(c)}</div></div>
  ${id&&!p.consumido&&(p.lineas||[]).some(l=>l.matId)?`<div class="panel section" style="background:var(--bg)"><span>Cuando termines, descuenta del stock el material usado.</span><div class="row"><button class="btn" data-act="consume">Descontar material y marcar terminado</button></div></div>`:""}
  ${p.consumido?`<p class="muted" style="margin:0">El material de este trabajo ya se descontó del stock.</p>`:""}
  <div class="foot">${id?`<button class="btn danger" data-act="delProj">Borrar</button><button class="btn" data-act="dupProj">Duplicar</button><span class="spacer"></span>`:""}<button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="saveProj">Guardar</button></div>`)}
function readProjForm(){const p=draft.p;if(!$("#pNombre"))return;p.nombre=$("#pNombre").value;p.tipo=$("#pTipo").value;p.estado=$("#pEstado").value;p.prioridad=$("#pPrio").value;p.fecha=$("#pFecha").value;p.descripcion=$("#pDesc").value;p.otros=num($("#pOtros").value);
  document.querySelectorAll("#modalRoot [data-f]").forEach(el=>{const l=p.lineas[+el.dataset.i];const f=el.dataset.f;l[f]=f==="nombre"?el.value:num(el.value)});
  document.querySelectorAll("#modalRoot [data-t]").forEach(el=>{const t=p.tareas[+el.dataset.t];if(t)t.t=el.value})}
async function saveProj(){readProjForm();const {id,p}=draft;p.nombre=p.nombre.trim();if(!p.nombre){toast("Ponle un nombre al trabajo");return}
  p.lineas=(p.lineas||[]).filter(l=>l.matId||String(l.nombre).trim());p.lineas.forEach(l=>{if(l.matId){const m=S.mats.get(l.matId);if(m)l.nombre=m.nombre}});p.updatedAt=Date.now();delete p._id;p.tareas=(p.tareas||[]).filter(t=>String(t.t).trim());
  const prevEstado=id?S.projs.get(id)?.estado:null;
  const ok=await guard(async()=>{const f=await commitPhoto("trabajos");if(f!==undefined){if(f)p.foto=f;else delete p.foto}if(id)await db.doc("proyectos/"+id).set(p);else await db.collection("proyectos").add(p)},"Trabajo guardado");
  if(ok){closeModal();log(!id?`creó el trabajo «${p.nombre}»`:prevEstado!==p.estado?`pasó «${p.nombre}» a ${ESTADOS[p.estado]}`:`editó el trabajo «${p.nombre}»`)}}
async function consume(){readProjForm();const {id,p}=draft;const short=[];
  for(const l of p.lineas){if(!l.matId||l.herramienta)continue;const m=S.mats.get(l.matId);if(!m)continue;if(num(m.cantidad)<num(l.cantidad))short.push(m.nombre)}
  const ok=await guard(async()=>{for(const l of p.lineas){if(!l.matId||l.herramienta)continue;const m=S.mats.get(l.matId);if(!m)continue;await db.doc("materiales/"+l.matId).update({cantidad:Math.max(0,num(m.cantidad)-num(l.cantidad)),updatedAt:Date.now()})}
    p.consumido=true;p.estado="terminado";delete p._id;p.updatedAt=Date.now();await db.doc("proyectos/"+id).set(p)},short.length?"Descontado (algunos quedaron a 0: "+short.join(", ")+")":"Material descontado del stock");
  if(ok){closeModal();log(`terminó «${p.nombre}» y descontó su material del stock`)}}

function compraModal(pre){const c={nombre:"",cantidad:1,unidad:"ud",precio:0,nota:"",...(pre||{})};openModal(`<div class="row"><h2>Añadir a la compra</h2><span class="spacer"></span>${pre?"":`<button class="btn sm" data-act="capture" data-dest="compra">Rellenar desde captura</button>`}</div><div class="grid2">
  <label class="f" style="grid-column:1/-1">Qué hay que comprar<input id="cNombre" placeholder="Disco de corte 125 mm" value="${esc(c.nombre)}"></label>
  <label class="f">Cantidad<input id="cCant" inputmode="decimal" value="${qf(c.cantidad)}"></label><label class="f">Unidad<select id="cUnid">${UNITS.map(u=>`<option ${u===c.unidad?"selected":""}>${u}</option>`).join("")}</select></label>
  <label class="f">Precio aprox. por unidad (€)<input id="cPrecio" inputmode="decimal" placeholder="0,00" value="${c.precio?String(+(+c.precio).toFixed(4)).replace(".",","):""}"></label><label class="f">Nota<input id="cNota" placeholder="Ferretería, Amazon…" value="${esc(c.nota)}"></label></div>
  <div class="foot"><button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="saveCompra">Añadir</button></div>`)}
function buyModal(x){openModal(`<h2>Comprado: ${esc(x.nombre)}</h2>
  <p class="muted" style="margin:0">${x.kind==="proj"?"Se tacha de la lista de compra de «"+esc(S.projs.get(x.pid)?.nombre||"")+"».":x.kind==="mat"?"Se sumará al stock y se actualizará el precio.":"Puedes guardarlo también en el stock."}</p>
  <div class="grid2"><label class="f">Cantidad comprada<input id="bCant" inputmode="decimal" value="${qf(x.cant)}"></label><label class="f">Precio por unidad pagado (€)<input id="bPrecio" inputmode="decimal" value="${x.precio?String(x.precio).replace(".",","):""}"></label>
  ${x.kind!=="mat"?`<label class="f" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="bStock" style="width:auto;min-height:0" checked>${x.kind==="proj"?"Guardarlo también en el stock (queda reservado para el trabajo)":"Añadir al stock como material nuevo"}</label>`:""}</div>
  <div class="foot"><button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="confirmBuy">Confirmar</button></div>`);buyX=x}
let buyX=null;
async function confirmBuy(){const x=buyX;const cant=num($("#bCant").value),precio=num($("#bPrecio").value);let ok;
  if(x.kind==="mat"){const m=S.mats.get(x.id);const d={cantidad:num(m.cantidad)+cant,updatedAt:Date.now()};if(precio)d.precio=precio;ok=await guard(()=>db.doc("materiales/"+x.id).update(d),"Añadido al stock")}
  else if(x.kind==="proj"){const p=JSON.parse(JSON.stringify(S.projs.get(x.pid)));delete p._id;const l=p.lineas[x.i];const toStock=$("#bStock")?.checked;
    ok=await guard(async()=>{if(toStock){const r=await db.collection("materiales").add({nombre:l.nombre,categoria:"",ubicacion:"",cantidad:cant,unidad:l.unidad||"ud",minimo:0,precio:precio||num(l.precio),notas:"Comprado para «"+p.nombre+"»",updatedAt:Date.now()});l.matId=r.id;delete l.ok;delete l.precio}else{l.ok=true;if(precio)l.precio=precio}
      await db.doc("proyectos/"+x.pid).set(p)},toStock?"Añadido al stock y reservado":"Marcado como conseguido")}
  else{const toStock=$("#bStock")?.checked;ok=await guard(async()=>{if(toStock)await db.collection("materiales").add({nombre:x.nombre,categoria:"",ubicacion:"",cantidad:cant,unidad:x.unidad,minimo:0,precio,notas:"",updatedAt:Date.now()});await db.doc("compras/"+x.id).delete()},toStock?"Añadido al stock":"Quitado de la lista")}
  if(ok){closeModal();log(`compró ${qf(cant)} ${x.unidad} de ${x.nombre}${precio?` a ${eur(precio)}/${x.unidad}`:""}`)}}

async function exportCsv(){const rows=[["Nombre","Categoría","Ubicación","Cantidad","Unidad","Mínimo","Precio unidad","Valor","Notas"]];
  for(const m of [...S.mats.values()].sort((a,b)=>a.nombre.localeCompare(b.nombre)))rows.push([m.nombre,m.categoria,m.ubicacion,qf(m.cantidad),m.unidad,qf(m.minimo),num(m.precio).toFixed(2).replace(".",","),(num(m.cantidad)*num(m.precio)).toFixed(2).replace(".",","),m.notas]);
  const csv="﻿"+rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(";")).join("\r\n");
  saveFile(`stock-taller-${new Date().toISOString().slice(0,10)}.csv`,new Blob([csv],{type:"text/csv;charset=utf-8"}))}
function saveFile(name,blob){const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);toast("Descargado: "+name)}
function exportBackup(){const out={exportado:new Date().toISOString(),materiales:Object.fromEntries(S.mats),proyectos:Object.fromEntries([...S.projs].map(([k,v])=>{const c={...v};delete c._id;return [k,c]})),compras:Object.fromEntries(S.compras)};
  saveFile(`copia-taller-${new Date().toISOString().slice(0,10)}.json`,new Blob([JSON.stringify(out,null,1)],{type:"application/json"}))}

/* ---------- fotos ---------- */
const fotoUrls=new Map(),fotoPending=new Set();let photoDraft=null;
function thumb(path,cls="thumb"){if(!path)return "";const u=fotoUrls.get(path);return `<img class="${cls}" alt="" data-foto="${esc(path)}" ${u?`src="${esc(u)}"`:""}>`}
function hydratePhotos(){const imgs=[...document.querySelectorAll("img[data-foto]")];imgs.forEach(i=>{const u=fotoUrls.get(i.dataset.foto);if(u&&i.getAttribute("src")!==u)i.src=u});
  const need=[...new Set(imgs.map(i=>i.dataset.foto))].filter(p=>!fotoUrls.has(p)&&!fotoPending.has(p));
  if(!need.length||!sb||!navigator.onLine)return;need.forEach(p=>fotoPending.add(p));
  sb.storage.from("fotos").createSignedUrls(need,60*60*12).then(({data})=>{for(const d of data||[])if(d.signedUrl)fotoUrls.set(d.path,d.signedUrl);need.forEach(p=>fotoPending.delete(p));
    document.querySelectorAll("img[data-foto]").forEach(i=>{const u=fotoUrls.get(i.dataset.foto);if(u&&!i.getAttribute("src"))i.src=u})}).catch(()=>need.forEach(p=>fotoPending.delete(p)))}
async function compress(file,max=1280,q=.82){let src,w,h;try{src=await createImageBitmap(file);w=src.width;h=src.height}catch(e){src=new Image();src.src=URL.createObjectURL(file);await src.decode();w=src.naturalWidth;h=src.naturalHeight}
  const k=Math.min(1,max/Math.max(w,h));const c=document.createElement("canvas");c.width=Math.round(w*k);c.height=Math.round(h*k);const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.drawImage(src,0,0,c.width,c.height);
  return await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("imagen")),"image/jpeg",q))}
async function uploadFoto(blob,folder){const path=`${folder}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;
  const {error}=await sb.storage.from("fotos").upload(path,blob,{contentType:"image/jpeg",upsert:false});if(error)throw new Error("la foto no se pudo subir ("+error.message+"). ¿Has ejecutado supabase-fotos.sql?");
  fotoUrls.set(path,URL.createObjectURL(blob));return path}
function removeFoto(path){if(path&&sb)sb.storage.from("fotos").remove([path]).catch(()=>{})}
function photoInner(){const d=photoDraft||{};const has=d.blob||d.path;
  const img=d.blob?`<img class="pimg" src="${d.url}" alt="Foto">`:d.path?thumb(d.path,"pimg"):`<div class="pimg ph-empty">Sin foto</div>`;
  return `${img}<div class="row" style="gap:6px"><label class="btn sm">Hacer foto<input type="file" accept="image/*" capture="environment" data-photo hidden></label><label class="btn sm">Elegir imagen<input type="file" accept="image/*" data-photo hidden></label>${has?`<button class="btn sm ghost" data-act="phDel">Quitar foto</button>`:""}</div>`}
async function setPhotoFile(file){if(!file||!photoDraft)return;try{const b=await compress(file);photoDraft.blob=b;photoDraft.url=URL.createObjectURL(b);photoDraft.path=null;$("#phBox").innerHTML=photoInner()}catch(e){toast("No se pudo leer la imagen")}}
async function commitPhoto(folder){const d=photoDraft;if(!d)return undefined;if(d.blob){const p=await uploadFoto(d.blob,folder);if(d.orig)removeFoto(d.orig);d.orig=p;d.path=p;d.blob=null;return p}
  if(!d.path&&d.orig){removeFoto(d.orig);d.orig=null;return ""}return d.path||""}

/* ---------- captura con IA ---------- */
let capBlob=null,capData=null,capDest="";
const capKeepPhoto=()=>$("#capFoto")?$("#capFoto").checked:false;
function captureModal(dest){capDest=dest||"";capBlob=null;capData=null;openModal(`<h2>Foto o captura de un producto</h2>
  <p class="muted" style="margin:0">La IA rellena nombre, precio, cantidad y medidas, y tú lo revisas antes de guardar. Si estaba en tu lista de compra, se tacha solo.</p>
  <div class="drop" id="capDrop"><span>En la tienda: hazle una foto al producto o a su etiqueta. En casa: pega (Ctrl+V) o arrastra una captura de la web.</span><div class="row" style="justify-content:center"><label class="btn primary">Hacer foto al producto<input type="file" accept="image/*" capture="environment" data-cap hidden></label><label class="btn">Elegir captura o imagen<input type="file" accept="image/*" data-cap hidden></label></div></div>
  <div id="capOut"></div><div class="foot"><button class="btn" data-act="close">Cancelar</button></div>`)}
const toB64=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(",")[1]);r.onerror=rej;r.readAsDataURL(b)});
function fromAI(a){const cant=num(a.cantidad_paquete)||1;const total=num(a.precio_total);const unidad=UNITS.includes(a.unidad)?a.unidad:"ud";
  const notas=[a.marca&&("Marca: "+a.marca),a.referencia&&("Ref.: "+a.referencia),a.medidas&&("Medidas: "+a.medidas),a.tienda&&("Tienda: "+a.tienda),total&&cant!==1?`Paquete de ${qf(cant)} ${unidad} a ${eur(total)}`:"",a.notas].filter(Boolean).join(" · ");
  return {nombre:a.nombre||"",categoria:a.categoria||"",unidad,cantidad:cant,precio:total&&cant?Math.round(total/cant*10000)/10000:0,precioTotal:total,notas,tienda:a.tienda||"",minimo:0,ubicacion:""}}
async function readCapture(file){if(!file)return;const out=$("#capOut");if(!out)return;
  if(!sb||!navigator.onLine){toast("Hace falta internet para leer la captura");return}
  try{capBlob=await compress(file,1600,.85)}catch(e){toast("No se pudo leer la imagen");return}
  const url=URL.createObjectURL(capBlob);$("#capDrop").hidden=true;
  out.innerHTML=`<div class="capres"><img src="${url}" alt="Captura"><div class="muted"><b>Leyendo la captura…</b><br>Suele tardar entre 3 y 10 segundos.</div></div>`;
  let res;try{res=await sb.functions.invoke("leer-captura",{body:{image:await toB64(capBlob),mime:"image/jpeg"}})}catch(e){res={error:e}}
  if(!$("#capOut"))return;
  if(res.error||!res.data?.ok){let msg="No se pudo leer la captura.";const st=res.error?.context?.status;
    try{const j=await res.error?.context?.json?.();if(j?.error)msg=j.error+(j.detalle?` (${j.detalle.slice(0,140)})`:"")}catch(e){}
    if(st===404)msg="La lectura con IA aún no está activada: falta crear la función «leer-captura» en Supabase (paso 7 de la guía).";
    $("#capOut").innerHTML=`<div class="capres"><img src="${url}" alt=""><div><p class="err">${esc(msg)}</p><div class="row" style="margin-top:8px"><button class="btn" data-act="capRetry">Probar con otra</button></div></div></div>`;return}
  capData=fromAI(res.data.datos||{});const d=capData;
  $("#capOut").innerHTML=`<div class="capres"><img src="${url}" alt=""><div style="min-width:0;display:flex;flex-direction:column;gap:4px">
    <b>${esc(d.nombre||"(sin nombre)")}</b><span class="num">${d.precio?`${eurU(d.precio)}/${esc(d.unidad)}`:"Sin precio"}${d.precioTotal&&d.cantidad!==1?` · ${qf(d.cantidad)} ${esc(d.unidad)} por ${eur(d.precioTotal)}`:""}</span>
    ${d.categoria?`<span class="loc" style="align-self:flex-start">${esc(d.categoria)}</span>`:""}<span class="muted" style="font-size:.86rem">${esc(d.notas)}</span></div></div>
    <label class="row" style="gap:8px;font-size:.9rem;flex-wrap:nowrap"><input type="checkbox" id="capFoto" style="width:auto;min-height:0" checked>Guardar la captura como foto del material</label>
    <div class="row"><button class="btn ${capDest==="compra"||capDest==="herr"||/herramient/i.test(d.categoria)?"":"primary"}" data-act="capStock">Añadir al stock</button><button class="btn ${capDest==="herr"||/herramient/i.test(d.categoria)?"primary":""}" data-act="capHerr">Es una herramienta</button><button class="btn ${capDest==="compra"?"primary":""}" data-act="capCompra">Añadir a la compra</button><button class="btn ghost" data-act="capRetry">Otra captura</button></div>`}
document.addEventListener("paste",e=>{const it=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith("image/"));if(!it||!started)return;
  const f=it.getAsFile();if(!f)return;e.preventDefault();
  if($("#capDrop")&&!$("#capDrop").hidden){readCapture(f);return}
  if($("#phBox")){setPhotoFile(f);return}
  if(!$("#modalRoot").innerHTML){captureModal("");setTimeout(()=>readCapture(f),30)}});
document.addEventListener("dragover",e=>{const d=e.target.closest?.("#capDrop");if(d){e.preventDefault();d.classList.add("over")}});
document.addEventListener("dragleave",e=>{const d=e.target.closest?.("#capDrop");if(d)d.classList.remove("over")});
document.addEventListener("drop",e=>{const d=e.target.closest?.("#capDrop");if(!d)return;e.preventDefault();const f=[...e.dataTransfer.files].find(f=>f.type.startsWith("image/"));if(f)readCapture(f)});

/* ---------- atajos ---------- */
function qtyModal(id){const m=S.mats.get(id);if(!m)return;const open=[...S.projs.entries()].filter(([k,p])=>p.estado!=="terminado"&&!p.consumido).sort((a,b)=>prioSort(a[1],b[1]));
  openModal(`<div class="row" style="flex-wrap:nowrap">${m.foto?thumb(m.foto):""}<h2 style="min-width:0">${esc(m.nombre)}</h2></div>
  <span class="muted">Ahora hay <b class="num">${qf(m.cantidad)} ${esc(m.unidad||"ud")}</b>${m.ubicacion?` · <span class="loc">${esc(m.ubicacion)}</span>`:""}</span>
  <label class="f">Cantidad exacta<input id="qVal" inputmode="decimal" class="big" value="${qf(m.cantidad)}"></label>
  <div class="row qbtns">${[-10,-1,1,10].map(d=>`<button class="btn" data-act="qAdd" data-d="${d}">${d>0?"+":"−"}${Math.abs(d)}</button>`).join("")}</div>
  ${open.length?`<div class="panel section" style="background:var(--bg)"><b>Apuntar en un trabajo</b><div class="row"><select id="qProj" style="flex:1 1 160px;width:auto">${open.map(([k,p])=>`<option value="${k}">${esc(p.nombre)}</option>`).join("")}</select><input id="qProjN" inputmode="decimal" value="1" aria-label="Cantidad para el trabajo" style="width:80px"><button class="btn" data-act="qToProj" data-id="${id}">Apuntar</button></div><span class="muted" style="font-size:.85rem">Queda reservado para ese trabajo y se descuenta del stock al terminarlo.</span></div>`:""}
  <div class="foot"><button class="btn" data-act="editMat" data-id="${id}">Editar ficha</button><span class="spacer"></span><button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="qSave" data-id="${id}">Guardar cantidad</button></div>`,()=>{const i=$("#qVal");if(i){i.focus();i.select()}})}
async function qtySave(id){const m=S.mats.get(id);const to=Math.max(0,num($("#qVal").value)),from=num(m.cantidad);if(to===from){closeModal();return}
  if(await guard(()=>db.doc("materiales/"+id).update({cantidad:to,updatedAt:Date.now()}),"Cantidad guardada")){closeModal();log(`${to<from?"gastó":"añadió"} ${qf(Math.abs(to-from))} ${m.unidad||"ud"} de ${m.nombre} (quedan ${qf(to)})`)}}
async function qtyToProj(id){const pid=$("#qProj").value,n=num($("#qProjN").value)||1;const p=JSON.parse(JSON.stringify(S.projs.get(pid)));delete p._id;p.lineas=p.lineas||[];
  const ex=p.lineas.find(l=>l.matId===id);if(ex)ex.cantidad=num(ex.cantidad)+n;else p.lineas.push({matId:id,nombre:S.mats.get(id).nombre,cantidad:n});p.updatedAt=Date.now();
  if(await guard(()=>db.doc("proyectos/"+pid).set(p),"Apuntado en «"+p.nombre+"»")){closeModal();log(`apuntó ${qf(n)} ${S.mats.get(id).unidad||"ud"} de ${S.mats.get(id).nombre} para «${p.nombre}»`)}}
function addTask(){const i=$("#tNew");const v=i?.value.trim();if(!v){i?.focus();return}readProjForm();draft.p.tareas.push({t:v,ok:false});drawProj();$("#tNew")?.focus()}
function tasksPanel(){const items=[];for(const [pid,p] of [...S.projs].sort((a,b)=>prioSort(a[1],b[1]))){if(p.estado==="terminado"||p.consumido)continue;(p.tareas||[]).forEach((t,i)=>{if(!t.ok)items.push({pid,i,t:t.t,p:p.nombre})})}
  return `<div class="panel section"><div class="row"><h2>Tareas pendientes</h2><span class="muted num">${items.length}</span></div>
  ${items.length?`<ul class="tasks">${items.slice(0,12).map(x=>`<li><input type="checkbox" aria-label="Marcar como hecha" data-act="tQuick" data-pid="${x.pid}" data-i="${x.i}"><span style="min-width:0"><span>${esc(x.t)}</span><br><span class="muted" style="font-size:.8rem;cursor:pointer" data-act="editProj" data-id="${x.pid}">${esc(x.p)}</span></span></li>`).join("")}</ul>${items.length>12?`<span class="muted">y ${items.length-12} más en Trabajos</span>`:""}`:`<p class="muted">Sin tareas pendientes. Añade pasos a cada trabajo (desmontar, comprar pieza, probar…) y aparecerán aquí.</p>`}</div>`}
async function quickTask(pid,i,ok){const p=JSON.parse(JSON.stringify(S.projs.get(pid)));delete p._id;if(!p.tareas?.[i])return;p.tareas[i].ok=ok;p.updatedAt=Date.now();
  if(await guard(()=>db.doc("proyectos/"+pid).set(p),ok?"Tarea hecha":null)&&ok)log(`terminó la tarea «${p.tareas[i].t}» de «${p.nombre}»`)}
function fabMenu(){openModal(`<h2>Añadir</h2><div class="sheet">
  <button class="btn primary" data-act="capture">Foto de un producto (se rellena sola)</button>
  <button class="btn" data-act="goAsesor">Planificar un trabajo con el asesor</button>
  <button class="btn" data-act="newMat">Material al stock</button>
  <button class="btn" data-act="newTool">Herramienta</button>
  <button class="btn" data-act="newCompra">Algo a la lista de compra</button>
  <button class="btn" data-act="newProj">Trabajo o proyecto</button></div>
  <div class="foot"><button class="btn" data-act="close">Cerrar</button></div>`)}

/* ---------- lista de compra: tachar al comprar ---------- */
const STOP=new Set("de la el los las del para con por en y a un una al o x mm cm".split(" "));
const toks=t=>new Set(String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/[^a-z0-9]+/).filter(w=>w&&!STOP.has(w)&&(w.length>1||/\d/.test(w))));
function simil(a,b){const A=toks(a),B=toks(b);if(!A.size||!B.size)return 0;let c=0,word=false;for(const w of A)if(B.has(w)){c++;if(!/^\d+$/.test(w))word=true}return word?c/Math.min(A.size,B.size):0}
function listMatches(nombre){return shopping().filter(x=>x.kind!=="mat").map(x=>({...x,score:simil(nombre,x.nombre)})).filter(x=>x.score>=.5).sort((a,b)=>b.score-a.score).slice(0,3)}
let matchCtx=null;
function matchModal(newId,d,mt){matchCtx={newId,d,mt};openModal(`<h2>¿Era algo de tu lista?</h2>
  <p class="muted" style="margin:0">Has guardado <b>${esc(d.nombre)}</b>. Si es una de estas cosas, la tacho de la lista de compra${mt.some(x=>x.kind==="proj")?" y la dejo reservada para su trabajo":""}.</p>
  <div class="sheet">${mt.map((x,k)=>`<button class="btn" data-act="linkBuy" data-k="${k}"><b>${esc(x.nombre)}</b><br><span class="muted" style="font-size:.86rem">${esc(x.why)} · ${qf(x.cant)} ${esc(x.unidad)}</span></button>`).join("")}</div>
  <div class="foot"><button class="btn" data-act="close">No, es otra cosa</button></div>`)}
async function linkBuy(k){const {newId,d,mt}=matchCtx;const x=mt[k];let ok;
  if(x.kind==="proj"){const p=JSON.parse(JSON.stringify(S.projs.get(x.pid)));delete p._id;const l=p.lineas[x.i];l.matId=newId;l.nombre=d.nombre;delete l.ok;delete l.precio;ok=await guard(()=>db.doc("proyectos/"+x.pid).set(p),"Tachado de la lista y reservado para «"+p.nombre+"»")}
  else ok=await guard(()=>db.doc("compras/"+x.id).delete(),"Tachado de la lista de compra");
  if(ok){closeModal();log(`compró ${d.nombre} (${x.why})`)}}

/* ---------- asesor de proyectos ---------- */
try{S.chat=JSON.parse(localStorage.getItem("taller.chat")||"[]")}catch(e){S.chat=[]}
S.chatDraft="";let chatBusy=false;
function saveChat(){try{localStorage.setItem("taller.chat",JSON.stringify(S.chat.slice(-40)))}catch(e){}}
function fmt(t){return esc(t).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").split("\n").map(l=>l.replace(/^\s*[-*•]\s+/,"• ")).join("<br>")}
const EXAMPLES=["Quiero poner un enchufe nuevo en el garaje","Cambiar el termostato de la caldera por uno wifi","Montar una estantería de 2 m en la pared de pladur","Medidor de temperatura con ESP32 y pantalla"];
function matStatus(x){const m=x.stockId&&S.mats.get(x.stockId);if(!m)return{k:"buy",t:"comprar",falta:num(x.cantidad)};const st=num(m.cantidad);
  if(m.herramienta||x.herr){if(m.prestamo)return{k:"warn",t:"prestada a "+m.prestamo.persona,falta:0};if(st>0||m.herramienta)return{k:"ok",t:"la tienes",falta:0}}if(st>=num(x.cantidad))return{k:"ok",t:`en stock (${qf(st)})`,falta:0};return{k:"warn",t:`tienes ${qf(st)}, faltan ${qf(num(x.cantidad)-st)}`,falta:num(x.cantidad)-st}}
const pillS=s=>`<span class="pill ${s.k==="buy"?"bad":s.k}">${esc(s.t)}</span>`;
const totS=(n,b)=>`<span>A comprar: ${n} ${n===1?"cosa":"cosas"}</span><b class="num">≈ ${eur(b)}</b>`;
function refreshProp(i){const p=S.chat[i]?.propuesta;if(!p)return;let b=0,n=0;p.materiales.forEach((x,k)=>{const s=matStatus(x);if(x.sel&&s.falta>0){b+=s.falta*num(x.precio);n++}const el=document.getElementById(`ps${i}_${k}`);if(el)el.innerHTML=pillS(s)});const t=document.getElementById("pt"+i);if(t)t.innerHTML=totS(n,b)}
function propHTML(m,i){const p=m.propuesta;let buy=0,nBuy=0;
  const rows=p.materiales.map((x,k)=>{const s=matStatus(x);if(x.sel&&s.falta>0){buy+=s.falta*num(x.precio);nBuy++}
    return `<tr class="${x.sel?"":"off"}"><td><input type="checkbox" aria-label="Incluir" data-act="pSel" data-m="${i}" data-k="${k}" ${x.sel?"checked":""} ${m.creado?"disabled":""}></td>
    <td><b>${esc(x.nombre)}</b>${x.herr?` <span class="pill steel">herramienta</span>`:""}${x.motivo?`<br><span class="muted" style="font-size:.82rem">${esc(x.motivo)}</span>`:""}</td>
    <td class="r" style="white-space:nowrap">${m.creado?`<span class="num">${qf(x.cantidad)}</span>`:`<input id="pq${i}_${k}" data-pq="${i}_${k}" inputmode="decimal" value="${qf(x.cantidad)}" aria-label="Cantidad" style="width:64px;min-height:30px;padding:3px 6px;text-align:right">`} ${esc(x.unidad)}</td>
    <td class="r num">${x.precio?eurU(x.precio):"—"}</td><td id="ps${i}_${k}">${pillS(s)}</td></tr>`}).join("");
  return `<div class="prop"><div class="row"><span class="eyebrow">Propuesta de trabajo</span><span class="spacer"></span><span class="pill ${p.tipo==="proyecto"?"steel":"warn"}">${p.tipo==="proyecto"?"Proyecto":"Reparación"}</span></div>
    <h3>${esc(p.nombre)}</h3>${p.descripcion?`<span class="muted">${esc(p.descripcion)}</span>`:""}
    ${p.tareas.length?`<details ${m.creado?"":"open"}><summary>Pasos (${p.tareas.length})</summary><ol>${p.tareas.map(t=>`<li>${esc(t)}</li>`).join("")}</ol></details>`:""}
    ${p.materiales.length?`<div class="tblwrap"><table class="ptbl"><thead><tr><th></th><th>Material</th><th class="r">Cant.</th><th class="r">Precio est.</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="money" id="pt${i}">${totS(nBuy,buy)}</div>`:""}
    ${m.creado?`<div class="row"><span class="pill ok">Trabajo creado</span><button class="btn sm" data-act="editProj" data-id="${m.creado}">Ver trabajo</button><button class="btn sm" data-act="goTab" data-t="compras">Ver lista de compra</button></div>`
      :`<div class="row"><button class="btn primary" data-act="propCreate" data-m="${i}">Crear trabajo y añadir lo que falta a la compra</button></div><span class="muted" style="font-size:.82rem">Lo que ya tienes queda reservado; lo que falta pasa a la lista de compra. Los precios son orientativos.</span>`}</div>`}
function vAsesor(){const msgs=S.chat.map((m,i)=>m.rol==="user"?`<div class="msg me">${fmt(m.texto)}</div>`:`<div class="msg ai ${m.error?"bad":""}"><div>${fmt(m.texto)}</div>${m.propuesta?propHTML(m,i):""}</div>`).join("");
  const intro=`<div class="msg ai"><div>Cuéntame qué quieres hacer y te digo cómo, qué necesitas y qué te falta comprar. Miro tu stock antes de proponer nada.</div><div class="row" style="margin-top:10px;gap:6px">${EXAMPLES.map(t=>`<button class="btn sm" data-act="chatEx" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div></div>`;
  return `<div class="row"><h2>Asesor de proyectos</h2><span class="spacer"></span>${S.chat.length?`<button class="btn sm" data-act="chatNew">Nueva conversación</button>`:""}</div>
  <div class="chat">${msgs||intro}${chatBusy?`<div class="msg ai typing">Pensando… (suele tardar entre 5 y 20 segundos)</div>`:""}</div>
  <form id="fChat" class="chatbar"><textarea id="chatIn" rows="2" placeholder="Ej.: quiero cambiar el grifo del baño por uno termostático">${esc(S.chatDraft)}</textarea><button class="btn primary" id="chatSend" ${chatBusy?"disabled":""}>Enviar</button></form>`}
function normProp(p){if(!p||!p.nombre)return null;const mats=(p.materiales||[]).filter(x=>x&&x.nombre).map(x=>{let sid=x.stock_id&&S.mats.has(x.stock_id)?x.stock_id:null;
    if(!sid){for(const [id,m] of S.mats)if(m.nombre.toLowerCase()===String(x.nombre).toLowerCase()){sid=id;break}}
    return{nombre:sid?S.mats.get(sid).nombre:x.nombre,cantidad:num(x.cantidad)||1,unidad:UNITS.includes(x.unidad)?x.unidad:(sid?S.mats.get(sid).unidad:"ud")||"ud",precio:sid?num(S.mats.get(sid).precio):num(x.precio_estimado),stockId:sid,herr:!!x.es_herramienta,motivo:x.motivo||"",sel:true}});
  return{nombre:p.nombre,tipo:p.tipo==="proyecto"?"proyecto":"reparacion",descripcion:p.descripcion||"",tareas:(p.tareas||[]).filter(Boolean),materiales:mats}}
async function sendChat(text){text=String(text||"").trim();if(!text||chatBusy)return;if(!sb||!navigator.onLine){toast("El asesor necesita internet");return}
  S.chat.push({rol:"user",texto:text});S.chatDraft="";chatBusy=true;S.chatScroll=true;saveChat();render();
  const hist=S.chat.filter(m=>!m.error).map(m=>({rol:m.rol,texto:m.propuesta?m.texto+"\n[Propuesta enviada: «"+m.propuesta.nombre+"»: "+m.propuesta.materiales.map(x=>x.nombre+" "+qf(x.cantidad)+" "+x.unidad).join(", ")+(m.creado?" — el usuario ya creó el trabajo":"")+"]":m.texto}));
  for(let k=hist.length-1;k>0;k--)if(hist[k].rol===hist[k-1].rol){hist[k-1].texto+="\n"+hist[k].texto;hist.splice(k,1)}
  const stock=[...S.mats].map(([id,m])=>({id,n:m.nombre,c:m.herramienta?1:num(m.cantidad),u:m.unidad||"ud",cat:m.categoria||"",...(m.herramienta?{h:1,p:m.prestamo?.persona||""}:{})}));
  let res;try{res=await sb.functions.invoke("leer-captura",{body:{modo:"asesor",mensajes:hist,stock}})}catch(e){res={error:e}}
  chatBusy=false;
  if(res.error||!res.data?.ok){let msg="No he podido responder ahora mismo. Prueba otra vez en un momento.";const st=res.error?.context?.status;
    try{const j=await res.error?.context?.json?.();if(j?.error)msg=j.error+(j.detalle?` (${j.detalle.slice(0,140)})`:"")}catch(e){}
    if(st===404)msg="El asesor aún no está activado: falta crear la función «leer-captura» en Supabase (paso 7 de la guía).";
    S.chat.push({rol:"model",texto:msg,error:true})}
  else{const d=res.data.datos||{};S.chat.push({rol:"model",texto:d.respuesta||"",propuesta:d.hay_propuesta?normProp(d.propuesta):null})}
  S.chatScroll=true;saveChat();render()}
async function propCreate(i){const m=S.chat[i];const pr=m.propuesta;if(m.creado)return;
  const sel=pr.materiales.filter(x=>x.sel);const tools=[];const lineas=[];
  for(const x of sel){if(x.stockId&&S.mats.has(x.stockId)){const sm=S.mats.get(x.stockId);if((x.herr||sm.herramienta)&&(sm.herramienta||num(sm.cantidad)>0)){tools.push(x.nombre+(sm.prestamo?` (prestada a ${sm.prestamo.persona}: recupérala)`:""));continue}lineas.push({matId:x.stockId,nombre:x.nombre,cantidad:x.cantidad,...(x.herr?{herramienta:true}:{})})}
    else lineas.push({matId:null,nombre:x.nombre,cantidad:x.cantidad,precio:x.precio,unidad:x.unidad,ok:false,...(x.herr?{herramienta:true}:{})})}
  const p={nombre:pr.nombre,tipo:pr.tipo,estado:"pendiente",prioridad:"media",fecha:"",descripcion:[pr.descripcion,tools.length?"Herramientas que ya tienes: "+tools.join(", ")+".":""].filter(Boolean).join("\n"),otros:0,lineas,tareas:pr.tareas.map(t=>({t,ok:false})),updatedAt:Date.now(),origen:"asesor"};
  let newId=null;const ok=await guard(async()=>{newId=(await db.collection("proyectos").add(p)).id},null);
  if(!ok)return;m.creado=newId;saveChat();const n=shopping().filter(x=>(x.kind==="proj"&&x.pid===newId)||(x.kind==="mat"&&lineas.some(l=>l.matId===x.id))).length;
  toast(`Trabajo creado · ${n} ${n===1?"cosa":"cosas"} a la lista de compra`);log(`creó el trabajo «${p.nombre}» con el asesor`);render()}
document.addEventListener("submit",e=>{if(e.target.id==="fChat"){e.preventDefault();sendChat($("#chatIn").value)}});

/* ---------- herramientas ---------- */
const ESTADO_H={bien:"Funciona",reparar:"Para reparar",rota:"Rota"};
const todayISO=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const fdate=s=>s?new Date(s+"T00:00").toLocaleDateString("es-ES",{day:"numeric",month:"short"}):"";
const tools=()=>[...S.mats.entries()].filter(([,m])=>m.herramienta).map(([id,m])=>({...m,_id:id}));
const overdue=m=>!!(m.prestamo&&m.prestamo.hasta&&m.prestamo.hasta<todayISO());
const people=()=>[...new Set(tools().flatMap(m=>[m.prestamo?.persona,...(m.historial||[]).map(h=>h.persona)]).filter(Boolean))].sort();
function toolPill(m){if(m.prestamo){const p=m.prestamo;return `<span class="pill ${overdue(m)?"bad":"warn"}">${overdue(m)?"Sin devolver · ":""}Prestada a ${esc(p.persona)} desde ${fdate(p.desde)}${p.hasta?` · vuelve ${fdate(p.hasta)}`:""}</span>`}
  return m.estado&&m.estado!=="bien"?`<span class="pill bad">${ESTADO_H[m.estado]}</span>`:`<span class="pill ok">En el taller</span>`}
function waLink(m){const p=m.prestamo;const txt=`Hola ${p.persona}, ¿me devuelves ${m.nombre} cuando puedas? Te la dejé el ${fdate(p.desde)}. ¡Gracias!`;return "https://wa.me/?text="+encodeURIComponent(txt)}
function vHerr(){const all=tools();const q=S.tq.toLowerCase();const lent=all.filter(m=>m.prestamo);const val=all.reduce((a,m)=>a+num(m.precio),0);
  let ls=all.filter(m=>(S.tf==="todas"||(S.tf==="prestadas"?m.prestamo:S.tf==="taller"?!m.prestamo:m.estado&&m.estado!=="bien"))&&(!q||[m.nombre,m.categoria,m.ubicacion,m.notas,m.prestamo?.persona].join(" ").toLowerCase().includes(q)));
  ls.sort((a,b)=>(a.categoria||"~").localeCompare(b.categoria||"~")||a.nombre.localeCompare(b.nombre));
  const byP=new Map();for(const m of lent){const k=m.prestamo.persona;byP.set(k,[...(byP.get(k)||[]),m])}
  let html=`<div class="row"><h2>Herramientas</h2><span class="spacer"></span><button class="btn" data-act="capture" data-dest="herr">Desde foto</button><button class="btn primary" data-act="newTool">+ Herramienta</button></div>
  <section class="kpis"><div class="panel kpi"><span class="eyebrow">Tienes</span><span class="v">${all.length}</span><span class="muted">valor ${eur(val)}</span></div>
  <div class="panel kpi ${lent.some(overdue)?"alert":""}"><span class="eyebrow">Prestadas</span><span class="v">${lent.length}</span><span class="muted">${lent.some(overdue)?(n=>`${n} ${n>1?"pasadas":"pasada"} de fecha`)(lent.filter(overdue).length):lent.length?"a "+byP.size+" persona"+(byP.size>1?"s":""):"todas en el taller"}</span></div></section>`;
  if(lent.length)html+=`<div class="panel section"><h3>¿Quién tiene qué?</h3>${[...byP].map(([p,ms])=>`<div class="who"><b>${esc(p)}</b><div class="list">${ms.map(m=>`<div class="lendrow ${overdue(m)?"late":""}"><span style="min-width:0"><span class="name" data-act="editTool" data-id="${m._id}" tabindex="0">${esc(m.nombre)}</span><br><span class="muted" style="font-size:.84rem">desde ${fdate(m.prestamo.desde)}${m.prestamo.hasta?` · prevista ${fdate(m.prestamo.hasta)}`:""}${m.prestamo.nota?" · "+esc(m.prestamo.nota):""}</span></span><span class="row" style="gap:6px;flex-wrap:nowrap">${overdue(m)?`<a class="btn sm" href="${waLink(m)}" target="_blank" rel="noopener">Recordar</a>`:""}<button class="btn sm primary" data-act="giveBack" data-id="${m._id}">Devuelta</button></span></div>`).join("")}</div></div>`).join("")}</div>`;
  html+=`<div class="toolbar"><input type="search" id="tq" placeholder="Buscar herramienta, ubicación o persona…" value="${esc(S.tq)}"><div class="seg">${[["todas","Todas"],["taller","En el taller"],["prestadas","Prestadas"],["reparar","Averiadas"]].map(([k,l])=>`<button class="${S.tf===k?"on":""}" data-act="tf" data-f="${k}">${l}</button>`).join("")}</div></div>`;
  if(!all.length)return html+`<div class="panel empty"><strong>Aún no hay herramientas</strong><span>Apunta las que tienes (taladro, radial, polímetro…) con su sitio en el taller. Así sabrás cuáles tienes y a quién se las has dejado.</span><button class="btn primary" data-act="newTool">+ Añadir herramienta</button></div>`;
  if(!ls.length)return html+`<div class="panel empty">${S.tq?`<span>No tienes ninguna «${esc(S.tq)}».</span><button class="btn primary" data-act="newTool">+ Añadir herramienta</button>`:"Nada en este filtro."}</div>`;
  let cur=null,rows="";
  for(const m of ls){const c=m.categoria||"Sin categoría";if(c!==cur){cur=c;rows+=`<div class="catgroup"><span>${esc(c)}</span><span class="num">${ls.filter(x=>(x.categoria||"Sin categoría")===c).length}</span></div>`}
    rows+=`<div class="item ${overdue(m)?"low":""}"><div style="min-width:0;display:flex;gap:10px;align-items:center">${m.foto?`<span data-act="editTool" data-id="${m._id}" style="display:flex;cursor:pointer">${thumb(m.foto)}</span>`:""}<div style="min-width:0;display:flex;flex-direction:column;gap:3px">
      <span class="name" data-act="editTool" data-id="${m._id}" tabindex="0">${esc(m.nombre)}</span>
      <div class="meta">${m.ubicacion?`<span class="loc">${esc(m.ubicacion)}</span>`:""}${m.marca?`<span>${esc(m.marca)}</span>`:""}${toolPill(m)}</div></div></div>
      <div class="row" style="gap:6px;justify-content:flex-end">${m.prestamo?`<button class="btn sm primary" data-act="giveBack" data-id="${m._id}">Devuelta</button>`:`<button class="btn sm" data-act="lend" data-id="${m._id}">Prestar</button>`}</div></div>`}
  return html+`<div class="panel list">${rows}</div>`}
function toolModal(id,pre,blob){const m=id?S.mats.get(id):{nombre:"",categoria:"",marca:"",ubicacion:"",precio:0,estado:"bien",notas:"",...(pre||{})};const all=tools();
  photoDraft={orig:id?m.foto||null:null,path:id?m.foto||null:null,blob:blob||null,url:blob?URL.createObjectURL(blob):null};
  const hist=(m.historial||[]).slice().reverse();
  openModal(`<div class="row"><h2>${id?"Editar herramienta":"Nueva herramienta"}</h2><span class="spacer"></span>${id?"":`<button class="btn sm" data-act="capture" data-dest="herr">Rellenar desde foto</button>`}</div>
  ${id?`<div class="row">${toolPill(m)}<span class="spacer"></span>${m.prestamo?`<button class="btn sm primary" data-act="giveBack" data-id="${id}">Marcar como devuelta</button>`:`<button class="btn sm" data-act="lend" data-id="${id}">Prestar</button>`}</div>`:""}
  <div class="photo" id="phBox">${photoInner()}</div>
  <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
    <label class="f" style="grid-column:1/-1">Nombre<input id="hNombre" value="${esc(m.nombre)}" placeholder="Taladro percutor 18 V"></label>
    <label class="f">Tipo<input id="hCat" list="dlHCat" value="${esc(m.categoria)}" placeholder="Eléctrica, Manual, Medición…"></label>
    <label class="f">Marca / modelo<input id="hMarca" value="${esc(m.marca)}" placeholder="Bosch GSB 18V"></label>
    <label class="f">Dónde se guarda<input id="hUbic" list="dlHUbic" value="${esc(m.ubicacion)}" placeholder="Armario 1 · balda 2"></label>
    <label class="f">Estado<select id="hEstado">${Object.entries(ESTADO_H).map(([k,v])=>`<option value="${k}" ${k===(m.estado||"bien")?"selected":""}>${v}</option>`).join("")}</select></label>
    <label class="f">Valor aprox. (€)<input id="hPrecio" inputmode="decimal" value="${m.precio?String(m.precio).replace(".",","):""}" placeholder="0,00"></label>
    <label class="f" style="grid-column:1/-1">Notas<textarea id="hNotas" placeholder="Accesorios, batería, nº de serie, garantía…">${esc(m.notas)}</textarea></label>
  </div>${datalist("dlHCat",["Eléctrica","Batería","Manual","Medición","Corte","Jardín","Fontanería","Electricidad","Soldadura","Mecánica",...all.map(x=>x.categoria)])}${datalist("dlHUbic",[...S.mats.values()].map(x=>x.ubicacion))}
  ${hist.length?`<details><summary>Préstamos anteriores (${hist.length})</summary><ul class="log">${hist.map(h=>`<li><time>${fdate(h.desde)}</time><span><b>${esc(h.persona)}</b> · devuelta el ${fdate(h.devuelta)}${h.nota?" · "+esc(h.nota):""}</span></li>`).join("")}</ul></details>`:""}
  <div class="foot">${id?`<button class="btn danger" data-act="delTool" data-id="${id}">Borrar</button><span class="spacer"></span>`:""}<button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="saveTool" data-id="${id||""}">Guardar</button></div>`)}
async function saveTool(id){const nombre=$("#hNombre").value.trim();if(!nombre){toast("Ponle un nombre a la herramienta");return}
  const prev=id?S.mats.get(id):{};const d={...prev,herramienta:true,nombre,categoria:$("#hCat").value.trim(),marca:$("#hMarca").value.trim(),ubicacion:$("#hUbic").value.trim(),estado:$("#hEstado").value,precio:num($("#hPrecio").value),notas:$("#hNotas").value.trim(),cantidad:1,unidad:"ud",minimo:0,updatedAt:Date.now()};
  const btn=$("[data-act=saveTool]");if(btn){btn.disabled=true;btn.textContent="Guardando…"}
  const ok=await guard(async()=>{const f=await commitPhoto("herramientas");if(f)d.foto=f;else if(f==="")delete d.foto;if(id)await db.doc("materiales/"+id).set(d);else await db.collection("materiales").add(d)},id?"Herramienta guardada":"Herramienta añadida");
  if(!ok&&btn){btn.disabled=false;btn.textContent="Guardar"}
  if(ok){closeModal();log(id?(prev.estado!==d.estado?`marcó ${d.nombre} como «${ESTADO_H[d.estado]}»`:`editó la herramienta ${d.nombre}`):`añadió la herramienta ${d.nombre}`)}}
function lendModal(id){const m=S.mats.get(id);openModal(`<h2>Prestar: ${esc(m.nombre)}</h2>
  <div class="grid2"><label class="f" style="grid-column:1/-1">¿Quién se la lleva?<input id="lPersona" list="dlPeople" placeholder="Nombre"></label>
  <label class="f">Desde<input id="lDesde" type="date" value="${todayISO()}"></label><label class="f">Devolución prevista (opcional)<input id="lHasta" type="date"></label>
  <label class="f" style="grid-column:1/-1">Nota (opcional)<input id="lNota" placeholder="Con 2 baterías y maletín"></label></div>${datalist("dlPeople",people())}
  <div class="foot"><button class="btn" data-act="lendMe" data-id="${id}">Me la llevo yo</button><span class="spacer"></span><button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="lendSave" data-id="${id}">Prestar</button></div>`)}
async function lendSave(id,who){const m=S.mats.get(id);const persona=(who||$("#lPersona")?.value||"").trim();if(!persona){toast("Escribe quién se la lleva");$("#lPersona")?.focus();return}
  const p={persona,desde:(!who&&$("#lDesde")?.value)||todayISO(),hasta:(!who&&$("#lHasta")?.value)||"",nota:(!who&&$("#lNota")?.value.trim())||""};
  if(await guard(()=>db.doc("materiales/"+id).update({prestamo:p,updatedAt:Date.now()}),`${m.nombre} prestada a ${persona}`)){closeModal();log(`prestó ${m.nombre} a ${persona}${p.hasta?` hasta el ${fdate(p.hasta)}`:""}`)}}
async function giveBack(id){const m=S.mats.get(id);if(!m?.prestamo)return;const h=[...(m.historial||[]),{...m.prestamo,devuelta:todayISO()}].slice(-20);
  const d={...m,historial:h,updatedAt:Date.now()};delete d.prestamo;
  if(await guard(()=>db.doc("materiales/"+id).set(d),`${m.nombre} vuelve al taller`)){if($("#modalRoot").innerHTML)closeModal();log(`recibió ${m.nombre} de vuelta (la tenía ${m.prestamo.persona})`)}}

/* ---------- eventos ---------- */
const pendingDel={};
document.addEventListener("click",async e=>{const t=e.target.closest("[data-act]");if(!t)return;const a=t.dataset.act,id=t.dataset.id;
  if(a==="ovClose"&&e.target!==t)return;
  if(t.closest("nav"))return;
  switch(a){
    case "ovClose":case "close":closeModal();draft=null;break;
    case "newMat":matModal();break; case "newMatQ":matModal(null,{nombre:S.q});break;
    case "dupMat":{const m=S.mats.get(id);const c={...m,nombre:m.nombre+" (copia)",cantidad:0};delete c.foto;matModal(null,c);toast("Copia lista: cambia lo que haga falta y guarda")}break;
    case "dupProj":{readProjForm();const c=JSON.parse(JSON.stringify(draft.p));delete c._id;delete c.foto;c.nombre+=" (copia)";c.estado="pendiente";c.consumido=false;c.tareas=(c.tareas||[]).map(t=>({t:t.t,ok:false}));c.lineas=(c.lineas||[]).map(l=>({...l,ok:false}));projModal(null,c);toast("Copia lista: revisa y guarda")}break;
    case "phDel":photoDraft.blob=null;photoDraft.path=null;$("#phBox").innerHTML=photoInner();break;
    case "capture":captureModal(t.dataset.dest||"");break;
    case "capStock":matModal(null,capData,capKeepPhoto()?capBlob:null);break;
    case "capCompra":compraModal({nombre:capData.nombre,cantidad:capData.cantidad,unidad:capData.unidad,precio:capData.precio,nota:[capData.tienda,capData.precioTotal?("paquete "+eur(capData.precioTotal)):""].filter(Boolean).join(" · ")});break;
    case "capRetry":captureModal(capDest);break;
    case "qty":qtyModal(id);break;
    case "qAdd":{const i=$("#qVal");i.value=qf(Math.max(0,num(i.value)+num(t.dataset.d)))}break;
    case "qSave":qtySave(id);break;
    case "qToProj":qtyToProj(id);break;
    case "tAdd":addTask();break;
    case "tDel":readProjForm();draft.p.tareas.splice(+t.dataset.i,1);drawProj();break;
    case "tOk":readProjForm();draft.p.tareas[+t.dataset.i].ok=t.checked;drawProj();break;
    case "tQuick":quickTask(t.dataset.pid,+t.dataset.i,t.checked);break;
    case "fab":fabMenu();break;
    case "newTool":toolModal();break; case "editTool":toolModal(id);break; case "saveTool":saveTool(id);break;
    case "capHerr":toolModal(null,{nombre:capData.nombre,categoria:/herramient/i.test(capData.categoria)?"":capData.categoria,precio:capData.precioTotal||capData.precio,notas:capData.notas},capKeepPhoto()?capBlob:null);break;
    case "lend":lendModal(id);break; case "lendMe":lendSave(id,me);break; case "lendSave":lendSave(id);break; case "giveBack":giveBack(id);break;
    case "tf":S.tf=t.dataset.f;render();break;
    case "delTool":if(!pendingDel[id]){pendingDel[id]=1;t.textContent="¿Seguro? Pulsa otra vez";setTimeout(()=>delete pendingDel[id],4000);break}
      {const m=S.mats.get(id);if(await guard(()=>db.doc("materiales/"+id).delete(),"Herramienta borrada")){removeFoto(m?.foto);closeModal();log(`borró la herramienta ${m?.nombre}`)}}break;
    case "goAsesor":closeModal();setTab("asesor");setTimeout(()=>$("#chatIn")?.focus(),50);break;
    case "linkBuy":linkBuy(+t.dataset.k);break;
    case "chatNew":S.chat=[];S.chatDraft="";saveChat();render();break;
    case "chatEx":sendChat(t.dataset.t);break;
    case "pSel":{const pr=S.chat[+t.dataset.m].propuesta;pr.materiales[+t.dataset.k].sel=t.checked;saveChat();render()}break;
    case "propCreate":propCreate(+t.dataset.m);break;
    case "goTab":setTab(t.dataset.t);break; case "editMat":matModal(id);break; case "saveMat":saveMat(id);break;
    case "delMat":if(!pendingDel[id]){pendingDel[id]=1;t.textContent="¿Seguro? Pulsa otra vez";setTimeout(()=>delete pendingDel[id],4000);break}
      {const m=S.mats.get(id);if(await guard(()=>db.doc("materiales/"+id).delete(),"Material borrado")){removeFoto(m?.foto);closeModal();log(`borró ${m?.nombre}`)}}break;
    case "inc":if(canWrite)bump(id,1);else toast("Tu acceso es de solo lectura");break; case "dec":if(canWrite)bump(id,-1);else toast("Tu acceso es de solo lectura");break;
    case "csv":exportCsv();break; case "backup":exportBackup();break; case "account":accountModal();break; case "saveName":saveName();break; case "logout":logout();break;
    case "newProj":projModal();break; case "editProj":projModal(id);break; case "saveProj":saveProj();break; case "consume":consume();break;
    case "delProj":if(!pendingDel.p){pendingDel.p=1;t.textContent="¿Seguro? Pulsa otra vez";setTimeout(()=>delete pendingDel.p,4000);break}
      {const n=draft.p.nombre,fo=S.projs.get(draft.id)?.foto;if(await guard(()=>db.doc("proyectos/"+draft.id).delete(),"Trabajo borrado")){removeFoto(fo);closeModal();log(`borró el trabajo «${n}»`)}}break;
    case "lineFree":readProjForm();draft.p.lineas.push({matId:null,nombre:"",cantidad:1,precio:0,unidad:"ud",ok:false});drawProj();{const i=draft.p.lineas.length-1;$("#ln"+i)?.focus()}break;
    case "lineDel":readProjForm();draft.p.lineas.splice(+t.dataset.i,1);drawProj();break;
    case "lineOk":readProjForm();draft.p.lineas[+t.dataset.i].ok=t.checked;drawProj();break;
    case "newCompra":compraModal();break;
    case "saveCompra":{const n=$("#cNombre").value.trim();if(!n){toast("Escribe qué hay que comprar");break}
      if(await guard(()=>db.collection("compras").add({nombre:n,cantidad:num($("#cCant").value),unidad:$("#cUnid").value,precio:num($("#cPrecio").value),nota:$("#cNota").value.trim(),at:Date.now()}),"Añadido a la compra")){closeModal();log(`apuntó en la compra: ${n}`)}}break;
    case "delCompra":{const c=S.compras.get(id);if(await guard(()=>db.doc("compras/"+id).delete(),"Quitado de la lista"))log(`quitó de la compra: ${c?.nombre}`)}break;
    case "buy":buyModal(shopping()[+t.dataset.i]);break;
    case "confirmBuy":confirmBuy();break;
  }});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#modalRoot").innerHTML){closeModal();draft=null}
  if(e.key==="Enter"&&e.target.id==="tNew"){e.preventDefault();addTask()}
  if(e.key==="Enter"&&!e.shiftKey&&e.target.id==="chatIn"&&!matchMedia("(pointer:coarse)").matches){e.preventDefault();$("#fChat")?.requestSubmit()}
  if(e.key==="Enter"&&e.target.id==="qVal"){e.preventDefault();$("[data-act=qSave]")?.click()}
  if(e.key==="Enter"&&e.target.matches?.(".name[data-act]"))e.target.click()});
$("#nav").addEventListener("click",e=>{const b=e.target.closest("button[data-tab]");if(b)setTab(b.dataset.tab)});
document.addEventListener("input",e=>{if(e.target.id==="q"){S.q=e.target.value;render()}
  if(e.target.id==="tq"){S.tq=e.target.value;render()}
  if(e.target.id==="chatIn")S.chatDraft=e.target.value;
  if(e.target.matches("[data-pq]")){const [m,k]=e.target.dataset.pq.split("_").map(Number);S.chat[m].propuesta.materiales[k].cantidad=num(e.target.value);saveChat();refreshProp(m)}
  if(draft&&e.target.closest("#modalRoot")&&e.target.matches("[data-f=cantidad],[data-f=precio],#pOtros"))refreshProj()});
document.addEventListener("change",e=>{if(e.target.id==="cat"){S.cat=e.target.value;render()}
  if(e.target.matches("[data-photo]"))setPhotoFile(e.target.files[0]);
  if(e.target.matches("[data-cap]"))readCapture(e.target.files[0]);
  if(e.target.id==="pf"){S.pf=e.target.value;render()}
  if(e.target.id==="addMat"&&e.target.value){readProjForm();const mid=e.target.value;const ex=draft.p.lineas.find(l=>l.matId===mid);if(ex)ex.cantidad=num(ex.cantidad)+1;else draft.p.lineas.push({matId:mid,nombre:S.mats.get(mid)?.nombre||"",cantidad:1});drawProj()}
});

/* ---------- datos (Supabase) ---------- */
const COLS=["materiales","proyectos","compras"];
const cache={materiales:new Map(),proyectos:new Map(),compras:new Map()};
function publish(col){if(col==="materiales"){S.mats=new Map(cache.materiales);for(const id in qtyTimers){const m=S.mats.get(id);if(m)S.mats.set(id,{...m,cantidad:qtyTimers[id].to})}}
  else if(col==="proyectos")S.projs=new Map([...cache.proyectos].map(([k,v])=>[k,{...v,_id:k}]));else S.compras=new Map(cache.compras);
  saveLocal();render()}
let saveT;function saveLocal(){clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem("taller.copia",JSON.stringify({at:Date.now(),c:Object.fromEntries(COLS.map(c=>[c,[...cache[c]]])),movs:S.movs}))}catch(e){}},400)}
function loadLocal(){try{const j=JSON.parse(localStorage.getItem("taller.copia")||"null");if(!j)return false;for(const c of COLS)cache[c]=new Map(j.c[c]||[]);S.movs=j.movs||[];COLS.forEach(publish);return true}catch(e){return false}}
function applyRow(r,deleted){if(!COLS.includes(r.coleccion))return;if(deleted)cache[r.coleccion].delete(r.id);else cache[r.coleccion].set(r.id,r.data||{});publish(r.coleccion)}
async function write(col,id,data){const {error}=await sb.from("registros").upsert({id,coleccion:col,data,actualizado:new Date().toISOString(),usuario:me});if(error)throw error;applyRow({id,coleccion:col,data})}
db={
  collection:c=>({add:async d=>{const id=crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2);await write(c,id,d);return {id}}}),
  doc:p=>{const [c,id]=p.split("/");return{
    set:d=>write(c,id,d),
    update:d=>write(c,id,{...(cache[c].get(id)||{}),...d}),
    delete:async()=>{const {error}=await sb.from("registros").delete().eq("id",id);if(error)throw error;applyRow({id,coleccion:c},true)}}}
};
async function loadAll(){const rows=[];for(let from=0;;from+=1000){const {data,error}=await sb.from("registros").select("id,coleccion,data").range(from,from+999);if(error)throw error;rows.push(...data);if(data.length<1000)break}
  for(const c of COLS)cache[c]=new Map();for(const r of rows)if(cache[r.coleccion])cache[r.coleccion].set(r.id,r.data||{});
  const {data:mv}=await sb.from("movimientos").select("at,usuario,texto").order("at",{ascending:false}).limit(150);S.movs=mv||[];COLS.forEach(publish)}
let channel=null;
function subscribe(){if(channel)sb.removeChannel(channel);
  channel=sb.channel("taller").on("postgres_changes",{event:"*",schema:"public",table:"registros"},p=>{if(p.eventType==="DELETE"){const id=p.old?.id;for(const c of COLS)if(cache[c].has(id)){cache[c].delete(id);publish(c)}}else applyRow(p.new)})
  .on("postgres_changes",{event:"INSERT",schema:"public",table:"movimientos"},p=>{S.movs=[p.new,...S.movs].slice(0,150);saveLocal();if(S.tab==="historial")render()})
  .subscribe(st=>{if(st==="SUBSCRIBED")setSync("Sincronizado",true);else if(st==="CHANNEL_ERROR"||st==="TIMED_OUT")setSync("Reconectando…")})}
function setSync(t,ok){$("#sync").textContent=t;$("#sync").dataset.ok=ok?"1":""}

/* ---------- cuenta ---------- */
function showLogin(msg){$("#nav").hidden=true;$("#acct").hidden=true;$("#main").innerHTML=`<form id="fLogin" class="panel section login" autocomplete="on">
  <h2>Entrar al almacén</h2><p class="muted" style="margin:0">Usa el correo y la contraseña que te ha dado el administrador del taller.</p>
  <label class="f">Correo<input id="lEmail" type="email" autocomplete="username" required></label>
  <label class="f">Contraseña<input id="lPass" type="password" autocomplete="current-password" required></label>
  ${msg?`<p class="err">${esc(msg)}</p>`:""}<button class="btn primary" id="lBtn">Entrar</button></form>`;
  $("#fLogin").addEventListener("submit",async e=>{e.preventDefault();$("#lBtn").disabled=true;$("#lBtn").textContent="Entrando…";
    const {error}=await sb.auth.signInWithPassword({email:$("#lEmail").value.trim(),password:$("#lPass").value});
    if(error)showLogin(error.message==="Invalid login credentials"?"Correo o contraseña incorrectos.":"No se pudo entrar: "+error.message)})}
function setUser(u){myId=u.id;me=(u.user_metadata&&u.user_metadata.nombre)||(u.email||"").split("@")[0];$("#acct").textContent=me;$("#acct").hidden=false;$("#nav").hidden=false}
function accountModal(){openModal(`<h2>Tu cuenta</h2><label class="f">Nombre que se ve en el historial<input id="aNombre" value="${esc(me)}"></label>
  <div class="row"><button class="btn" data-act="csv">Exportar stock (CSV)</button><button class="btn" data-act="backup">Copia de seguridad (JSON)</button></div>
  <div class="foot"><button class="btn danger" data-act="logout">Cerrar sesión</button><span class="spacer"></span><button class="btn" data-act="close">Cerrar</button><button class="btn primary" data-act="saveName">Guardar nombre</button></div>`)}
async function saveName(){const n=$("#aNombre").value.trim();if(!n)return;const {data,error}=await sb.auth.updateUser({data:{nombre:n}});if(error){toast("No se pudo guardar el nombre");return}setUser(data.user);closeModal();toast("Nombre guardado")}
async function logout(){closeModal();await sb.auth.signOut();try{localStorage.removeItem("taller.copia")}catch(e){}location.reload()}

/* ---------- arranque ---------- */
document.querySelectorAll("nav button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===S.tab));
let started=false;
async function start(){if(started)return;started=true;$("#nav").hidden=false;
  const hadLocal=loadLocal();
  try{await loadAll();canWrite=true;setSync("Sincronizado",true);subscribe()}
  catch(e){console.warn(e);canWrite=false;setSync("Sin conexión");if(!hadLocal)$("#main").innerHTML=`<div class="panel empty"><strong>Sin conexión</strong><span>Conéctate a internet para cargar el almacén la primera vez.</span></div>`;else render()}}
window.addEventListener("online",()=>{if(started){loadAll().then(()=>{canWrite=true;setSync("Sincronizado",true);subscribe();render()}).catch(()=>{})}});
window.addEventListener("offline",()=>{canWrite=false;setSync("Sin conexión");render()});
(async()=>{
  const C=window.TALLER_CONFIG||{};
  if(!window.supabase||!C.supabaseUrl||!C.supabaseKey||C.supabaseUrl.includes("PEGA_AQUI")){
    if(!window.supabase&&loadLocal()){canWrite=false;setSync("Sin conexión");started=true;render();return}
    $("#main").innerHTML=`<div class="panel empty"><strong>Falta configurar la app</strong><span>Abre el archivo <b>config.js</b> y pega la URL y la clave pública de tu proyecto de Supabase. Los pasos están en LEEME.html.</span></div>`;return}
  sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true}});
  const {data:{session}}=await sb.auth.getSession();
  if(session){setUser(session.user);start()}else if(!navigator.onLine&&loadLocal()){canWrite=false;setSync("Sin conexión");started=true;$("#nav").hidden=false;render()}else showLogin();
  sb.auth.onAuthStateChange((ev,s)=>{if(ev==="SIGNED_IN"&&s){setUser(s.user);start()}if(ev==="SIGNED_OUT"){started=false}});
})();
if("serviceWorker" in navigator&&location.protocol.startsWith("http"))window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
