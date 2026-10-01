
const UNITS=["ud","m","cm","kg","g","L","ml","caja","rollo","bote","par","juego","m²"];
const ESTADOS={idea:"Idea",pendiente:"Pendiente",curso:"En curso",terminado:"Terminado"};
const ESTADO_PILL={idea:"steel",pendiente:"warn",curso:"ok",terminado:"steel"};
const PRIO={alta:"Alta",media:"Media",baja:"Baja"};
const S={mats:new Map(),projs:new Map(),compras:new Map(),movs:[],tab:"resumen",q:"",cat:"",pf:"activos",ready:{m:0,p:0,c:0}};
let db=null,sb=null,me="",myId=null,canWrite=true;
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const eur=n=>new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"}).format(+n||0);
const qf=n=>{n=+n||0;return Number.isInteger(n)?String(n):n.toLocaleString("es-ES",{maximumFractionDigits:3})};
const num=v=>{const n=parseFloat(String(v).replace(",","."));return isFinite(n)?n:0};
try{const t=localStorage.getItem("taller.tab");if(t)S.tab=t}catch(e){}

function toast(msg){const d=document.createElement("div");d.className="toast";d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),2600)}
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
  const v={resumen:vResumen,stock:vStock,compras:vCompras,proyectos:vProyectos,historial:vHistorial}[S.tab]||vResumen;
  const keep=document.activeElement?.id;const pos=document.activeElement?.selectionStart;
  $("#main").innerHTML=(canWrite?"":`<div class="notice">Sin conexión. Ves la última copia guardada en este dispositivo; podrás hacer cambios cuando vuelva internet.</div>`)+v(sh);
  if(keep){const el=document.getElementById(keep);if(el){el.focus();try{el.setSelectionRange(pos,pos)}catch(e){}}}}

function stockValue(){let v=0,n=0;for(const m of S.mats.values()){v+=num(m.cantidad)*num(m.precio);n++}return{v,n}}
function vResumen(sh){const sv=stockValue();const low=[...S.mats.values()].filter(m=>num(m.minimo)>0&&num(m.cantidad)<num(m.minimo)).length;
  const act=[...S.projs.values()].filter(activeProj);const pres=act.reduce((a,p)=>a+projCalc(p).total,0);const comp=sh.reduce((a,x)=>a+x.cant*x.precio,0);
  const byCat=new Map();for(const m of S.mats.values()){const c=m.categoria||"Sin categoría";byCat.set(c,(byCat.get(c)||0)+num(m.cantidad)*num(m.precio))}
  const cats=[...byCat].sort((a,b)=>b[1]-a[1]);const max=cats[0]?.[1]||1;
  return `<section class="kpis">
    <div class="panel kpi"><span class="eyebrow">Valor del stock</span><span class="v">${eur(sv.v)}</span><span class="muted">${sv.n} materiales</span></div>
    <div class="panel kpi ${low?"alert":""}"><span class="eyebrow">Bajo mínimo</span><span class="v">${low}</span><span class="muted">materiales por reponer</span></div>
    <div class="panel kpi"><span class="eyebrow">Lista de compra</span><span class="v">${eur(comp)}</span><span class="muted">${sh.length} líneas estimadas</span></div>
    <div class="panel kpi"><span class="eyebrow">Trabajos abiertos</span><span class="v">${act.length}</span><span class="muted">presupuesto ${eur(pres)}</span></div>
  </section>
  <section class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start">
    <div class="panel section"><div class="row"><h2>Valor por categoría</h2></div>
      ${cats.length?cats.map(([c,v])=>`<div><div class="money"><span>${esc(c)}</span><span class="num">${eur(v)}</span></div><div class="bar"><i style="width:${(v/max*100).toFixed(1)}%;background:var(--steel)"></i></div></div>`).join(""):`<p class="muted">Aún no hay materiales. Empieza en la pestaña Stock.</p>`}
    </div>
    <div class="panel section"><div class="row"><h2>Próximos trabajos</h2><span class="spacer"></span><button class="btn sm" data-act="newProj">+ Trabajo</button></div>
      ${act.length?act.sort(prioSort).slice(0,6).map(p=>{const c=projCalc(p);return `<div class="row" style="cursor:pointer" data-act="editProj" data-id="${p._id}"><span class="pill ${ESTADO_PILL[p.estado]}">${ESTADOS[p.estado]}</span><span style="font-weight:600;flex:1;min-width:0">${esc(p.nombre)}</span><span class="num muted">${eur(c.total)}</span></div>`}).join(""):`<p class="muted">No hay trabajos pendientes. Apunta la próxima reparación o idea.</p>`}
    </div>
  </section>`}
