(()=>{
'use strict';
const MODULES={dashboard:['Dashboard','Visão geral'],entrada:['Entrada','Recebimentos'],triagem:['Triagem','Conferência e classificação'],estoque:['Estoque','Materiais e saldos'],patrimonio:['Patrimônio','Bens patrimoniais'],expedicao:['Expedição','Solicitações, separação e retirada'],movimentacoes:['Movimentações','Histórico de movimentações'],relatorios:['Relatórios','Consultas e relatórios'],empresa:['Empresas','Empresas e obras'],usuarios:['Usuários','Acessos e permissões']};
const content=document.getElementById('atlasContent');
const loadedScripts=new Set();
const loadedStyles=new Set([...document.querySelectorAll('link[rel="stylesheet"]')].map(x=>new URL(x.href,location.href).href));
let current='';
function moduleFromHref(href){try{const u=new URL(href,location.href);if(u.origin!==location.origin)return null;const m=u.pathname.match(/\/([^/]+)\.html$/i);if(!m)return null;const name=m[1].toLowerCase();return MODULES[name]?name:null}catch{return null}}
async function addStyle(href){const abs=new URL(href,location.href).href;if(loadedStyles.has(abs))return;loadedStyles.add(abs);const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l)}
async function runScript(s){if(s.src){const abs=new URL(s.getAttribute('src'),location.href).href;if(loadedScripts.has(abs))return;loadedScripts.add(abs);await new Promise((ok,fail)=>{const n=document.createElement('script');for(const a of s.attributes)if(a.name!=='src'&&a.name!=='defer')n.setAttribute(a.name,a.value);n.src=s.getAttribute('src');n.onload=ok;n.onerror=fail;document.body.appendChild(n)})}else if(s.textContent.trim()){const n=document.createElement('script');n.textContent=s.textContent;document.body.appendChild(n)}}
async function navigate(name,push=true){if(!MODULES[name])name='dashboard';if(current===name)return;current=name;content.innerHTML='<div class="atlas-loading">Abrindo módulo...</div>';document.querySelectorAll('.atlas-nav button').forEach(b=>b.classList.toggle('active',b.dataset.module===name));document.getElementById('atlasPageTitle').textContent=MODULES[name][0];document.getElementById('atlasPageSub').textContent=MODULES[name][1];if(push)history.pushState({module:name},'',`atlas.html#m=${name}`);
try{const r=await fetch(`./${name}.html`,{cache:'no-store'});if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);const html=await r.text();const doc=new DOMParser().parseFromString(html,'text/html');for(const l of doc.querySelectorAll('link[rel="stylesheet"][href]'))await addStyle(l.getAttribute('href'));
const main=doc.querySelector('.bdr-main')||doc.querySelector('main')||doc.body;const clone=main.cloneNode(true);clone.querySelectorAll('.bdr-topbar,.bdr-sidebar,script').forEach(x=>x.remove());const host=document.createElement('div');host.className='atlas-module-host';host.dataset.module=name;host.append(...clone.childNodes);content.replaceChildren(host);
for(const s of doc.querySelectorAll('script'))await runScript(s);
window.dispatchEvent(new CustomEvent('atlas:module-loaded',{detail:{module:name}}));
}catch(e){console.error('[Atlas Shell]',e);content.innerHTML=`<div class="atlas-error"><b>Não foi possível abrir ${MODULES[name][0]}.</b><br>${String(e.message||e)}</div>`}}
window.Atlas={navigate};window.ir=(p)=>{const m=moduleFromHref(p);if(m){navigate(m);return}location.href=p};
document.addEventListener('click',e=>{const b=e.target.closest('[data-module]');if(b&&b.closest('.atlas-nav')){e.preventDefault();navigate(b.dataset.module);return}const a=e.target.closest('a[href]');if(!a)return;const m=moduleFromHref(a.getAttribute('href'));if(m){e.preventDefault();navigate(m)}} ,true);
const nativeAssign=location.assign.bind(location); // referência apenas; location.href não é sobrescrevível
window.addEventListener('popstate',()=>navigate((location.hash.match(/m=([\w-]+)/)||[])[1]||'dashboard',false));
const first=(location.hash.match(/m=([\w-]+)/)||[])[1]||'expedicao';navigate(first,false);
})();
