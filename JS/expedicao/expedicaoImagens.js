/* =========================================================
   ATLAS EXPEDIÇÃO — IMAGENS DE REFERÊNCIA
   Referência visual compartilhada por MARCA + MODELO.
   Arquivo físico: Atlas Files API.
   Metadados: public.atlas_imagens_referencia.
========================================================= */
(function(global){
  'use strict';

  if(global.AtlasExpedicaoImagens?.__loaded) return;

  const ARQUIVOS_BASE_URL='https://arquivos.sathtech.com.br/files/';
  const API_REFERENCIAS='https://arquivos.sathtech.com.br/api/referencias';
  const referencias=new Map();

  function hostWindow(){
    try{
      if(global.parent && global.parent!==global && global.parent.document) return global.parent;
    }catch(_){ }
    return global;
  }

  function db(){
    const h=hostWindow();
    return global.client||global.supabaseClient||h.client||h.supabaseClient||null;
  }

  function usuarioAtual(){
    try{
      return JSON.parse(
        localStorage.getItem('usuario_logado')||
        localStorage.getItem('usuarioLogado')||
        'null'
      );
    }catch(_){ return null; }
  }

  function normalizar(v){
    return String(v??'')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g,'');
  }

  function chave(marca,modelo){
    const m=normalizar(marca);
    const md=normalizar(modelo);
    return m&&md ? `${m}|||${md}` : '';
  }

  function urlArquivo(v){
    const x=String(v||'').trim();
    if(!x) return '';
    if(/^https?:\/\//i.test(x)) return x;
    return ARQUIVOS_BASE_URL+x.replace(/^\/+/, '');
  }

  function referenciaDoItem(item){
    const k=chave(item?.marca,item?.modelo);
    return k ? referencias.get(k)||null : null;
  }

  function url(item){
    const ref=referenciaDoItem(item);
    return urlArquivo(ref?.foto_url||item?.foto_url||item?.imagem_url||'');
  }

  function possui(item){
    return Boolean(url(item));
  }

  function podeGerenciar(){
    const u=usuarioAtual();
    return Boolean(u?.owner_sistema===true || Number(u?.id)===1);
  }

  async function carregar(){
    const banco=db();
    referencias.clear();
    if(!banco) return false;

    const {data,error}=await banco
      .from('atlas_imagens_referencia')
      .select('id,nome_referencia,marca,modelo,foto_url,ativo,usuario_cadastro,created_at,updated_at')
      .eq('ativo',true)
      .order('id',{ascending:true});

    if(error){
      console.warn('Atlas Expedição: não foi possível carregar imagens de referência:',error.message);
      return false;
    }

    (data||[]).forEach(ref=>{
      const k=chave(ref.marca,ref.modelo);
      if(k) referencias.set(k,ref);
    });
    return true;
  }

  function aplicar(lista){
    if(!Array.isArray(lista)) return lista;
    return lista.map(item=>{
      const ref=referenciaDoItem(item);
      return ref ? {...item,imagem_referencia:ref,foto_referencia_url:ref.foto_url} : item;
    });
  }

  function css(){
    if(document.getElementById('atlasExpedicaoImagensCss')) return;
    const s=document.createElement('style');
    s.id='atlasExpedicaoImagensCss';
    s.textContent=`
      .atlas-ref-box{margin-top:14px;padding:13px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc}
      .atlas-ref-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
      .atlas-ref-title{font-size:12px;font-weight:950;color:#0f172a}
      .atlas-ref-badge{font-size:10px;font-weight:900;color:#166534;background:#dcfce7;border:1px solid #bbf7d0;border-radius:999px;padding:4px 8px}
      .atlas-ref-help{font-size:11px;font-weight:700;line-height:1.35;color:#64748b;margin-bottom:9px}
      .atlas-ref-form{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}
      .atlas-ref-file{min-width:0;width:100%;font-size:11px;font-weight:800;color:#334155;background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:8px}
      .atlas-ref-save{height:38px;border:0;border-radius:10px;background:#111827;color:#fff;padding:0 13px;font-size:11px;font-weight:950;cursor:pointer}
      .atlas-ref-save:disabled{opacity:.55;cursor:wait}
      .atlas-ref-msg{grid-column:1/-1;font-size:11px;font-weight:850;min-height:14px;color:#475569}
      @media(max-width:620px){.atlas-ref-form{grid-template-columns:1fr}.atlas-ref-save{width:100%}}
    `;
    document.head.appendChild(s);
  }

  function gerenciadorHtml(item){
    if(!podeGerenciar()) return '';
    css();

    const marca=String(item?.marca||'').trim();
    const modelo=String(item?.modelo||'').trim();
    const ref=referenciaDoItem(item);

    if(!marca||!modelo){
      return `<div class="atlas-ref-box"><div class="atlas-ref-title">Imagem de referência</div><div class="atlas-ref-help">Este item precisa ter marca e modelo para compartilhar uma imagem de referência.</div></div>`;
    }

    return `<div class="atlas-ref-box">
      <div class="atlas-ref-head">
        <div class="atlas-ref-title">Imagem de referência</div>
        ${ref?'<span class="atlas-ref-badge">Referência vinculada</span>':''}
      </div>
      <div class="atlas-ref-help">Uma única foto será usada como referência visual para todos os itens <b>${escapeHtml(marca)} / ${escapeHtml(modelo)}</b>.</div>
      <div class="atlas-ref-form">
        <input class="atlas-ref-file" id="atlasRefArquivo" type="file" accept="image/jpeg,image/png,image/webp">
        <button class="atlas-ref-save" id="atlasRefSalvar" type="button" onclick="AtlasExpedicaoImagens.enviarAtual('${escapeAttr(item.origem_tabela)}',${Number(item.id)})">${ref?'Substituir imagem':'Adicionar imagem'}</button>
        <div class="atlas-ref-msg" id="atlasRefMensagem"></div>
      </div>
    </div>`;
  }

  function escapeHtml(v){
    return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  function escapeAttr(v){
    return String(v??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  }

  async function enviarAtual(origem,id){
    const item=global.itensCatalogo?.find(i=>i.origem_tabela===origem&&Number(i.id)===Number(id));
    if(!item) throw new Error('Item não encontrado no catálogo.');
    if(!podeGerenciar()) throw new Error('Somente o OWNER pode gerenciar imagens de referência.');

    const marca=String(item.marca||'').trim();
    const modelo=String(item.modelo||'').trim();
    if(!marca||!modelo) throw new Error('O item precisa ter marca e modelo.');

    const input=document.getElementById('atlasRefArquivo');
    const botao=document.getElementById('atlasRefSalvar');
    const mensagem=document.getElementById('atlasRefMensagem');
    const arquivo=input?.files?.[0];

    if(!arquivo){
      if(mensagem) mensagem.textContent='Selecione uma imagem primeiro.';
      return false;
    }

    try{
      if(botao){botao.disabled=true;botao.textContent='Enviando...';}
      if(mensagem) mensagem.textContent='Enviando e preparando a imagem...';

      const banco=db();
      const sessao=await banco?.auth?.getSession?.();
      const token=sessao?.data?.session?.access_token;
      if(!token) throw new Error('Sua sessão Supabase Auth não está disponível para enviar a imagem.');

      const form=new FormData();
      form.append('imagem',arquivo);
      form.append('nome_referencia',String(item.nome||item.descricao||`${marca} ${modelo}`).trim());
      form.append('marca',marca);
      form.append('modelo',modelo);

      const resposta=await fetch(API_REFERENCIAS,{
        method:'POST',
        headers:{Authorization:`Bearer ${token}`},
        body:form
      });

      let body={};
      try{ body=await resposta.json(); }catch(_){ }
      if(!resposta.ok||!body?.reference?.foto_url){
        throw new Error(body?.error||`Falha no envio da imagem (HTTP ${resposta.status}).`);
      }

      const ref=body.reference;
      referencias.set(chave(ref.marca,ref.modelo),ref);
      item.imagem_referencia=ref;
      item.foto_referencia_url=ref.foto_url;

      if(mensagem) mensagem.textContent='Imagem de referência salva com sucesso.';
      global.renderizarCatalogo?.();
      setTimeout(()=>global.abrirDetalhe?.(origem,Number(id)),180);
      return true;
    }catch(error){
      if(mensagem) mensagem.textContent=error?.message||String(error);
      return false;
    }finally{
      if(botao){botao.disabled=false;botao.textContent=referenciaDoItem(item)?'Substituir imagem':'Adicionar imagem';}
    }
  }

  global.AtlasExpedicaoImagens={
    __loaded:true,
    carregar,
    aplicar,
    url,
    possui,
    referenciaDoItem,
    gerenciadorHtml,
    enviarAtual,
    podeGerenciar
  };
})(window);