const prioSort=(a,b)=>({alta:0,media:1,baja:2}[a.prioridad||"media"]-{alta:0,media:1,baja:2}[b.prioridad||"media"])||String(a.fecha||"9").localeCompare(String(b.fecha||"9"));

function vStock(){const n=needs();const cats=[...new Set([...S.mats.values()].map(m=>m.categoria||"Sin categoría"))].sort();
  const q=S.q.toLowerCase();let ms=[...S.mats.entries()].map(([id,m])=>({...m,_id:id})).filter(m=>(!S.cat||(m.categoria||"Sin categoría")===S.cat)&&(!q||[m.nombre,m.categoria,m.ubicacion,m.notas].join(" ").toLowerCase().includes(q)));
  ms.sort((a,b)=>(a.categoria||"~").localeCompare(b.categoria||"~")||a.nombre.localeCompare(b.nombre));
  let html=`<div class="row"><h2>Stock</h2><span class="spacer"></span><button class="btn" data-act="csv">Exportar CSV</button><button class="btn primary" data-act="newMat">+ Material</button></div>
  <div class="toolbar"><input type="search" id="q" placeholder="Buscar por nombre, ubicación, nota…" value="${esc(S.q)}"><select id="cat"><option value="">Todas las categorías</option>${cats.map(c=>`<option ${c===S.cat?"selected":""}>${esc(c)}</option>`).join("")}</select></div>`;
  if(!S.mats.size)return html+`<div class="panel empty"><strong>El almacén está vacío</strong><span>Añade tu primer material: nombre, cantidad, precio por unidad y dónde está guardado.</span><button class="btn primary" data-act="newMat">+ Añadir material</button></div>`;
  if(!ms.length)return html+`<div class="panel empty">Nada coincide con la búsqueda.</div>`;
  let cur=null,rows="";
  for(const m of ms){const c=m.categoria||"Sin categoría";if(c!==cur){cur=c;const tv=ms.filter(x=>(x.categoria||"Sin categoría")===c).reduce((a,x)=>a+num(x.cantidad)*num(x.precio),0);rows+=`<div class="catgroup"><span>${esc(c)}</span><span class="num">${eur(tv)}</span></div>`}
    const st=num(m.cantidad),min=num(m.minimo),res=n.get(m._id)?.q||0;const low=min>0&&st<min;
    rows+=`<div class="item ${low?"low":""}"><div style="min-width:0;display:flex;flex-direction:column;gap:3px">
      <div class="row" style="gap:8px"><span class="name" data-act="editMat" data-id="${m._id}" tabindex="0">${esc(m.nombre)}</span>${low?`<span class="pill bad">bajo mínimo</span>`:""}${res?`<span class="pill warn">${qf(res)} reservado</span>`:""}</div>
      <div class="meta">${m.ubicacion?`<span class="loc">${esc(m.ubicacion)}</span>`:""}<span class="num">${eur(m.precio)}/${esc(m.unidad||"ud")}</span>${min?`<span>mín. ${qf(min)}</span>`:""}<span class="num">valor ${eur(st*num(m.precio))}</span></div></div>
      <div class="qty"><button aria-label="Quitar uno" data-act="dec" data-id="${m._id}">−</button><span class="n num"><b>${qf(st)}</b> ${esc(m.unidad||"ud")}</span><button aria-label="Añadir uno" data-act="inc" data-id="${m._id}">+</button></div></div>`}
  return html+`<div class="panel list">${rows}</div>`}

