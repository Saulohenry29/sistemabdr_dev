/* =========================================================
   ATLAS USUÁRIOS ADMIN V1.0
   - OWNER oficial: somente usuário ID 1.
   - Mantém menu e topbar atuais.
   - Organiza a tela por abas.
   - Usuário só vê/concede permissões que ele próprio possui.
   - Perfis rápidos respeitam o alcance do editor.
========================================================= */
(function(global){
  'use strict';
  if(global.AtlasUsuariosAdmin?.__loaded) return;

  const OWNER_ID = 1;
  let abaAtual = 'usuarios';

  function usuarioAtualSeguro(){
    try{
      if(typeof global.usuarioAtual === 'function') return global.usuarioAtual();
      return JSON.parse(localStorage.getItem('usuario_logado') || localStorage.getItem('usuarioLogado') || 'null');
    }catch(e){ return null; }
  }

  function normalizar(v){ return String(v || '').trim().toUpperCase(); }
  function ehOwner(u=usuarioAtualSeguro()){ return Number(u?.id) === OWNER_ID; }
  function permissoesDo(u=usuarioAtualSeguro()){
    if(!u) return [];
    if(Array.isArray(u.permissoes)) return u.permissoes.map(normalizar).filter(Boolean);
    return String(u.permissoes || '').split(',').map(normalizar).filter(Boolean);
  }
  function podeConceder(permissao){
    if(ehOwner()) return true;
    return new Set(permissoesDo()).has(normalizar(permissao));
  }

  function criarNavegacao(){
    if(document.getElementById('atlasUsersNav')) return;
    const anchor = document.querySelector('.usuario-selecionado-card');
    if(!anchor) return;
    const nav = document.createElement('nav');
    nav.id = 'atlasUsersNav';
    nav.className = 'atlas-users-nav';
    nav.innerHTML = `
      <button class="atlas-users-tab ativo" data-aba="usuarios"><i class="fa-solid fa-users"></i> Usuários</button>
      <button class="atlas-users-tab" data-aba="acessos"><i class="fa-solid fa-user-shield"></i> Perfil e acessos</button>
      <button class="atlas-users-tab" data-aba="obras"><i class="fa-solid fa-building"></i> Obras liberadas</button>
      <button class="atlas-users-tab" data-aba="resumo"><i class="fa-solid fa-chart-simple"></i> Resumo</button>`;
    anchor.parentNode.insertBefore(nav, anchor);
    nav.addEventListener('click', e=>{
      const btn=e.target.closest('[data-aba]');
      if(btn) abrirAba(btn.dataset.aba);
    });

    const users = document.querySelector('.users-panel');
    const selected = document.querySelector('.usuario-selecionado-card');
    const board = document.querySelector('.board');
    const lowerPanels = Array.from(document.querySelectorAll('.lower > .panel'));
    if(users) users.dataset.atlasAba='usuarios';
    if(selected) selected.dataset.atlasAba='acessos';
    if(board) board.dataset.atlasAba='acessos';
    if(lowerPanels[0]) lowerPanels[0].dataset.atlasAba='obras';
    if(lowerPanels[1]) lowerPanels[1].dataset.atlasAba='resumo';
    if(lowerPanels[2]) lowerPanels[2].dataset.atlasAba='acessos';
    document.querySelectorAll('[data-atlas-aba]').forEach(el=>el.classList.add('atlas-users-section'));
    if(users && nav.nextElementSibling !== users) nav.after(users);
    abrirAba('usuarios');
  }

  function abrirAba(nome){
    abaAtual = nome || 'usuarios';
    document.querySelectorAll('.atlas-users-tab').forEach(b=>b.classList.toggle('ativo',b.dataset.aba===abaAtual));
    document.querySelectorAll('[data-atlas-aba]').forEach(el=>el.classList.toggle('ativo',el.dataset.atlasAba===abaAtual));
  }

  function prepararOwner(){
    document.body.classList.toggle('atlas-owner',ehOwner());
    const strip=document.querySelector('.master-strip');
    if(strip && !document.getElementById('atlasOwnerBadge')){
      const badge=document.createElement('div');
      badge.id='atlasOwnerBadge';
      badge.className='atlas-owner-badge';
      badge.innerHTML=`<i class="fa-solid fa-crown"></i> OWNER ID 1 <button type="button" class="atlas-owner-open">Painel Owner</button>`;
      badge.querySelector('button').addEventListener('click',()=>global.bdrOwnerAbrir?.());
      strip.appendChild(badge);
    }
    document.querySelectorAll('[onclick*="bdrCliqueSecretoOwner"]').forEach(el=>{
      el.onclick = function(e){
        e?.stopPropagation();
        if(ehOwner()) global.bdrOwnerAbrir?.();
      };
      if(!ehOwner()) el.style.cursor='default';
    });
  }

  function adicionarNotaEscopo(){
    const card=document.getElementById('usuarioSelecionadoCard');
    if(!card || document.getElementById('atlasScopeNote')) return;
    const note=document.createElement('div');
    note.id='atlasScopeNote';
    note.className='atlas-scope-note'+(ehOwner()?' owner':'');
    note.textContent=ehOwner()
      ? 'OWNER ID 1: acesso completo. Você pode visualizar e conceder todas as permissões.'
      : 'Segurança ativa: você só visualiza e concede permissões que já possui.';
    card.after(note);
  }

  function aplicarEscopoPermissoes(){
    document.querySelectorAll('input.perm').forEach(chk=>{
      const linha=chk.closest('.perm-row');
      const liberada=podeConceder(chk.value);
      chk.disabled=!liberada;
      if(linha) linha.classList.toggle('atlas-permissao-bloqueada',!liberada);
      if(!liberada) chk.checked=false;
    });

    const acoesCriticas=['liberarTudo','abrirModalPerfilRapido','abrirModalPerfilComMarcadas'];
    document.querySelectorAll('button').forEach(btn=>{
      const click=String(btn.getAttribute('onclick')||'');
      if(acoesCriticas.some(fn=>click.includes(fn))){
        btn.classList.add('atlas-acao-owner-only');
      }
    });
  }

  function filtrarMarcadas(){
    document.querySelectorAll('input.perm:checked').forEach(chk=>{
      if(!podeConceder(chk.value)) chk.checked=false;
    });
  }

  function protegerFuncoes(){
    const originalSelecionar=global.selecionarUsuario;
    if(typeof originalSelecionar==='function' && !originalSelecionar.__atlasAdmin){
      const fn=function(id){
        const r=originalSelecionar.apply(this,arguments);
        setTimeout(()=>{ aplicarEscopoPermissoes(); abrirAba('acessos'); },0);
        return r;
      };
      fn.__atlasAdmin=true; global.selecionarUsuario=fn;
    }

    const originalPerfil=global.aplicarPerfilRapido;
    if(typeof originalPerfil==='function' && !originalPerfil.__atlasAdmin){
      const fn=function(){
        const r=originalPerfil.apply(this,arguments);
        setTimeout(()=>{ filtrarMarcadas(); aplicarEscopoPermissoes(); },0);
        return r;
      };
      fn.__atlasAdmin=true; global.aplicarPerfilRapido=fn;
    }

    const originalSalvar=global.salvarPermissoesUsuarioSelecionado;
    if(typeof originalSalvar==='function' && !originalSalvar.__atlasAdmin){
      const fn=async function(){
        const alvo=global.usuarioSelecionado;
        if(Number(alvo?.id)===OWNER_ID && !ehOwner()){
          alert('Somente o OWNER ID 1 pode alterar o próprio usuário OWNER.'); return;
        }
        filtrarMarcadas();
        return await originalSalvar.apply(this,arguments);
      };
      fn.__atlasAdmin=true; global.salvarPermissoesUsuarioSelecionado=fn;
    }

    const originalAbrir=global.abrirModalUsuario;
    if(typeof originalAbrir==='function' && !originalAbrir.__atlasAdmin){
      const fn=function(id){
        if(Number(id)===OWNER_ID && !ehOwner()){
          alert('O usuário OWNER ID 1 é protegido.'); return;
        }
        const r=originalAbrir.apply(this,arguments);
        setTimeout(()=>{
          const select=document.getElementById('formPerfil');
          if(select && !ehOwner()){
            Array.from(select.options).forEach(op=>{ if(normalizar(op.value||op.text)==='MASTER') op.remove(); });
          }
        },0);
        return r;
      };
      fn.__atlasAdmin=true; global.abrirModalUsuario=fn;
    }

    const originalSalvarUsuario=global.salvarUsuario;
    if(typeof originalSalvarUsuario==='function' && !originalSalvarUsuario.__atlasAdmin){
      const fn=async function(){
        const id=Number(document.getElementById('usuarioId')?.value||0);
        const perfil=normalizar(document.getElementById('formPerfil')?.value);
        if(id===OWNER_ID && !ehOwner()){ alert('O usuário OWNER ID 1 é protegido.'); return; }
        if(perfil==='MASTER' && !ehOwner()){ alert('Somente o OWNER ID 1 pode criar ou promover um MASTER.'); return; }
        return await originalSalvarUsuario.apply(this,arguments);
      };
      fn.__atlasAdmin=true; global.salvarUsuario=fn;
    }
  }

  function iniciar(){
    criarNavegacao(); prepararOwner(); adicionarNotaEscopo(); aplicarEscopoPermissoes(); protegerFuncoes();
    setTimeout(()=>{ aplicarEscopoPermissoes(); protegerFuncoes(); },700);
    setTimeout(()=>{ aplicarEscopoPermissoes(); protegerFuncoes(); },1800);
    void 0;
  }

  global.AtlasUsuariosAdmin={__loaded:true,OWNER_ID,ehOwner,podeConceder,abrirAba,aplicarEscopoPermissoes};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',iniciar,{once:true}); else iniciar();
})(window);