function vCompras(sh){const total=sh.reduce((a,x)=>a+x.cant*x.precio,0);
  let html=`<div class="row"><h2>Lista de compra</h2><span class="spacer"></span><span class="num" style="font-weight:600">${eur(total)}</span><button class="btn primary" data-act="newCompra">+ Añadir</button></div>
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
    <h3>${esc(p.nombre)}</h3>${p.descripcion?`<span class="muted" style="font-size:.88rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(p.descripcion)}</span>`:""}
    <div class="money"><span class="muted">Presupuesto</span><b class="num">${eur(c.total)}</b></div>
    ${c.mat?`<div class="bar" title="Material disponible"><i style="width:${(c.pct*100).toFixed(0)}%"></i></div><div class="money"><span class="muted">${(p.lineas||[]).length} materiales</span><span class="num ${c.falta>0?"":"muted"}" style="${c.falta>0?"color:var(--warn)":""}">${c.falta>0?"falta "+eur(c.falta):"todo disponible"}</span></div>`:`<span class="muted" style="font-size:.86rem">Sin materiales asignados</span>`}
    ${p.fecha?`<span class="muted num" style="font-size:.8rem">Para el ${new Date(p.fecha+"T00:00").toLocaleDateString("es-ES")}</span>`:""}</button>`}).join("")}</div>`}

function vHistorial(){
  return `<div class="row"><h2>Historial</h2><span class="muted">últimos ${S.movs.length} movimientos</span></div>
  <div class="panel section">${S.movs.length?`<ul class="log">${S.movs.map(m=>{const d=new Date(m.at);return `<li><time>${d.toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit"})} ${d.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}</time><span><b>${esc(m.usuario||"Alguien")}</b> ${esc(m.texto)}</span></li>`}).join("")}</ul>`:`<p class="muted">Aquí aparecerá quién añade, gasta o compra cada cosa.</p>`}</div>`}

/* ---------- modales ---------- */
function openModal(html,onMount){$("#modalRoot").innerHTML=`<div class="ov" data-act="ovClose"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;onMount&&onMount($("#modalRoot .modal"));const f=$("#modalRoot input, #modalRoot select");f&&f.focus()}
function closeModal(){$("#modalRoot").innerHTML=""}
function datalist(id,vals){return `<datalist id="${id}">${[...new Set(vals.filter(Boolean))].sort().map(v=>`<option value="${esc(v)}">`).join("")}</datalist>`}

function matModal(id){const m=id?S.mats.get(id):{nombre:"",categoria:"",unidad:"ud",cantidad:0,minimo:0,precio:0,ubicacion:"",notas:""};const all=[...S.mats.values()];
  openModal(`<div class="row"><h2>${id?"Editar material":"Nuevo material"}</h2></div>
  <form id="fMat" class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
    <label class="f" style="grid-column:1/-1">Nombre<input id="mNombre" required value="${esc(m.nombre)}" placeholder="Tornillo rosca chapa 4,2×19"></label>
    <label class="f">Categoría<input id="mCat" list="dlCat" value="${esc(m.categoria)}" placeholder="Tornillería"></label>
    <label class="f">Ubicación<input id="mUbic" list="dlUbic" value="${esc(m.ubicacion)}" placeholder="Estante A · caja 3"></label>
    <label class="f">Cantidad<input id="mCant" inputmode="decimal" value="${qf(m.cantidad)}"></label>
    <label class="f">Unidad<select id="mUnid">${UNITS.map(u=>`<option ${u===(m.unidad||"ud")?"selected":""}>${u}</option>`).join("")}</select></label>
    <label class="f">Stock mínimo<input id="mMin" inputmode="decimal" value="${qf(m.minimo)}"></label>
    <label class="f">Precio por unidad (€)<input id="mPrecio" inputmode="decimal" value="${m.precio?String(m.precio).replace(".",","):""}" placeholder="0,00"></label>
    <label class="f" style="grid-column:1/-1">Notas<textarea id="mNotas" placeholder="Proveedor, referencia, medidas…">${esc(m.notas)}</textarea></label>
  </form>${datalist("dlCat",all.map(x=>x.categoria))}${datalist("dlUbic",all.map(x=>x.ubicacion))}
  <div class="foot">${id?`<button class="btn danger" data-act="delMat" data-id="${id}">Borrar</button><span class="spacer"></span>`:""}<button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="saveMat" data-id="${id||""}">Guardar</button></div>`)}

async function saveMat(id){const nombre=$("#mNombre").value.trim();if(!nombre){toast("Ponle un nombre al material");return}
  const d={nombre,categoria:$("#mCat").value.trim(),ubicacion:$("#mUbic").value.trim(),cantidad:num($("#mCant").value),unidad:$("#mUnid").value,minimo:num($("#mMin").value),precio:num($("#mPrecio").value),notas:$("#mNotas").value.trim(),updatedAt:Date.now()};
  const prev=id?S.mats.get(id):null;
  const ok=await guard(async()=>{if(id)await db.doc("materiales/"+id).set(d);else await db.collection("materiales").add(d)},id?"Material guardado":"Material añadido");
  if(ok){closeModal();log(id?(prev&&num(prev.cantidad)!==d.cantidad?`ajustó ${d.nombre}: ${qf(prev.cantidad)} → ${qf(d.cantidad)} ${d.unidad}`:`editó ${d.nombre}`):`añadió ${qf(d.cantidad)} ${d.unidad} de ${d.nombre}`)}}

const qtyTimers={};
function bump(id,delta){const m=S.mats.get(id);if(!m)return;let t=qtyTimers[id];if(!t)t=qtyTimers[id]={from:num(m.cantidad),to:num(m.cantidad)};
  t.to=Math.max(0,t.to+delta);m.cantidad=t.to;render();clearTimeout(t.h);
  t.h=setTimeout(async()=>{delete qtyTimers[id];const {from,to}=t;if(from===to)return;
    const ok=await guard(()=>db.doc("materiales/"+id).update({cantidad:to,updatedAt:Date.now()}));if(ok)log(`${to<from?"gastó":"añadió"} ${qf(Math.abs(to-from))} ${m.unidad||"ud"} de ${m.nombre} (quedan ${qf(to)})`)},800)}

let draft=null;
function projModal(id){const p=id?JSON.parse(JSON.stringify(S.projs.get(id))):{nombre:"",tipo:"reparacion",estado:"pendiente",prioridad:"media",fecha:"",descripcion:"",otros:0,lineas:[]};draft={id,p};drawProj()}
function lineState(p,l,i){const m=l.matId&&S.mats.get(l.matId);const st=m?num(m.cantidad):0;return p.consumido?`<span class="pill steel">usado</span>`:l.matId?(st>=num(l.cantidad)?`<span class="pill ok">en stock</span>`:`<span class="pill warn">faltan ${qf(num(l.cantidad)-st)}</span>`):`<label class="row" style="gap:4px;font-size:.82rem;white-space:nowrap"><input type="checkbox" style="width:auto;min-height:0" data-act="lineOk" data-i="${i}" ${l.ok?"checked":""}>lo tengo</label>`}
function sumHTML(c){return `<div class="money"><span>Materiales</span><span class="num">${eur(c.mat)}</span></div><div class="money"><span>Otros</span><span class="num">${eur(c.otros)}</span></div><div class="money"><span class="muted">Falta por comprar</span><span class="num" style="color:var(--warn)">${eur(c.falta)}</span></div><div class="money" style="font-weight:600;border-top:1px solid var(--line);padding-top:4px"><span>Presupuesto total</span><span class="num">${eur(c.total)}</span></div>`}
function refreshProj(){readProjForm();const p=draft.p;(p.lineas||[]).forEach((l,i)=>{const a=document.getElementById("lc"+i),b=document.getElementById("ls"+i);if(a)a.textContent=eur(num(l.cantidad)*linePrice(l));if(b&&l.matId)b.innerHTML=lineState(p,l,i)});const ps=document.getElementById("pSum");if(ps)ps.innerHTML=sumHTML(projCalc(p))}
function drawProj(){const {id,p}=draft;const c=projCalc(p);const mats=[...S.mats.entries()].sort((a,b)=>a[1].nombre.localeCompare(b[1].nombre));
  const lines=(p.lineas||[]).map((l,i)=>{const state=lineState(p,l,i);
    return `<tr><td>${l.matId?`<b>${esc(lineName(l))}</b>`:`<input id="ln${i}" data-f="nombre" data-i="${i}" value="${esc(l.nombre)}" placeholder="Material">`}</td>
      <td class="r" style="width:90px"><input id="lq${i}" data-f="cantidad" data-i="${i}" inputmode="decimal" value="${qf(l.cantidad)}" style="text-align:right"></td>
      <td class="r" style="width:100px">${l.matId?`<span class="num">${eur(linePrice(l))}</span>`:`<input id="lp${i}" data-f="precio" data-i="${i}" inputmode="decimal" value="${l.precio?String(l.precio).replace(".",","):""}" placeholder="€/ud" style="text-align:right">`}</td>
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
  <div class="row"><h3>Materiales</h3><span class="spacer"></span></div>
  <div class="tblwrap"><table class="lines"><thead><tr><th>Material</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Coste</th><th></th><th></th></tr></thead><tbody>${lines||`<tr><td colspan="6" class="muted">Añade materiales del almacén o cosas que tengas que comprar.</td></tr>`}</tbody></table></div>
  <div class="row"><select id="addMat" style="flex:1 1 220px;width:auto"><option value="">+ Añadir del almacén…</option>${mats.map(([mid,m])=>`<option value="${mid}">${esc(m.nombre)} (${qf(m.cantidad)} ${esc(m.unidad||"ud")})</option>`).join("")}</select><button class="btn" data-act="lineFree">+ Algo que no está en stock</button></div>
  <div class="grid2"><label class="f">Otros gastos (€): mano de obra, envíos, herramientas<input id="pOtros" inputmode="decimal" value="${p.otros?String(p.otros).replace(".",","):""}" placeholder="0,00"></label>
    <div class="panel section" id="pSum" style="gap:4px;background:var(--bg)">${sumHTML(c)}</div></div>
  ${id&&!p.consumido&&(p.lineas||[]).some(l=>l.matId)?`<div class="panel section" style="background:var(--bg)"><span>Cuando termines, descuenta del stock el material usado.</span><div class="row"><button class="btn" data-act="consume">Descontar material y marcar terminado</button></div></div>`:""}
  ${p.consumido?`<p class="muted" style="margin:0">El material de este trabajo ya se descontó del stock.</p>`:""}
  <div class="foot">${id?`<button class="btn danger" data-act="delProj">Borrar</button><span class="spacer"></span>`:""}<button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="saveProj">Guardar</button></div>`)}
function readProjForm(){const p=draft.p;if(!$("#pNombre"))return;p.nombre=$("#pNombre").value;p.tipo=$("#pTipo").value;p.estado=$("#pEstado").value;p.prioridad=$("#pPrio").value;p.fecha=$("#pFecha").value;p.descripcion=$("#pDesc").value;p.otros=num($("#pOtros").value);
  document.querySelectorAll("#modalRoot [data-f]").forEach(el=>{const l=p.lineas[+el.dataset.i];const f=el.dataset.f;l[f]=f==="nombre"?el.value:num(el.value)})}
async function saveProj(){readProjForm();const {id,p}=draft;p.nombre=p.nombre.trim();if(!p.nombre){toast("Ponle un nombre al trabajo");return}
  p.lineas=(p.lineas||[]).filter(l=>l.matId||String(l.nombre).trim());p.lineas.forEach(l=>{if(l.matId){const m=S.mats.get(l.matId);if(m)l.nombre=m.nombre}});p.updatedAt=Date.now();delete p._id;
  const prevEstado=id?S.projs.get(id)?.estado:null;
  const ok=await guard(async()=>{if(id)await db.doc("proyectos/"+id).set(p);else await db.collection("proyectos").add(p)},"Trabajo guardado");
  if(ok){closeModal();log(!id?`creó el trabajo «${p.nombre}»`:prevEstado!==p.estado?`pasó «${p.nombre}» a ${ESTADOS[p.estado]}`:`editó el trabajo «${p.nombre}»`)}}
async function consume(){readProjForm();const {id,p}=draft;const short=[];
  for(const l of p.lineas){if(!l.matId)continue;const m=S.mats.get(l.matId);if(!m)continue;if(num(m.cantidad)<num(l.cantidad))short.push(m.nombre)}
  const ok=await guard(async()=>{for(const l of p.lineas){if(!l.matId)continue;const m=S.mats.get(l.matId);if(!m)continue;await db.doc("materiales/"+l.matId).update({cantidad:Math.max(0,num(m.cantidad)-num(l.cantidad)),updatedAt:Date.now()})}
    p.consumido=true;p.estado="terminado";delete p._id;p.updatedAt=Date.now();await db.doc("proyectos/"+id).set(p)},short.length?"Descontado (algunos quedaron a 0: "+short.join(", ")+")":"Material descontado del stock");
  if(ok){closeModal();log(`terminó «${p.nombre}» y descontó su material del stock`)}}

function compraModal(){openModal(`<h2>Añadir a la compra</h2><div class="grid2">
  <label class="f" style="grid-column:1/-1">Qué hay que comprar<input id="cNombre" placeholder="Disco de corte 125 mm"></label>
  <label class="f">Cantidad<input id="cCant" inputmode="decimal" value="1"></label><label class="f">Unidad<select id="cUnid">${UNITS.map(u=>`<option>${u}</option>`).join("")}</select></label>
  <label class="f">Precio aprox. por unidad (€)<input id="cPrecio" inputmode="decimal" placeholder="0,00"></label><label class="f">Nota<input id="cNota" placeholder="Ferretería, Amazon…"></label></div>
  <div class="foot"><button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="saveCompra">Añadir</button></div>`)}
function buyModal(x){openModal(`<h2>Comprado: ${esc(x.nombre)}</h2>
  <p class="muted" style="margin:0">${x.kind==="proj"?"Se marcará como conseguido en el trabajo.":x.kind==="mat"?"Se sumará al stock y se actualizará el precio.":"Puedes guardarlo también en el stock."}</p>
  <div class="grid2"><label class="f">Cantidad comprada<input id="bCant" inputmode="decimal" value="${qf(x.cant)}"></label><label class="f">Precio por unidad pagado (€)<input id="bPrecio" inputmode="decimal" value="${x.precio?String(x.precio).replace(".",","):""}"></label>
  ${x.kind==="man"?`<label class="f" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="bStock" style="width:auto;min-height:0" checked>Añadir al stock como material nuevo</label>`:""}</div>
  <div class="foot"><button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="confirmBuy">Confirmar</button></div>`);buyX=x}
let buyX=null;
async function confirmBuy(){const x=buyX;const cant=num($("#bCant").value),precio=num($("#bPrecio").value);let ok;
  if(x.kind==="mat"){const m=S.mats.get(x.id);const d={cantidad:num(m.cantidad)+cant,updatedAt:Date.now()};if(precio)d.precio=precio;ok=await guard(()=>db.doc("materiales/"+x.id).update(d),"Añadido al stock")}
  else if(x.kind==="proj"){const p=JSON.parse(JSON.stringify(S.projs.get(x.pid)));delete p._id;p.lineas[x.i].ok=true;if(precio)p.lineas[x.i].precio=precio;ok=await guard(()=>db.doc("proyectos/"+x.pid).set(p),"Marcado como conseguido")}
  else{const toStock=$("#bStock")?.checked;ok=await guard(async()=>{if(toStock)await db.collection("materiales").add({nombre:x.nombre,categoria:"",ubicacion:"",cantidad:cant,unidad:x.unidad,minimo:0,precio,notas:"",updatedAt:Date.now()});await db.doc("compras/"+x.id).delete()},toStock?"Añadido al stock":"Quitado de la lista")}
  if(ok){closeModal();log(`compró ${qf(cant)} ${x.unidad} de ${x.nombre}${precio?` a ${eur(precio)}/${x.unidad}`:""}`)}}

async function exportCsv(){const rows=[["Nombre","Categoría","Ubicación","Cantidad","Unidad","Mínimo","Precio unidad","Valor","Notas"]];
  for(const m of [...S.mats.values()].sort((a,b)=>a.nombre.localeCompare(b.nombre)))rows.push([m.nombre,m.categoria,m.ubicacion,qf(m.cantidad),m.unidad,qf(m.minimo),num(m.precio).toFixed(2).replace(".",","),(num(m.cantidad)*num(m.precio)).toFixed(2).replace(".",","),m.notas]);
  const csv="﻿"+rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(";")).join("\r\n");
  saveFile(`stock-taller-${new Date().toISOString().slice(0,10)}.csv`,new Blob([csv],{type:"text/csv;charset=utf-8"}))}
function saveFile(name,blob){const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);toast("Descargado: "+name)}
function exportBackup(){const out={exportado:new Date().toISOString(),materiales:Object.fromEntries(S.mats),proyectos:Object.fromEntries([...S.projs].map(([k,v])=>{const c={...v};delete c._id;return [k,c]})),compras:Object.fromEntries(S.compras)};
  saveFile(`copia-taller-${new Date().toISOString().slice(0,10)}.json`,new Blob([JSON.stringify(out,null,1)],{type:"application/json"}))}

/* ---------- eventos ---------- */
const pendingDel={};
document.addEventListener("click",async e=>{const t=e.target.closest("[data-act]");if(!t)return;const a=t.dataset.act,id=t.dataset.id;
  if(a==="ovClose"&&e.target!==t)return;
  if(t.closest("nav"))return;
  switch(a){
    case "ovClose":case "close":closeModal();draft=null;break;
    case "newMat":matModal();break; case "editMat":matModal(id);break; case "saveMat":saveMat(id);break;
    case "delMat":if(!pendingDel[id]){pendingDel[id]=1;t.textContent="¿Seguro? Pulsa otra vez";setTimeout(()=>delete pendingDel[id],4000);break}
      {const m=S.mats.get(id);if(await guard(()=>db.doc("materiales/"+id).delete(),"Material borrado")){closeModal();log(`borró ${m?.nombre}`)}}break;
    case "inc":if(canWrite)bump(id,1);else toast("Tu acceso es de solo lectura");break; case "dec":if(canWrite)bump(id,-1);else toast("Tu acceso es de solo lectura");break;
    case "csv":exportCsv();break; case "backup":exportBackup();break; case "account":accountModal();break; case "saveName":saveName();break; case "logout":logout();break;
    case "newProj":projModal();break; case "editProj":projModal(id);break; case "saveProj":saveProj();break; case "consume":consume();break;
    case "delProj":if(!pendingDel.p){pendingDel.p=1;t.textContent="¿Seguro? Pulsa otra vez";setTimeout(()=>delete pendingDel.p,4000);break}
      {const n=draft.p.nombre;if(await guard(()=>db.doc("proyectos/"+draft.id).delete(),"Trabajo borrado")){closeModal();log(`borró el trabajo «${n}»`)}}break;
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
  if(e.key==="Enter"&&e.target.matches?.(".name[data-act]"))e.target.click()});
$("#nav").addEventListener("click",e=>{const b=e.target.closest("button[data-tab]");if(b)setTab(b.dataset.tab)});
document.addEventListener("input",e=>{if(e.target.id==="q"){S.q=e.target.value;render()}
  if(draft&&e.target.closest("#modalRoot")&&e.target.matches("[data-f=cantidad],[data-f=precio],#pOtros"))refreshProj()});
document.addEventListener("change",e=>{if(e.target.id==="cat"){S.cat=e.target.value;render()}
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
