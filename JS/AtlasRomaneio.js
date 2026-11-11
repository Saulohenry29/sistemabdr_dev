/* =========================================================
   BDR ROMANEIO FISCAL
   Arquivo: JS/AtlasRomaneio.js

   Documento operacional para emissão da NF-e de saída.
   Monta o romaneio a partir do pedido, itens efetivamente separados,
   cadastros de produto/patrimônio, obras, empresas e notas de entrada.
========================================================= */
(function(global){
  "use strict";

  if(global.AtlasRomaneio?.__loaded) return;

  function db(){ return global.client || global.supabaseClient || global.clientSupabase || globalThis.client; }
  function texto(v){ return String(v ?? "").trim(); }
  function upper(v){ return texto(v).toUpperCase(); }
  function esc(v){ return texto(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
  function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
  function dinheiro(v){ return num(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
  function dataHoraBR(v){
    if(!v) return "—";
    let t=String(v).trim();
    if(!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(t)) t=t.replace(" ","T")+"Z";
    const d=new Date(t);
    return Number.isNaN(d.getTime())?"—":d.toLocaleString("pt-BR",{timeZone:"America/Cuiaba",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
  }
  function mesmoMunicipio(a,b){
    const cidadeA=upper(a?.cidade), cidadeB=upper(b?.cidade), ufA=upper(a?.estado), ufB=upper(b?.estado);
    if(!cidadeA || !cidadeB) return null;
    return cidadeA===cidadeB && (!ufA || !ufB || ufA===ufB);
  }
  function usuarioAtual(){
    try{return JSON.parse(localStorage.getItem("usuario_logado")||localStorage.getItem("usuarioLogado")||localStorage.getItem("usuarioAtual")||"{}");}
    catch(_){return {};}
  }
  function permissoes(u){
    const origem=Array.isArray(u?.permissoes) ? u.permissoes : texto(u?.permissoes).split(/[;,|]/);
    return origem.map(upper).filter(Boolean);
  }
  function temPermissaoFiscal(u){
    if(Number(u?.id)===1) return true;
    const ps=permissoes(u);
    return ps.includes("EXPEDICAO_FISCAL") || ps.includes("REGISTRAR_NFE") || ps.includes("EXPEDICAO_NFE");
  }

  async function obra(id){
    if(!id) return null;
    const {data,error}=await db().from("obras").select("id,empresa_id,codigo_obra,nome").eq("id",id).maybeSingle();
    if(error) throw error; return data||null;
  }
  async function empresa(id){
    if(!id) return null;
    const {data,error}=await db().from("empresas").select("id,nome,codigo_empresa,cnpj,endereco,cidade,estado,cep,telefone").eq("id",id).maybeSingle();
    if(error) throw error; return data||null;
  }
  async function pedido(id){
    const {data,error}=await db().from("pedidos_retirada").select("*").eq("id",id).single();
    if(error) throw error; return data;
  }
  async function itens(id){
    const {data,error}=await db().from("itens_retirada").select("*").eq("pedido_id",id);
    if(error) throw error;
    return (data||[]).filter(i=>!["RECUSADO","CANCELADO"].includes(upper(i.status)) && num(i.quantidade_separada||i.quantidade||1)>0);
  }
  async function estoque(ids){
    if(!ids.length) return [];
    const {data,error}=await db().from("estoque_produtos").select("*").in("id",ids);
    if(error) throw error; return data||[];
  }
  async function patrimonios(ids){
    if(!ids.length) return [];
    const {data,error}=await db().from("patrimonio").select("*").in("id",ids);
    if(error) throw error; return data||[];
  }
  async function produtoPorCodigo(codigos){
    const lista=[...new Set(codigos.map(texto).filter(Boolean))];
    if(!lista.length) return [];
    const resultados=[];
    for(const campo of ["codigo_produto","codigo_barras"]){
      const {data,error}=await db().from("produtos").select("id,codigo_produto,codigo_barras,descricao,ncm,unidade,valor_referencia").in(campo,lista);
      if(!error && data) resultados.push(...data);
    }
    return [...new Map(resultados.map(p=>[String(p.id),p])).values()];
  }
  async function notasEntrada(produtoIds){
    const ids=[...new Set(produtoIds.map(Number).filter(Boolean))];
    if(!ids.length) return new Map();
    const {data:ei,error}=await db().from("entrada_itens").select("produto_id,entrada_id").in("produto_id",ids);
    if(error || !ei?.length) return new Map();
    const entradaIds=[...new Set(ei.map(x=>Number(x.entrada_id)).filter(Boolean))];
    const {data:ens,error:e2}=await db().from("entradas").select("id,numero_nf,data_entrada").in("id",entradaIds).order("data_entrada",{ascending:false});
    if(e2) return new Map();
    const porEntrada=new Map((ens||[]).map(e=>[Number(e.id),e]));
    const mapa=new Map();
    for(const rel of ei){
      const e=porEntrada.get(Number(rel.entrada_id));
      if(!e) continue;
      const atual=mapa.get(Number(rel.produto_id));
      if(!atual || new Date(e.data_entrada||0)>new Date(atual.data_entrada||0)) mapa.set(Number(rel.produto_id),e);
    }
    return mapa;
  }

  function fmtObra(o){ if(!o) return "—"; return [o.codigo_obra,o.nome].filter(Boolean).join(" - "); }
  function enderecoEmpresa(e){ return [e?.endereco,e?.cidade,e?.estado,e?.cep].filter(Boolean).join(" • ")||"—"; }

  async function montar(pedidoId){
    const p=await pedido(pedidoId);
    const [lista,orig,dest]=await Promise.all([itens(pedidoId),obra(p.obra_origem_id),obra(p.obra_destino_id||p.obra_id)]);
    const [empOrig,empDest]=await Promise.all([empresa(orig?.empresa_id),empresa(dest?.empresa_id)]);
    const estIds=[...new Set(lista.map(i=>Number(i.produto_id)).filter(Boolean))];
    const patIds=[...new Set(lista.map(i=>Number(i.patrimonio_id)).filter(Boolean))];
    const [ests,pats]=await Promise.all([estoque(estIds),patrimonios(patIds)]);
    const estMap=new Map(ests.map(x=>[Number(x.id),x]));
    const patMap=new Map(pats.map(x=>[Number(x.id),x]));
    const cadProdutos=await produtoPorCodigo(ests.map(x=>x.codigo));
    const produtoCodigo=new Map();
    cadProdutos.forEach(x=>{ if(x.codigo_produto) produtoCodigo.set(upper(x.codigo_produto),x); if(x.codigo_barras) produtoCodigo.set(upper(x.codigo_barras),x); });
    const notas=await notasEntrada(cadProdutos.map(x=>x.id));

    const linhas=[];
    for(const i of lista){
      const qtd=Math.max(0,num(i.quantidade_separada||i.quantidade||1));
      if(i.patrimonio_id){
        const pat=patMap.get(Number(i.patrimonio_id))||{};
        const valor=num(pat.valor_bem||pat.valor_aquisicao);
        linhas.push({
          pedido_item_id:Number(i.id)||null, produto_id:Number(i.produto_id)||null, patrimonio_id:Number(i.patrimonio_id)||null, tipo_item:"PATRIMONIO",
          chave:"PAT:"+(pat.codigo_insumo||pat.ncm||pat.nome_bem||i.patrimonio_nome||i.patrimonio_id),
          codigo:pat.codigo_insumo||i.patrimonio_codigo||("PAT-"+i.patrimonio_id),
          custo_direto:"—", descricao:pat.nome_bem||pat.descricao||i.patrimonio_nome||"Patrimônio",
          qtd, ncm:pat.ncm||"", un:"UN", valor_bdr:valor, valor_romaneio:Math.round((valor*0.70+Number.EPSILON)*100)/100,
          nf_entrada:pat.numero_nfe||"", patrimonio:i.patrimonio_codigo||pat.codigo_bem||pat.codigo_qr||String(i.patrimonio_id)
        });
      }else{
        const est=estMap.get(Number(i.produto_id))||{};
        const cad=produtoCodigo.get(upper(est.codigo))||{};
        const valor=num(cad.valor_referencia||est.valor_unitario);
        const nf=notas.get(Number(cad.id));
        linhas.push({
          pedido_item_id:Number(i.id)||null, produto_id:Number(i.produto_id)||null, patrimonio_id:null, tipo_item:"ESTOQUE",
          chave:"EST:"+(cad.id||est.codigo||i.produto_id), codigo:est.codigo||cad.codigo_produto||String(i.produto_id||""),
          custo_direto:"—", descricao:est.descricao||cad.descricao||i.patrimonio_nome||"Material",
          qtd, ncm:cad.ncm||"", un:cad.unidade||est.unidade||"UN", valor_bdr:valor, valor_romaneio:Math.round((valor*0.70+Number.EPSILON)*100)/100,
          nf_entrada:nf?.numero_nf||"", patrimonio:null
        });
      }
    }

    const agrupadas=new Map();
    for(const l of linhas){
      const k=[l.chave,l.codigo,l.ncm,l.un,l.valor_bdr,l.valor_romaneio,l.nf_entrada].join("|");
      if(!agrupadas.has(k)) agrupadas.set(k,{...l,patrimonios:[],qtd:0});
      const a=agrupadas.get(k); a.qtd+=l.qtd; if(l.patrimonio) a.patrimonios.push(l.patrimonio);
    }
    const composicao=[...agrupadas.values()].map(l=>({...l,total:l.qtd*l.valor_romaneio}));
    const percentual=Number(p.percentual_valor_romaneio||70)===100?100:70;
    composicao.forEach(l=>{ l.total=l.qtd*(percentual===100?l.valor_bdr:l.valor_romaneio); });
    return {pedido:p,origem:orig,destino:dest,empresaOrigem:empOrig,empresaDestino:empDest,linhas:composicao,itensSnapshot:linhas,percentual,total:composicao.reduce((s,l)=>s+l.total,0)};
  }

  function tipoMovimentacao(r){
    const igual=mesmoMunicipio(r?.empresaOrigem,r?.empresaDestino);
    return igual===true?"MESMO_MUNICIPIO":igual===false?"INTERMUNICIPAL":"A_CONFERIR";
  }

  function statusSnapshot(p){
    const st=upper(p?.status);
    if(st==="RECEBIDO") return "RECEBIDO";
    if(st==="EM_TRANSITO") return "EM_TRANSITO";
    if(st==="CANCELADO" || st==="RECUSADO") return "CANCELADO";
    if(p?.exige_nfe===true && upper(p?.status_fiscal)!=="NFE_EMITIDA") return "AGUARDANDO_NFE";
    if(upper(p?.status_fiscal)==="NFE_EMITIDA") return "LIBERADO";
    return "ABERTO";
  }

  function idSolicitante(p){
    return Number(p?.solicitante_id||p?.usuario_criacao_id||p?.usuario_id)||null;
  }

  async function buscarSnapshot(pedidoId){
    const {data,error}=await db().from("romaneios").select("*").eq("pedido_id",pedidoId).maybeSingle();
    if(error) throw error;
    return data||null;
  }

  async function sincronizarCabecalhoSnapshot(r, existente){
    const p=r.pedido, u=usuarioAtual();
    const payload={
      empresa_id:Number(p.empresa_id||r.origem?.empresa_id)||null,
      obra_origem_id:Number(p.obra_origem_id)||null,
      obra_destino_id:Number(p.obra_destino_id||p.obra_id)||null,
      origem_empresa:texto(r.empresaOrigem?.nome)||null, origem_obra:fmtObra(r.origem), origem_cnpj:texto(r.empresaOrigem?.cnpj)||null,
      origem_endereco:enderecoEmpresa(r.empresaOrigem), origem_cidade:texto(r.empresaOrigem?.cidade)||null, origem_estado:texto(r.empresaOrigem?.estado)||null,
      destino_empresa:texto(r.empresaDestino?.nome)||null, destino_obra:fmtObra(r.destino), destino_cnpj:texto(r.empresaDestino?.cnpj)||null,
      destino_endereco:enderecoEmpresa(r.empresaDestino), destino_cidade:texto(r.empresaDestino?.cidade)||null, destino_estado:texto(r.empresaDestino?.estado)||null,
      transportadora:texto(p.transportadora)||null, placa:texto(p.veiculo_placa)||null, motorista:texto(p.motorista_nome)||null,
      solicitante_id:idSolicitante(p), solicitante_nome:texto(p.solicitante||p.usuario_criacao)||null,
      tipo_movimentacao:tipoMovimentacao(r), exige_nfe:p.exige_nfe===true, numero_nfe:texto(p.numero_nfe)||null, serie_nfe:texto(p.serie_nfe)||null, chave_nfe:texto(p.chave_nfe)||null,
      pedido_codigo:texto(p.codigo)||(`PED-${p.id}`), data_movimentacao:p.data_finalizacao_separacao||p.data_criacao||p.criado_em||existente?.data_movimentacao||new Date().toISOString(),
      percentual_valor:Number(p.percentual_valor_romaneio||existente?.percentual_valor||70)===100?100:70,
      valor_total:Math.round((r.linhas.reduce((s,l)=>s+l.qtd*((Number(p.percentual_valor_romaneio||existente?.percentual_valor||70)===100)?l.valor_bdr:l.valor_romaneio),0)+Number.EPSILON)*100)/100,
      status:statusSnapshot(p), updated_at:new Date().toISOString()
    };
    // Depois de fechado, o documento histórico não é reescrito.
    if(existente?.fechado_em) return existente;
    const {data,error}=await db().from("romaneios").update(payload).eq("id",existente.id).select("*").single();
    if(error) throw error;
    return data;
  }

  async function garantirSnapshot(r){
    let existente=await buscarSnapshot(r.pedido.id);
    if(existente) return sincronizarCabecalhoSnapshot(r,existente);

    const p=r.pedido, u=usuarioAtual();
    const criadoEm=p.data_finalizacao_separacao||new Date().toISOString();
    const cabecalho={
      numero_romaneio:Number(p.id), pedido_id:Number(p.id), empresa_id:Number(p.empresa_id||r.origem?.empresa_id)||null,
      obra_origem_id:Number(p.obra_origem_id)||null, obra_destino_id:Number(p.obra_destino_id||p.obra_id)||null,
      origem_empresa:texto(r.empresaOrigem?.nome)||null, origem_obra:fmtObra(r.origem), origem_cnpj:texto(r.empresaOrigem?.cnpj)||null, origem_endereco:enderecoEmpresa(r.empresaOrigem), origem_cidade:texto(r.empresaOrigem?.cidade)||null, origem_estado:texto(r.empresaOrigem?.estado)||null,
      destino_empresa:texto(r.empresaDestino?.nome)||null, destino_obra:fmtObra(r.destino), destino_cnpj:texto(r.empresaDestino?.cnpj)||null, destino_endereco:enderecoEmpresa(r.empresaDestino), destino_cidade:texto(r.empresaDestino?.cidade)||null, destino_estado:texto(r.empresaDestino?.estado)||null,
      transportadora:texto(p.transportadora)||null, placa:texto(p.veiculo_placa)||null, motorista:texto(p.motorista_nome)||null,
      solicitante_id:idSolicitante(p), solicitante_nome:texto(p.solicitante||p.usuario_criacao)||null, tipo_movimentacao:tipoMovimentacao(r), exige_nfe:p.exige_nfe===true,
      numero_nfe:texto(p.numero_nfe)||null, serie_nfe:texto(p.serie_nfe)||null, chave_nfe:texto(p.chave_nfe)||null,
      pedido_codigo:texto(p.codigo)||(`PED-${p.id}`), data_movimentacao:p.data_finalizacao_separacao||p.data_criacao||p.criado_em||criadoEm,
      percentual_valor:Number(p.percentual_valor_romaneio||70)===100?100:70,
      valor_total:Math.round((r.total+Number.EPSILON)*100)/100, status:statusSnapshot(p),
      criado_por_id:Number(u?.id)||null, criado_por_nome:texto(u?.nome||u?.usuario)||null, criado_em:criadoEm, updated_at:new Date().toISOString()
    };
    const {data:rom,error}=await db().from("romaneios").insert(cabecalho).select("*").single();
    if(error) throw error;

    const itensSnap=(r.itensSnapshot||[]).map(l=>({
      romaneio_id:rom.id, pedido_item_id:l.pedido_item_id, produto_id:l.produto_id, patrimonio_id:l.patrimonio_id,
      codigo:texto(l.codigo)||null, descricao:texto(l.descricao)||"Item", quantidade:num(l.qtd)||1, unidade:texto(l.un)||null, ncm:texto(l.ncm)||null,
      custo_direto:texto(l.custo_direto)==="—"?null:(texto(l.custo_direto)||null), valor_bdr:num(l.valor_bdr), percentual_romaneio:70, valor_romaneio:num(l.valor_romaneio),
      valor_total_revisado:Math.round((num(l.qtd)*num(l.valor_romaneio)+Number.EPSILON)*100)/100, numero_nfe_entrada:texto(l.nf_entrada)||null,
      codigo_patrimonio:l.tipo_item==="PATRIMONIO"?(texto(l.patrimonio)||null):null, tipo_item:l.tipo_item
    }));
    if(itensSnap.length){
      const {error:erroItens}=await db().from("romaneio_itens").insert(itensSnap);
      if(erroItens){ await db().from("romaneios").delete().eq("id",rom.id); throw erroItens; }
    }
    return rom;
  }

  async function carregarDoSnapshot(snapshot){
    const {data:itensSalvos,error}=await db().from("romaneio_itens").select("*").eq("romaneio_id",snapshot.id).order("id",{ascending:true});
    if(error) throw error;
    const percentual=Number(snapshot.percentual_valor)===100?100:70;
    const linhas=(itensSalvos||[]).map(i=>({
      pedido_item_id:i.pedido_item_id, produto_id:i.produto_id, patrimonio_id:i.patrimonio_id, tipo_item:i.tipo_item,
      codigo:i.codigo||"", custo_direto:i.custo_direto||"—", descricao:i.descricao||"Item", qtd:num(i.quantidade), ncm:i.ncm||"",
      un:i.unidade||"UN", valor_bdr:num(i.valor_bdr), valor_romaneio:num(i.valor_romaneio), nf_entrada:i.numero_nfe_entrada||"",
      patrimonio:i.codigo_patrimonio||null, patrimonios:i.codigo_patrimonio?[i.codigo_patrimonio]:[]
    }));
    linhas.forEach(l=>{ l.total=l.qtd*(percentual===100?l.valor_bdr:l.valor_romaneio); });
    const p={
      id:Number(snapshot.pedido_id), codigo:snapshot.pedido_codigo||(`PED-${snapshot.pedido_id}`),
      data_finalizacao_separacao:snapshot.data_movimentacao||snapshot.criado_em, veiculo_placa:snapshot.placa, motorista_nome:snapshot.motorista, transportadora:snapshot.transportadora,
      numero_nfe:snapshot.numero_nfe, serie_nfe:snapshot.serie_nfe, chave_nfe:snapshot.chave_nfe, exige_nfe:snapshot.exige_nfe===true,
      status_fiscal:snapshot.status==="AGUARDANDO_NFE"?"AGUARDANDO_NFE":snapshot.numero_nfe?"NFE_EMITIDA":"",
      solicitante:snapshot.solicitante_nome, solicitante_id:snapshot.solicitante_id, obra_origem_id:snapshot.obra_origem_id, obra_destino_id:snapshot.obra_destino_id, empresa_id:snapshot.empresa_id,
      percentual_valor_romaneio:percentual, valor_total_romaneio:num(snapshot.valor_total)
    };
    const origem={id:snapshot.obra_origem_id,nome:snapshot.origem_obra,codigo_obra:""};
    const destino={id:snapshot.obra_destino_id,nome:snapshot.destino_obra,codigo_obra:""};
    const empresaOrigem={nome:snapshot.origem_empresa,cnpj:snapshot.origem_cnpj,endereco:snapshot.origem_endereco,cidade:snapshot.origem_cidade,estado:snapshot.origem_estado};
    const empresaDestino={nome:snapshot.destino_empresa,cnpj:snapshot.destino_cnpj,endereco:snapshot.destino_endereco,cidade:snapshot.destino_cidade,estado:snapshot.destino_estado};
    return {pedido:p,origem,destino,empresaOrigem,empresaDestino,linhas,percentual,total:linhas.reduce((s,l)=>s+l.total,0),snapshot,fonte:"SNAPSHOT"};
  }

  async function obterRomaneio(pedidoId){
    let snapshot=await buscarSnapshot(pedidoId);
    if(snapshot){
      // Migração única dos ROMs criados antes dos campos documentais novos.
      if(!snapshot.pedido_codigo || !snapshot.data_movimentacao || snapshot.percentual_valor==null || snapshot.valor_total==null){
        const atual=await montar(pedidoId);
        snapshot=await sincronizarCabecalhoSnapshot(atual,snapshot);
      }
      return carregarDoSnapshot(snapshot);
    }
    const atual=await montar(pedidoId);
    snapshot=await garantirSnapshot(atual);
    return carregarDoSnapshot(snapshot);
  }

  function estilos(){
    if(document.getElementById("bdrRomaneioCss")) return;
    const s=document.createElement("style"); s.id="bdrRomaneioCss"; s.textContent=`
      .bdr-rom, .bdr-rom *{user-select:text;-webkit-user-select:text}.bdr-rom button,.bdr-rom input,.bdr-rom label{user-select:none;-webkit-user-select:none}
      .bdr-rom-bg{position:fixed;inset:0;background:#eef3f8;z-index:2147483000;overflow:auto;padding:18px}.bdr-rom{max-width:860px;margin:auto;background:#fff;border-radius:18px;box-shadow:0 18px 50px #0f172a22;overflow:hidden;color:#102a4c}.bdr-rom-top{padding:24px 28px 16px;display:flex;gap:20px;align-items:center;justify-content:space-between;border-bottom:1px solid #dbe5ef}.bdr-rom-brand{font-size:34px;font-weight:1000;letter-spacing:.5px}.bdr-rom-title{text-align:center;flex:1}.bdr-rom-title h2{margin:0;font-size:25px}.bdr-rom-title small{color:#64748b;font-weight:800}.bdr-rom-status{background:#dcfce7;color:#15803d;padding:10px 14px;border-radius:10px;font-weight:900}.bdr-rom-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px 20px}.bdr-rom-kpi,.bdr-rom-card{border:1px solid #dce6f0;border-radius:12px;padding:14px;background:#fbfdff}.bdr-rom-kpi b{display:block;font-size:18px;margin-top:5px}.bdr-rom-partes{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 20px 14px}.bdr-rom-card h3{margin:0 0 10px}.bdr-rom-card p{margin:5px 0}.bdr-rom-table-wrap{padding:0 20px;overflow:auto}.bdr-rom-table{width:100%;border-collapse:collapse;min-width:0}.bdr-rom-table th{background:#123d70;color:#fff;padding:9px 6px;font-size:10px}.bdr-rom-table td{border:1px solid #dce6f0;padding:7px 5px;font-size:10px}.bdr-rom-table td.num{text-align:right}.bdr-rom-table td small{display:block;font-size:9px;font-weight:600;line-height:1.35;color:#64748b;margin-top:3px;overflow-wrap:anywhere}.bdr-rom-table td{overflow-wrap:anywhere}.bdr-rom-table td:nth-child(3){width:31%}.bdr-rom-table td:nth-child(2){width:19%}.bdr-rom-total{margin:14px 24px 0 auto;width:max-content;background:#eef6ff;border:1px solid #bfdbfe;border-radius:12px;padding:13px 18px;font-weight:1000;font-size:21px}.bdr-rom-alert{margin:14px 24px;background:#fff8e7;border:1px solid #fde3a7;padding:12px 14px;border-radius:10px;color:#8a5a00}.bdr-rom-actions{position:sticky;bottom:0;background:#fff;border-top:1px solid #dbe5ef;padding:14px 24px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}.bdr-rom-btn{border:0;border-radius:9px;padding:11px 16px;font-weight:900;cursor:pointer}.bdr-rom-btn.primary{background:#0b74de;color:#fff}.bdr-rom-btn.ok{background:#16a34a;color:#fff}.bdr-rom-btn.gray{background:#e8eef5;color:#17365d}.bdr-export{position:relative}.bdr-export-menu{display:none;position:absolute;bottom:48px;right:0;z-index:2147483647;background:#fff;border:1px solid #d7e1ec;border-radius:10px;box-shadow:0 12px 30px #0f172a25;overflow:hidden;min-width:190px}.bdr-export-menu.ativo{display:block}.bdr-export-menu button{display:block;width:100%;border:0;background:#fff!important;color:#17365d!important;padding:12px 14px;text-align:left;font-weight:800;cursor:pointer;opacity:1!important}.bdr-export-menu button:hover{background:#eef6ff!important;color:#0b4f93!important}.bdr-rom-valor{margin:14px 24px 0;padding:14px 16px;border:1px solid #dce6f0;border-radius:12px;background:#fbfdff;display:flex;align-items:center;gap:18px;flex-wrap:wrap}.bdr-rom-valor strong{margin-right:4px}.bdr-rom-opcao{display:flex;align-items:center;gap:7px;font-weight:800;cursor:pointer}.bdr-rom-opcao input{accent-color:#0b74de;width:17px;height:17px}@media(max-width:800px){.bdr-rom-bg{padding:0}.bdr-rom{border-radius:0;min-height:100vh}.bdr-rom-top{padding:16px;align-items:flex-start;flex-wrap:wrap}.bdr-rom-brand{font-size:27px}.bdr-rom-title{order:3;flex-basis:100%;text-align:left}.bdr-rom-grid{grid-template-columns:1fr 1fr;padding:12px}.bdr-rom-partes{grid-template-columns:1fr;padding:0 12px 12px}.bdr-rom-table-wrap{padding:0 12px}.bdr-rom-actions{padding:10px 12px;justify-content:stretch}.bdr-rom-btn{flex:1}.bdr-rom-total{margin-right:12px}.bdr-rom-alert{margin:12px}}@media print{body>*:not(.bdr-rom-bg){display:none!important}.bdr-rom-bg{position:static;padding:0;background:#fff}.bdr-rom{box-shadow:none}.bdr-rom-actions{display:none}.bdr-rom{max-width:none}.bdr-rom-table{min-width:0}.bdr-rom-alert{display:none}}

      /* Documento patrimonial A4 + painel de assinaturas, integrado à Expedição. */
      .atlas-doc-backdrop{background:#f2f6fb;z-index:2147483000;padding:0!important;color:#102b50}
      .atlas-doc-shell{font-family:Arial,Helvetica,sans-serif;max-width:1480px;min-height:100vh;margin:auto;background:#f8fbff;box-shadow:0 15px 70px #102b5016}
      .atlas-doc-toolbar{padding:18px 32px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border-bottom:1px solid #d9e4f0}
      .atlas-doc-toolbar h1{font-size:23px;line-height:1.1;margin:0 0 5px;color:#102b50}.atlas-doc-toolbar small{display:block;font-size:13px;color:#60758f}
      .atlas-doc-toolbar-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.atlas-doc-button{border:1px solid #cfdeef;background:#fff;color:#123d70;padding:10px 15px;border-radius:9px;font-size:13px;font-weight:800;cursor:pointer}.atlas-doc-button:hover{background:#ebf4ff}.atlas-doc-button:disabled{opacity:.45;cursor:not-allowed}.atlas-doc-button.main{color:#fff;background:#104c91;border-color:#104c91}.atlas-doc-close{font-size:24px;padding:5px 13px}
      .atlas-doc-subtabs{display:flex;gap:10px;padding:15px 32px 0}.atlas-doc-subtabs button{border:1px solid #cbdff2;background:#eaf2fc;color:#284d7a;padding:11px 22px;font-weight:800;border-radius:10px 10px 0 0;cursor:pointer}.atlas-doc-subtabs button.active{background:#fff;border-bottom-color:#fff;color:#003f81}
      /* Abas com a mesma altura e alinhamento, sem alterar o layout de impressão. */
      .atlas-doc-subtabs{align-items:stretch;flex-wrap:nowrap;overflow-x:auto;row-gap:0;border-bottom:1px solid #cbdff2}
      .atlas-doc-subtabs button{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;min-height:46px;line-height:1.25;white-space:nowrap;margin-bottom:-1px;box-sizing:border-box}
      .atlas-doc-subtabs button.active{position:relative;z-index:1}
      .atlas-doc-content{padding:0 32px 36px}.atlas-doc-content section[hidden]{display:none!important}
      .atlas-doc-printable{width:100%;max-width:1060px;margin:0 auto;background:#fff;padding:30px;border-radius:0 0 13px 13px;box-shadow:0 9px 30px #10376312;font-family:Arial,Helvetica,sans-serif;color:#14345e;box-sizing:border-box}
      .atlas-doc-brandbar{display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:3px solid #14549a;padding-bottom:16px;margin-bottom:20px}
      .atlas-doc-mark{display:flex;align-items:center;gap:14px;color:#12447b}.atlas-doc-mark>strong{font-size:38px;letter-spacing:-1px}.atlas-doc-mark>span{font-size:23px;font-weight:800;border-left:2px solid #14549a;padding-left:14px}.atlas-doc-mark small{display:block;font-size:11px;font-weight:500}
      .atlas-doc-name{text-align:right}.atlas-doc-name>b{font-size:25px;display:block}.atlas-doc-name>small{font-size:13px;color:#617995}
      .atlas-doc-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid #cbdaed;border-radius:11px;margin-bottom:17px;overflow:hidden}
      .atlas-doc-stats>div{padding:12px 16px;min-width:0}.atlas-doc-stats>div+div{border-left:1px solid #dbe5f1}.atlas-doc-stats small,.atlas-doc-transport small{display:block;font-size:11px;color:#586f89;margin-bottom:5px}.atlas-doc-stats b{display:block;font-size:14px;overflow-wrap:anywhere}
      .atlas-doc-partes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 17px}.atlas-doc-partes section{border:1px solid #c6d9ee;border-radius:10px;overflow:hidden;min-width:0;padding-bottom:9px}.atlas-doc-partes h3{background:#e2effe;color:#0a4185;font-size:15px;margin:0 0 9px;padding:10px 13px}.atlas-doc-partes p{font-size:12px;margin:5px 13px;overflow-wrap:anywhere}
      .atlas-doc-transport{display:grid;grid-template-columns:1fr 1.5fr .85fr;border:1px solid #c6d9ee;border-radius:10px;margin:0 0 18px;overflow:hidden}.atlas-doc-transport>div{padding:12px 13px;min-width:0}.atlas-doc-transport>div+div{border-left:1px solid #dce7f2}.atlas-doc-transport b{display:block;font-size:13px;overflow-wrap:anywhere}
      .atlas-doc-table-wrap{overflow:auto}.atlas-doc-table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:12px}.atlas-doc-table th{background:#103e76!important;color:#fff!important;font-size:11px;text-align:left;padding:9px 7px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.atlas-doc-table td{border:1px solid #d6e0ed;padding:9px 7px;vertical-align:top;overflow-wrap:anywhere}.atlas-doc-table th:nth-child(1){width:6%}.atlas-doc-table th:nth-child(2){width:18%}.atlas-doc-table th:nth-child(3){width:32%}.atlas-doc-table th:nth-child(4){width:7%}.atlas-doc-table th:nth-child(5){width:6%}.atlas-doc-table th:nth-child(6){width:18%}.atlas-doc-table th:nth-child(7){width:13%}.atlas-doc-table td small{display:block;line-height:1.35;color:#60758c;margin-top:4px}.atlas-doc-code{font-weight:800}.atlas-doc-price{text-align:right;white-space:nowrap}.atlas-doc-td-num{text-align:center}
      .atlas-doc-total{display:flex;justify-content:flex-end;margin:11px 0 19px;font-size:13px}.atlas-doc-total b{background:#eaf2fc;padding:9px 12px;border-radius:8px}
      .atlas-doc-print-signatures{border-top:2px solid #1d5c9a;padding-top:13px;margin-top:18px;break-inside:avoid}.atlas-doc-print-signatures>h3{font-size:16px;margin:0 0 14px}.atlas-doc-print-sign-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.atlas-doc-print-sign{border:1px solid #c6d9ee;border-radius:8px;padding:0 15px 12px;text-align:center;break-inside:avoid;min-height:150px}.atlas-doc-print-sign-title{background:#e6f2ff;color:#103f7a;font-size:13px;font-weight:800;padding:10px;margin:0 -15px 10px;text-align:left}.atlas-doc-print-sign-image{height:64px;display:flex;align-items:center;justify-content:center}.atlas-doc-print-sign-image img{max-width:100%;max-height:64px}.atlas-doc-print-sign-image span{color:#9aa8b9;font-size:11px;font-style:italic}.atlas-doc-print-sign-line{border-top:1px solid #8092ac;margin:0 24px 7px}.atlas-doc-print-sign b,.atlas-doc-print-sign small{display:block;margin:5px 0}.atlas-doc-print-sign small{font-size:11px;color:#5f7590}
      .atlas-doc-print-footer{display:flex;justify-content:space-between;gap:18px;align-items:center;border-top:2px solid #1d5c9a;padding-top:13px;margin-top:22px;break-inside:avoid;font-size:11px}.atlas-doc-print-footer>div{flex:1}.atlas-doc-print-footer small{display:block;margin-top:4px;color:#5b7290}.atlas-doc-qr-place{display:flex;align-items:center;gap:12px}.atlas-doc-qr-place img{width:74px;height:74px}
      .atlas-doc-sign-area{max-width:1060px;margin:0 auto;background:#fff;border:1px solid #d5e2f1;border-radius:0 0 13px 13px;padding:25px}.atlas-doc-sign-title{display:flex;align-items:center;justify-content:space-between;gap:10px}.atlas-doc-sign-title h2{font-size:21px;margin:0 0 15px}.atlas-doc-sign-title span{background:#e2f8f4;color:#166f62;border-radius:25px;padding:9px;font-weight:800;font-size:12px}.atlas-doc-sign-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.atlas-doc-sign-card{border:1px solid #c4d8f0;border-radius:12px;overflow:hidden}.atlas-doc-sign-head{display:flex;justify-content:space-between;align-items:start;background:#eef6ff;padding:15px;gap:10px}.atlas-doc-assinado .atlas-doc-sign-head{background:#e7f8ee}.atlas-doc-sign-head strong,.atlas-doc-sign-head small{display:block}.atlas-doc-sign-head small{font-size:12px;color:#56728f;margin-top:4px}.atlas-doc-sign-state{flex-shrink:0;font-size:12px;font-weight:800;color:#936015;background:#fff3d9;padding:6px 11px;border-radius:20px}.atlas-doc-sign-state.ok{color:#167343;background:#d8f7e3}.atlas-doc-sign-content{padding:18px;text-align:center;min-height:155px}.atlas-doc-sign-img{width:auto;max-width:95%;height:68px;object-fit:contain}.atlas-doc-sign-content strong,.atlas-doc-sign-content small{display:block;margin-top:7px}.atlas-doc-sign-content small{color:#59718a;font-size:12px}.atlas-doc-sign-empty{height:80px;border:2px dashed #cddced;background:#f8fbff;border-radius:9px;display:flex;align-items:center;justify-content:center;color:#7c8da2;font-size:13px}
      .atlas-doc-sign-buttons{display:flex;gap:10px;margin:18px 0 12px;flex-wrap:wrap}.atlas-doc-sign-note,.atlas-doc-warning{background:#edf5ff;padding:15px;border-radius:9px;color:#45627e;font-size:13px;line-height:1.5}.atlas-doc-warning{margin:13px 0;background:#fff7e5;color:#825510}.atlas-doc-driver-link{display:flex;align-items:center;flex-wrap:wrap;gap:15px;border:1px solid #b9d8f8;border-radius:10px;padding:16px;margin:16px 0}.atlas-doc-driver-link[hidden]{display:none}.atlas-doc-driver-link p{width:100%;margin:0}.atlas-doc-driver-link img{width:148px;height:148px}.atlas-doc-driver-link small{color:#64748b}
      .atlas-doc-pad-overlay{position:fixed;inset:0;z-index:2147483600;background:#0c1a32ba;display:flex;align-items:center;justify-content:center;padding:20px}.atlas-doc-pad-box{width:min(780px,100%);padding:24px;border-radius:16px;background:white;color:#17385e}.atlas-doc-pad-box h2{margin:0 0 10px}.atlas-doc-pad-box p{font-size:13px;color:#506a87}.atlas-doc-pad-box canvas{touch-action:none;width:100%;height:180px;border:2px dashed #b9cee6;border-radius:10px;background:white}.atlas-doc-pad-buttons{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:9px;margin-top:16px}
      @media(max-width:760px){.atlas-doc-toolbar{padding:14px;flex-wrap:wrap}.atlas-doc-toolbar h1{font-size:18px}.atlas-doc-toolbar-actions{width:100%}.atlas-doc-subtabs{padding:12px 12px 0}.atlas-doc-content{padding:0 6px 18px}.atlas-doc-printable{padding:12px}.atlas-doc-mark>strong{font-size:25px}.atlas-doc-mark>span{font-size:16px}.atlas-doc-name>b{font-size:17px}.atlas-doc-stats>div{padding:8px}.atlas-doc-stats b{font-size:11px}.atlas-doc-partes{gap:6px}.atlas-doc-partes p{font-size:10px}.atlas-doc-transport{grid-template-columns:1fr}.atlas-doc-transport>div+div{border-left:0;border-top:1px solid #dce7f2}.atlas-doc-table{min-width:720px}.atlas-doc-sign-area{padding:12px}.atlas-doc-sign-grid{grid-template-columns:1fr}.atlas-doc-print-sign-grid{gap:7px}.atlas-doc-print-sign{padding:0 6px 8px}.atlas-doc-print-sign-title{margin:0 -6px 10px}.atlas-doc-print-footer{gap:9px}}
    `; document.head.appendChild(s);
  }

  function tabelaHTML(r){
    return `<table class="bdr-rom-table"><thead><tr><th>ITEM</th><th>CÓDIGO</th><th>CUSTO DIRETO</th><th>DESCRIÇÃO</th><th>QTD</th><th>NCM</th><th>UN</th><th>VALOR BDR</th><th>VALOR ROMANEIO</th><th>VALOR TOTAL REVISADO</th><th>NF DE ENTRADA</th></tr></thead><tbody>${r.linhas.map((l,idx)=>`<tr><td>${idx+1}</td><td>${esc(l.codigo)||"—"}</td><td>${esc(l.custo_direto)}</td><td>${esc(l.descricao)}${l.patrimonios?.length?`<div style="font-size:11px;color:#64748b;margin-top:4px">${esc(l.patrimonios.join(", "))}</div>`:""}</td><td class="num">${l.qtd.toLocaleString("pt-BR")}</td><td>${esc(l.ncm)||'<b style="color:#b45309">PENDENTE</b>'}</td><td>${esc(l.un)}</td><td class="num">${dinheiro(l.valor_bdr)}</td><td class="num">${dinheiro(l.valor_romaneio)}</td><td class="num"><b>${dinheiro(l.total)}</b></td><td>${esc(l.nf_entrada)||"—"}</td></tr>`).join("")}</tbody></table>`;
  }

  // Versão de leitura/impressão em A4 retrato. Os campos fiscais continuam
  // disponíveis na tabela original usada nas exportações Excel/Word.
  function tabelaVertical(r){
    return `<table class="bdr-rom-table bdr-rom-table-vertical"><thead><tr>
      <th>Nº</th><th>Patrimônio / código</th><th>Descrição / dados fiscais</th>
      <th>Qtd.</th><th>UN</th><th>Valores unitários</th><th>Total</th>
    </tr></thead><tbody>${r.linhas.map((l,idx)=>`<tr>
      <td>${idx+1}</td><td><b>${esc(l.codigo)||"—"}</b>${l.patrimonios?.length?`<small>Pat.: ${esc(l.patrimonios.join(', '))}</small>`:''}</td>
      <td><b>${esc(l.descricao)}</b><small>NCM: ${esc(l.ncm)||'Pendente'} · NF entrada: ${esc(l.nf_entrada)||'—'}</small></td>
      <td class="num">${l.qtd.toLocaleString('pt-BR')}</td><td>${esc(l.un)||'UN'}</td>
      <td class="num"><b>${dinheiro(l.valor_bdr)}</b><small>Romaneio: ${dinheiro(l.valor_romaneio)}</small></td>
      <td class="num"><b>${dinheiro(l.total)}</b></td></tr>`).join('')}</tbody></table>`;
  }

  async function abrir(pedidoId){
    estilos();
    const antigo=document.getElementById("bdrRomaneioFiscal"); if(antigo) antigo.remove();
    const fundo=document.createElement("div"); fundo.id="bdrRomaneioFiscal"; fundo.className="bdr-rom-bg";
    fundo.innerHTML='<div class="bdr-rom" style="padding:30px;text-align:center"><b>Montando Romaneio Fiscal...</b></div>';
    document.body.appendChild(fundo);
    try{
      const pAcesso=await pedido(pedidoId);
      if(!await podeConsultarDocumentoObras(pAcesso.obra_origem_id,pAcesso.obra_destino_id||pAcesso.obra_id)){
        throw new Error('O romaneio pertence a obras fora do seu escopo de consulta.');
      }
      const r=await obterRomaneio(pedidoId);
      global.__bdrRomaneioAtual=r;
      const p=r.pedido;
      const pendencias=[];
      if(r.linhas.some(l=>!l.ncm)) pendencias.push("Existem itens sem NCM cadastrado.");
      if(r.linhas.some(l=>!l.valor_bdr)) pendencias.push("Existem itens sem valor de referência.");
      if(r.linhas.some(l=>!l.nf_entrada)) pendencias.push("Há itens sem referência inequívoca de NF de entrada.");
      fundo.innerHTML=`<div class="bdr-rom">
        <div class="bdr-rom-top"><div class="bdr-rom-brand">BDR</div><div class="bdr-rom-title"><h2>ROMANEIO FISCAL DE SAÍDA</h2><small>COMPOSIÇÃO PARA EMISSÃO DE NF-e</small></div><div class="bdr-rom-status">${upper(p.status_fiscal)==="NFE_EMITIDA"?"✓ NF-e REGISTRADA":"● AGUARDANDO NF-e"}</div></div>
        <div class="bdr-rom-grid"><div class="bdr-rom-kpi">ROMANEIO<b>${esc(p.id)}</b></div><div class="bdr-rom-kpi">PEDIDO / TRANSFERÊNCIA<b>${esc(p.codigo||("PED-"+p.id))}</b></div><div class="bdr-rom-kpi">DATA<b>${dataHoraBR(p.data_finalizacao_separacao||p.data_criacao||p.criado_em)}</b></div><div class="bdr-rom-kpi">PLACA<b>${esc(p.veiculo_placa)||"—"}</b></div><div class="bdr-rom-kpi">MOTORISTA<b>${esc(p.motorista_nome)||"—"}</b></div></div>
        <div class="bdr-rom-partes"><div class="bdr-rom-card"><h3>↗ ORIGEM (SAÍDA)</h3><p><b>Empresa:</b> ${esc(r.empresaOrigem?.nome)||"—"}</p><p><b>Obra / Local:</b> ${esc(fmtObra(r.origem))}</p><p><b>CNPJ:</b> ${esc(r.empresaOrigem?.cnpj)||"—"}</p><p><b>Endereço:</b> ${esc(enderecoEmpresa(r.empresaOrigem))}</p></div><div class="bdr-rom-card"><h3>📍 DESTINO</h3><p><b>Empresa:</b> ${esc(r.empresaDestino?.nome)||"—"}</p><p><b>Obra / Local:</b> ${esc(fmtObra(r.destino))}</p><p><b>CNPJ:</b> ${esc(r.empresaDestino?.cnpj)||"—"}</p><p><b>Endereço:</b> ${esc(enderecoEmpresa(r.empresaDestino))}</p></div></div>
        <div class="bdr-rom-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="bdr-rom-kpi">TRANSPORTADORA<b>${esc(p.transportadora)||"PENDENTE"}</b></div><div class="bdr-rom-kpi">NF-e SAÍDA<b>${esc(p.numero_nfe)||"PENDENTE"}</b></div><div class="bdr-rom-kpi">MOVIMENTAÇÃO<b>${mesmoMunicipio(r.empresaOrigem,r.empresaDestino)===true?"MESMO MUNICÍPIO":mesmoMunicipio(r.empresaOrigem,r.empresaDestino)===false?"INTERMUNICIPAL":"A CONFERIR"}</b></div><div class="bdr-rom-kpi">SOLICITANTE DO PEDIDO<b>${esc(p.solicitante||p.usuario_criacao)||"—"}</b></div></div>
        <div class="bdr-rom-table-wrap">${tabelaVertical(r)}</div>
        <div class="bdr-rom-valor"><strong>Valor para emissão da NF-e:</strong><label class="bdr-rom-opcao"><input type="radio" name="bdrValorFiscal" value="70" ${r.percentual===70?"checked":""} onchange="AtlasRomaneio.selecionarValor(70)"> Romaneio 70% (${dinheiro(r.linhas.reduce((s,l)=>s+l.qtd*l.valor_romaneio,0))})</label><label class="bdr-rom-opcao"><input type="radio" name="bdrValorFiscal" value="100" ${r.percentual===100?"checked":""} onchange="AtlasRomaneio.selecionarValor(100)"> BDR 100% (${dinheiro(r.linhas.reduce((s,l)=>s+l.qtd*l.valor_bdr,0))})</label></div>
        <div class="bdr-rom-total">TOTAL GERAL DO ROMANEIO: ${dinheiro(r.total)}</div>
        ${pendencias.length?`<div class="bdr-rom-alert"><b>⚠ Pendências para conferência fiscal:</b> ${pendencias.map(esc).join(" • ")}</div>`:""}
        <div class="bdr-rom-actions"><button class="bdr-rom-btn primary" onclick="AtlasRomaneio.abrirDocumentoPedido(${Number(p.id)})">▤ Documento de transporte</button><button class="bdr-rom-btn gray" onclick="AtlasRomaneio.abrirTransporte()">🚚 Dados do transporte</button><button class="bdr-rom-btn gray" onclick="AtlasRomaneio.imprimir()">🖨 Imprimir</button><div class="bdr-export"><button class="bdr-rom-btn primary" onclick="AtlasRomaneio.toggleExportar(event)">⇩ Exportar ▾</button><div class="bdr-export-menu" id="bdrExportMenu"><button onclick="AtlasRomaneio.exportarExcel()">Exportar para Excel</button><button onclick="AtlasRomaneio.exportarWord()">Exportar para Word</button></div></div>${p.exige_nfe===true && upper(p.status_fiscal)!=="NFE_EMITIDA"?`<button class="bdr-rom-btn ok" onclick="AtlasRomaneio.registrarNfe(${Number(p.id)})">✓ Registrar NF-e</button>`:""}<button class="bdr-rom-btn gray" onclick="AtlasRomaneio.fechar()">← Voltar</button></div>
      </div>`;
    }catch(e){ fundo.innerHTML=`<div class="bdr-rom" style="padding:30px"><h3>Não foi possível montar o Romaneio</h3><p>${esc(e?.message||e)}</p><button class="bdr-rom-btn gray" onclick="AtlasRomaneio.fechar()">Voltar</button></div>`; }
  }

  // Consultar a vinculação efetiva, sem confiar em obras_liberadas no navegador.
  // O vínculo é para CONSULTA/IMPRESSÃO, nunca autorização de recebimento ou fiscal.
  async function podeConsultarDocumentoObras(origemId,destinoId){
    const u=usuarioAtual();
    const uid=Number(u?.id||u?.usuario_id||0);
    if(!Number.isSafeInteger(uid)||uid<=0)return false;
    if(uid===1 && u?.owner_sistema===true)return true;
    const ids=[origemId,destinoId].map(Number).filter(n=>Number.isSafeInteger(n)&&n>0);
    if(!ids.length)return false;
    const {data,error}=await db().from('usuario_obras')
      .select('obra_id').eq('usuario_id',uid).in('obra_id',ids);
    if(error)throw new Error('Não foi possível validar as obras autorizadas para o romaneio.');
    return (data||[]).some(v=>ids.includes(Number(v.obra_id)));
  }

  // DOCUMENTO DE TRANSPORTE: RP e PED utilizam a mesma apresentação.
  // A análise fiscal existente continua na tela original de PED.
  let documentoAtual=null;
  let assinaturasAtivas=false;
  let assinaturasDocumento=[];
  let linkMotoristaGerado='';
  let assinaturaPerfil='';
  let pad=null;

  function aviso(mensagem){
    if(global.AtlasModal?.aviso){global.AtlasModal.aviso(mensagem);return;}
    alert(mensagem);
  }
  function formatoStatus(v){
    const t=upper(v);
    return ({EM_TRANSITO:'Em trânsito',RECEBIDO:'Recebido',CANCELADO:'Cancelado',RECUSADO:'Recusado',AGUARDANDO_NFE:'Aguardando NF-e'}[t]||texto(v)||'Em preparação');
  }
  function documentoUrl(doc){
    const u=new URL('./atlas.html',global.location.href);
    u.searchParams.set('m','expedicao');
    u.searchParams.set('acao',doc.tipo==='RP'?'romaneio-rp':'romaneio');
    u.searchParams.set(doc.tipo==='RP'?'remessa':'pedido',String(doc.id));
    return u.href;
  }
  function itemIdentificacao(p){
    const pares=[['Marca',p.marca],['Modelo',p.modelo],['Série',p.numero_serie||p.serie],['Chassi',p.chassi],['Placa',p.placa],['RENAVAM',p.renavam],['Insumo',p.codigo_insumo]];
    return pares.filter(([,v])=>texto(v)).map(([k,v])=>`${k}: ${texto(v)}`).join(' · ');
  }
  async function carregarDocumentoRP(id){
    const banco=db();
    if(!banco)throw new Error('Supabase indisponível.');
    const {data:rp,error}=await banco.from('atlas_patrimonio_remessas').select('*').eq('id',id).maybeSingle();
    if(error)throw error;
    if(!rp)throw new Error('Remessa patrimonial não encontrada.');
    if(!await podeConsultarDocumentoObras(rp.obra_origem_id,rp.obra_destino_id))
      throw new Error('Esta remessa não pertence ao seu escopo autorizado.');
    const {data:itens,error:erroItens}=await banco.from('atlas_patrimonio_remessa_itens').select('*').eq('remessa_id',id).order('id',{ascending:true});
    if(erroItens)throw erroItens;
    const [orig,dest]=await Promise.all([obra(rp.obra_origem_id),obra(rp.obra_destino_id)]);
    const [empOrig,empDest]=await Promise.all([empresa(orig?.empresa_id||rp.empresa_id),empresa(dest?.empresa_id||rp.empresa_id)]);
    const ids=[...new Set((itens||[]).map(i=>Number(i.patrimonio_id)).filter(n=>Number.isSafeInteger(n)&&n>0))];
    const pats=[];
    for(let n=0;n<ids.length;n+=100)pats.push(...await patrimonios(ids.slice(n,n+100)));
    const porId=new Map(pats.map(x=>[Number(x.id),x]));
    return {
      tipo:'RP',id,numero:rp.codigo||'RP-'+id,
      data:rp.enviado_em||rp.criado_em,status:rp.status||'EM_TRANSITO',
      origem:rp.obra_origem_nome||fmtObra(orig),destino:rp.obra_destino_nome||fmtObra(dest),
      empOrig,empDest,responsavel:rp.enviado_por_nome||'—',
      motorista:rp.motorista||rp.motorista_nome||'',transportadora:rp.transportadora||rp.veiculo||'',placa:rp.placa||rp.veiculo_placa||'',
      items:(itens||[]).map((i,index)=>{
        const x=porId.get(Number(i.patrimonio_id))||{};
        return {n:index+1,codigo:i.codigo_qr||x.codigo_qr||String(i.patrimonio_id),
          descricao:i.nome_bem||x.nome_bem||x.descricao||'Patrimônio',detalhes:itemIdentificacao(x),
          unidade:'UN',qtd:1,ncm:x.ncm||'',nf:x.numero_nfe||'',valor:x.valor_bem??x.valor_aquisicao??null};
      })
    };
  }
  async function carregarDocumentoPED(id){
    const p=await pedido(id);
    if(!await podeConsultarDocumentoObras(p.obra_origem_id,p.obra_destino_id||p.obra_id))
      throw new Error('Este pedido não pertence ao seu escopo autorizado.');
    const r=await obterRomaneio(id);
    const itensDocumento=[];
    for(const linha of r.linhas){
      // Cada patrimônio precisa ser identificável, sem ocultar um PAT dentro de um agrupamento.
      if(linha.patrimonios?.length){
        for(const pat of linha.patrimonios){
          itensDocumento.push({n:itensDocumento.length+1,codigo:pat,descricao:linha.descricao,detalhes:linha.codigo&&linha.codigo!==pat?'Referência: '+linha.codigo:'',qtd:1,unidade:'UN',ncm:linha.ncm,nf:linha.nf_entrada,valor:linha.valor_bdr});
        }
      }else{
        itensDocumento.push({n:itensDocumento.length+1,codigo:linha.codigo,descricao:linha.descricao,detalhes:linha.custo_direto&&linha.custo_direto!=='—'?linha.custo_direto:'',qtd:linha.qtd,unidade:linha.un,ncm:linha.ncm,nf:linha.nf_entrada,valor:linha.valor_bdr});
      }
    }
    return {
      tipo:'PED',id,numero:p.codigo||'PED-'+id,data:p.data_saida_cd||p.data_envio||p.data_finalizacao_separacao||p.data_criacao,
      status:p.status,origem:fmtObra(r.origem),destino:fmtObra(r.destino),empOrig:r.empresaOrigem,empDest:r.empresaDestino,
      responsavel:p.usuario_saida_cd||p.usuario_finalizacao_separacao||p.solicitante||p.usuario_criacao||'—',
      motorista:p.motorista_nome||'',transportadora:p.transportadora||'',placa:p.veiculo_placa||'',items:itensDocumento
    };
  }
  async function obterAssinaturas(doc){
    const {data,error}=await db().rpc('atlas_romaneio_assinaturas_listar',{p_tipo:doc.tipo,p_id:doc.id});
    if(error){
      assinaturasAtivas=false;
      assinaturasDocumento=[];
      console.info('Atlas Romaneio: assinaturas dependem da migração segura do Supabase:',error.message);
      return;
    }
    assinaturasAtivas=true;
    assinaturasDocumento=Array.isArray(data)?data:(data?.assinaturas||[]);
    const {data:perfil,error:erroPerfil}=await db().rpc('atlas_romaneio_assinatura_pessoal');
    assinaturaPerfil=erroPerfil?'':(typeof perfil==='string'?perfil:'');
  }
  function assinaturaDo(papel){ return assinaturasDocumento.find(x=>x.papel===papel&&x.valida===true)||null; }
  function assinaturaCard(papel,titulo,descricao){
    const a=assinaturaDo(papel);
    return `<article class="atlas-doc-sign-card ${a?'atlas-doc-assinado':''}">
      <div class="atlas-doc-sign-head"><div><strong>${esc(titulo)}</strong><small>${esc(descricao)}</small></div><span class="atlas-doc-sign-state ${a?'ok':''}">${a?'✓ Assinado':'◷ Pendente'}</span></div>
      <div class="atlas-doc-sign-content">${a?`<img class="atlas-doc-sign-img" src="${esc(a.assinatura_png)}" alt="Assinatura registrada de ${esc(a.nome)}">
      <strong>${esc(a.nome)}</strong><small>${dataHoraBR(a.assinado_em)} · Confirmação no Atlas</small>`:
      `<div class="atlas-doc-sign-empty">Aguardando assinatura</div><small>${papel==='SAIDA'?'O responsável pela saída confirma os bens entregues.':'O motorista confere e confirma a retirada.'}</small>`}</div>
      </article>`;
  }
  function assinaturaImpressao(papel,titulo){
    const a=assinaturaDo(papel);
    return `<div class="atlas-doc-print-sign"><div class="atlas-doc-print-sign-title">${esc(titulo)}</div>
      <div class="atlas-doc-print-sign-image">${a?`<img src="${esc(a.assinatura_png)}" alt="Assinatura">`:'<span>Assinatura pendente</span>'}</div>
      <div class="atlas-doc-print-sign-line"></div><b>${a?esc(a.nome):'—'}</b><small>${a?dataHoraBR(a.assinado_em):'Não assinado'}</small></div>`;
  }
  function docTabela(doc){
    return `<div class="atlas-doc-table-wrap"><table class="atlas-doc-table"><thead><tr><th>Item</th><th>Patrimônio</th><th>Descrição / identificação</th><th>Qtd.</th><th>Un.</th><th>Referências</th><th>Valor patrimonial</th></tr></thead><tbody>
    ${doc.items.map(l=>`<tr><td class="atlas-doc-td-num">${l.n}</td><td class="atlas-doc-code">${esc(l.codigo)}</td>
    <td><b>${esc(l.descricao)}</b>${l.detalhes?`<small>${esc(l.detalhes)}</small>`:''}</td><td class="atlas-doc-td-num">${esc(l.qtd)}</td>
    <td>${esc(l.unidade||'UN')}</td><td><small>NCM: ${esc(l.ncm)||'A conferir'}<br>NF de entrada: ${esc(l.nf)||'—'}</small></td>
    <td class="atlas-doc-price">${l.valor==null||l.valor===''?'A conferir':dinheiro(l.valor)}</td></tr>`).join('')||'<tr><td colspan="7">Nenhum patrimônio encontrado</td></tr>'}</tbody></table></div>`;
  }
  function cabecalhoDocumento(doc){
    return `<header class="atlas-doc-brandbar"><div class="atlas-doc-mark"><strong>BDR</strong><span>Atlas<small>Gestão Patrimonial</small></span></div>
       <div class="atlas-doc-name"><b>ROMANEIO PATRIMONIAL</b><small>Documento de transferência</small></div></header>
       <div class="atlas-doc-stats"><div><small>Remessa</small><b>${esc(doc.numero)}</b></div><div><small>Data / Hora</small><b>${dataHoraBR(doc.data)}</b></div>
       <div><small>Situação</small><b>${esc(formatoStatus(doc.status))}</b></div></div>
       <div class="atlas-doc-partes"><section><h3>↗ Origem</h3><p><b>Empresa:</b> ${esc(doc.empOrig?.nome)||'—'}</p><p><b>Obra:</b> ${esc(doc.origem)}</p><p><b>CNPJ:</b> ${esc(doc.empOrig?.cnpj)||'—'}</p></section>
       <section><h3>⌖ Destino</h3><p><b>Empresa:</b> ${esc(doc.empDest?.nome)||'—'}</p><p><b>Obra:</b> ${esc(doc.destino)}</p><p><b>CNPJ:</b> ${esc(doc.empDest?.cnpj)||'—'}</p></section></div>
       <div class="atlas-doc-transport"><div><small>Responsável pela saída</small><b>${esc(doc.responsavel)}</b></div>
       <div><small>Transporte</small><b>${esc(doc.motorista)||'Motorista não informado'}</b><small>${esc([doc.transportadora,doc.placa&&'Placa: '+doc.placa].filter(Boolean).join(' · '))||'—'}</small></div>
       <div><small>Tipo de transferência</small><b>Patrimonial</b></div></div>`;
  }
  function numeroItens(doc){return doc.items.reduce((n,x)=>n+num(x.qtd),0);}
  function docImpressao(doc){
    return `<div class="atlas-doc-printable">${cabecalhoDocumento(doc)}${docTabela(doc)}
      <div class="atlas-doc-total"><b>Total de patrimônios: ${numeroItens(doc).toLocaleString('pt-BR')}</b></div>
      <div class="atlas-doc-print-signatures"><h3>Assinaturas da transferência</h3><div class="atlas-doc-print-sign-grid">${assinaturaImpressao('SAIDA','Responsável pela saída')}${assinaturaImpressao('MOTORISTA','Motorista / transportador')}</div></div>
      <footer class="atlas-doc-print-footer"><div class="atlas-doc-qr-place"><img id="atlasDocQr" alt="QR Code para consultar o documento no Atlas" style="display:none"><div><b>Consulta do documento</b><small>Escaneie para abrir a remessa no Atlas. É necessário ter acesso à obra.</small></div></div>
      <div><b>${esc(doc.numero)}</b><small>Atlas · Gestão Patrimonial</small><small>Documento operacional. Não substitui documento fiscal quando exigido.</small></div></footer>
    </div>`;
  }
  function docAssinaturas(doc){
    const a=assinaturaDo('SAIDA'),m=assinaturaDo('MOTORISTA');
    return `<div class="atlas-doc-sign-area"><div class="atlas-doc-sign-title"><h2>✎ Assinaturas da transferência</h2><span>${Number(Boolean(a))+Number(Boolean(m))} de 2 assinaturas</span></div>
    <div class="atlas-doc-sign-grid">${assinaturaCard('SAIDA','Responsável pela saída','Confirma os bens entregues ao transporte.')}
      ${assinaturaCard('MOTORISTA','Motorista','Confirma a retirada dos patrimônios.')}</div>
    <div class="atlas-doc-sign-buttons">
      ${!a?`<button class="atlas-doc-button main" onclick="AtlasRomaneio.assinarSaida()" ${!assinaturasAtivas?'disabled title="Aguardando configuração segura no Supabase"':''}>✎ Assinar saída no Atlas</button>`:''}
      ${!a&&assinaturaPerfil?`<button class="atlas-doc-button" onclick="AtlasRomaneio.usarAssinaturaPessoal()">✓ Usar minha assinatura salva</button>`:''}
      ${!m?`<button class="atlas-doc-button main" onclick="AtlasRomaneio.criarLinkMotorista()" ${!assinaturasAtivas?'disabled title="Aguardando configuração segura no Supabase"':''}>▦ Gerar QR / link para o motorista</button>`:''}
      <button class="atlas-doc-button" onclick="AtlasRomaneio.atualizarAssinaturas()">↻ Atualizar assinaturas</button>
    </div>
    ${!assinaturasAtivas?'<div class="atlas-doc-warning">Assinatura eletrônica indisponível: é necessário instalar e validar a migração segura do Supabase. O documento permanece imprimível, com assinaturas pendentes claramente identificadas.</div>':''}
    <div id="atlasDocMotoristaLink" class="atlas-doc-driver-link" ${linkMotoristaGerado?'':'hidden'}>${linkMotoristaGerado?`<p>O motorista abre o link no próprio celular, confere os itens e assina:</p><a href="${esc(linkMotoristaGerado)}" rel="noopener noreferrer" target="_blank">Abrir página de assinatura</a><button class="atlas-doc-button" onclick="AtlasRomaneio.copiarLink()">Copiar link</button><img id="atlasDocQrMotorista" alt="QR Code para assinatura do motorista"><small>Link de uso único, com validade limitada.</small>`:''}</div>
    <div class="atlas-doc-sign-note">O destino confirma o recebimento exclusivamente em <b>Expedição → A receber</b>, sem assinar o romaneio. A análise e os documentos fiscais permanecem no fluxo interno do Atlas.</div></div>`;
  }
  async function garantirQR(){
    if(global.AtlasQRCode?.gerarDataURL)return;
    for(const src of ['./JS/atlasQRCode/qrcode.min.js','./JS/atlasQRCode.js']){
      if(src.endsWith('qrcode.min.js')&&global.AtlasQRCodeCore)continue;
      if(src.endsWith('atlasQRCode.js')&&global.AtlasQRCode)continue;
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src=src;
        let concluido=false;
        const timer=setTimeout(()=>{if(!concluido){concluido=true;script.remove();reject(new Error('Tempo esgotado ao carregar QR Code local.'));}},5000);
        script.onload=()=>{if(!concluido){concluido=true;clearTimeout(timer);resolve();}};
        script.onerror=()=>{if(!concluido){concluido=true;clearTimeout(timer);reject(new Error('Falha ao carregar QR Code local.'));}};
        document.head.appendChild(script);
      });
    }
  }
  async function desenharQRCode(doc){
    try{await garantirQR();const img=document.getElementById('atlasDocQr');if(img){img.src=global.AtlasQRCode.gerarDataURL(documentoUrl(doc),{tamanho:112});img.style.display='block';}}
    catch(e){console.warn('Romaneio: QR Code indisponível',e);}
    if(linkMotoristaGerado){
      const img=document.getElementById('atlasDocQrMotorista');
      if(img&&global.AtlasQRCode){img.src=global.AtlasQRCode.gerarDataURL(linkMotoristaGerado,{tamanho:148});}
    }
  }
  function abaDocumento(nome){
    const doc=document.getElementById('bdrRomaneioFiscal');if(!doc)return;
    doc.querySelectorAll('[data-atlas-doc-tab]').forEach(b=>b.classList.toggle('active',b.dataset.atlasDocTab===nome));
    doc.querySelectorAll('[data-atlas-doc-panel]').forEach(b=>b.hidden=b.dataset.atlasDocPanel!==nome);
  }
  async function atualizarAssinaturas(){
    if(!documentoAtual)return;
    await obterAssinaturas(documentoAtual);
    const sec=document.querySelector('#bdrRomaneioFiscal [data-atlas-doc-panel="assinaturas"]');
    if(sec)sec.innerHTML=docAssinaturas(documentoAtual);
    const aba=document.querySelector('#bdrRomaneioFiscal [data-atlas-doc-tab="assinaturas"]');
    if(aba)aba.textContent='Assinaturas ('+assinaturasDocumento.filter(x=>x.valida).length+'/2)';
    const print=document.querySelector('#bdrRomaneioFiscal .atlas-doc-printable');
    if(print)print.outerHTML=docImpressao(documentoAtual);
    await desenharQRCode(documentoAtual);
  }
  async function abrirDocumento(tipo,id){
    id=Number(id);if(!Number.isSafeInteger(id)||id<=0)throw new Error('Número de remessa inválido.');
    const doc=tipo==='RP'?await carregarDocumentoRP(id):await carregarDocumentoPED(id);
    documentoAtual=doc;linkMotoristaGerado='';
    await obterAssinaturas(doc);
    estilos();
    document.getElementById('bdrRomaneioFiscal')?.remove();
    const fundo=document.createElement('div');fundo.id='bdrRomaneioFiscal';fundo.className='bdr-rom-bg atlas-doc-backdrop';
    fundo.innerHTML=`<div class="atlas-doc-shell"><header class="atlas-doc-toolbar"><div><h1>Romaneio Patrimonial</h1><small>Documento de transferência · ${esc(doc.numero)}</small></div>
       <div class="atlas-doc-toolbar-actions"><button class="atlas-doc-button" onclick="AtlasRomaneio.imprimir()">▣ Imprimir / salvar PDF</button>
       <button class="atlas-doc-button" onclick="AtlasRomaneio.copiarDocumento()">↗ Copiar link</button><button class="atlas-doc-button atlas-doc-close" onclick="AtlasRomaneio.fechar()" aria-label="Fechar">×</button></div></header>
       <div class="atlas-doc-subtabs"><button class="active" data-atlas-doc-tab="documento" onclick="AtlasRomaneio.abaDocumento('documento')">Documento A4</button><button data-atlas-doc-tab="assinaturas" onclick="AtlasRomaneio.abaDocumento('assinaturas')">Assinaturas (${assinaturasDocumento.filter(x=>x.valida).length}/2)</button></div>
       <main class="atlas-doc-content"><section data-atlas-doc-panel="documento">${docImpressao(doc)}</section>
       <section data-atlas-doc-panel="assinaturas" hidden>${docAssinaturas(doc)}</section></main></div>`;
    document.body.appendChild(fundo);
    await desenharQRCode(doc);
  }
  async function abrirRemessa(id){return abrirDocumento('RP',id);}
  async function abrirDocumentoPedido(id){return abrirDocumento('PED',id);}
  function copiarDocumento(){
    if(!documentoAtual)return;
    const url=documentoUrl(documentoAtual);
    navigator.clipboard?.writeText(url).then(()=>aviso('Link do documento copiado.')).catch(()=>global.prompt('Copie o link:',url));
  }
  async function copiarLink(){
    if(!linkMotoristaGerado)return;
    try{await navigator.clipboard.writeText(linkMotoristaGerado);aviso('Link seguro copiado.');}
    catch(_){global.prompt('Copie o link:',linkMotoristaGerado);}
  }
  async function criarLinkMotorista(){
    if(!documentoAtual||!assinaturasAtivas)return;
    if(global.location.protocol!=='https:' || ['localhost','127.0.0.1'].includes(global.location.hostname)){
      aviso('Para o motorista assinar pelo celular, publique primeiro a página no DEV HTTPS. Um link localhost não funciona em outro aparelho.');
      return;
    }
    try{
      const {data,error}=await db().rpc('atlas_romaneio_criar_link_motorista',{p_tipo:documentoAtual.tipo,p_id:documentoAtual.id});
      if(error)throw error;
      if(!data||typeof data!=='string')throw new Error('O servidor não retornou um token válido.');
      const url=new URL('./assinatura-romaneio.html',global.location.href);
      url.searchParams.set('token',data);
      linkMotoristaGerado=url.href;
      const sec=document.querySelector('[data-atlas-doc-panel="assinaturas"]');
      if(sec)sec.innerHTML=docAssinaturas(documentoAtual);
      await desenharQRCode(documentoAtual);
    }catch(e){aviso('Não foi possível gerar o link seguro: '+(e.message||e));}
  }
  function assinaturaModal(nome,papel){
    const existente=document.getElementById('atlasDocPadOverlay');if(existente)existente.remove();
    const overlay=document.createElement('div');overlay.id='atlasDocPadOverlay';overlay.className='atlas-doc-pad-overlay';
    overlay.innerHTML=`<div class="atlas-doc-pad-box"><h2>Assinatura do responsável pela saída</h2><p>${esc(nome)} — confira o romaneio antes de assinar.</p>
      <canvas id="atlasDocPad" width="780" height="230" aria-label="Área para desenhar a assinatura"></canvas>
      <div class="atlas-doc-pad-buttons"><button class="atlas-doc-button" onclick="AtlasRomaneio.limparAssinatura()">Limpar</button>
      <button class="atlas-doc-button" onclick="AtlasRomaneio.fecharAssinatura()">Cancelar</button>
      <button class="atlas-doc-button main" onclick="AtlasRomaneio.salvarAssinatura()">Confirmar e assinar esta remessa</button></div></div>`;
    document.body.appendChild(overlay);
    const c=overlay.querySelector('canvas'),ctx=c.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle='#0b2854';ctx.lineWidth=3.4;ctx.lineCap='round';ctx.lineJoin='round';
    pad={c,ctx,ativo:false,desenhou:false,papel};
    const ponto=e=>{const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height};};
    c.addEventListener('pointerdown',e=>{c.setPointerCapture(e.pointerId);pad.ativo=true;pad.desenhou=true;const pt=ponto(e);ctx.beginPath();ctx.moveTo(pt.x,pt.y);ctx.lineTo(pt.x+.2,pt.y+.2);ctx.stroke();});
    c.addEventListener('pointermove',e=>{if(!pad?.ativo)return;const pt=ponto(e);ctx.lineTo(pt.x,pt.y);ctx.stroke();});
    ['pointerup','pointercancel'].forEach(tipo=>c.addEventListener(tipo,()=>{if(pad)pad.ativo=false;}));
  }
  function limparAssinatura(){if(pad){pad.ctx.fillStyle='#fff';pad.ctx.fillRect(0,0,pad.c.width,pad.c.height);pad.desenhou=false;}}
  function fecharAssinatura(){document.getElementById('atlasDocPadOverlay')?.remove();pad=null;}
  function assinarSaida(){
    if(!documentoAtual||!assinaturasAtivas)return;
    assinaturaModal(usuarioAtual()?.nome||'Responsável pela saída','SAIDA');
  }
  async function usarAssinaturaPessoal(){
    if(!assinaturaPerfil||!documentoAtual||!assinaturasAtivas)return;
    if(!global.confirm('Confirma que conferiu os itens e autoriza sua assinatura cadastrada neste romaneio?'))return;
    try{
      const {error}=await db().rpc('atlas_romaneio_assinar_saida',{p_tipo:documentoAtual.tipo,p_id:documentoAtual.id,p_png:null});
      if(error)throw error;
      await atualizarAssinaturas();
      aviso('Confirmação autenticada registrada para esta remessa.');
    }catch(e){aviso('Não foi possível registrar a assinatura: '+(e.message||e));}
  }
  async function salvarAssinatura(){
    if(!documentoAtual||!pad?.desenhou){aviso('Desenhe sua assinatura antes de confirmar.');return;}
    const png=pad.c.toDataURL('image/png');
    const botoes=document.querySelectorAll('#atlasDocPadOverlay button');
    botoes.forEach(x=>x.disabled=true);
    try{
      const {error}=await db().rpc('atlas_romaneio_assinar_saida',{p_tipo:documentoAtual.tipo,p_id:documentoAtual.id,p_png:png});
      if(error)throw error;
      fecharAssinatura();
      await atualizarAssinaturas();
      aviso('Assinatura registrada para esta remessa.');
    }catch(e){aviso('Assinatura não registrada: '+(e.message||e));}
    finally{botoes.forEach(x=>x.disabled=false);}
  }

  function fechar(){ document.getElementById("bdrRomaneioFiscal")?.remove(); }
  function imprimir(){
    const origem=document.querySelector("#bdrRomaneioFiscal .atlas-doc-printable") || document.querySelector("#bdrRomaneioFiscal .bdr-rom");
    if(!origem) return;

    const copia=origem.cloneNode(true);
    copia.querySelectorAll(".bdr-rom-actions").forEach(el=>el.remove());
    // A escolha 70%/100% é decisão operacional do fiscal e fica auditada no banco.
    // Na impressão, a tabela já demonstra os dois valores e o total aplicado;
    // portanto o seletor não faz parte do documento impresso.
    copia.querySelectorAll(".bdr-rom-valor").forEach(el=>el.remove());
    // Pendências são orientação operacional do fiscal e não fazem parte do documento impresso.
    copia.querySelectorAll(".bdr-rom-alert").forEach(el=>el.remove());

    const iframe=document.createElement("iframe");
    iframe.setAttribute("aria-hidden","true");
    iframe.style.position="fixed";
    iframe.style.right="0";
    iframe.style.bottom="0";
    iframe.style.width="0";
    iframe.style.height="0";
    iframe.style.border="0";
    document.body.appendChild(iframe);

    const doc=iframe.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Romaneio Fiscal</title>
      <style>
        @page{size:A4 portrait;margin:11mm}
        *{box-sizing:border-box} body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#102a4c;background:#fff}
        .bdr-rom{width:100%;max-width:none;background:#fff;color:#102a4c}
        .bdr-rom-top{padding:0 0 12px;display:flex;gap:18px;align-items:center;justify-content:space-between;border-bottom:1px solid #dbe5ef}
        .bdr-rom-brand{font-size:35px;font-weight:1000;margin-left:8px}.bdr-rom-title{text-align:center;flex:1}.bdr-rom-title h2{margin:0;font-size:22px}.bdr-rom-title small{font-size:11px;color:#64748b;font-weight:800}.bdr-rom-status{background:#dcfce7;color:#15803d;padding:8px 10px;border-radius:8px;font-weight:900;font-size:11px}
        .bdr-rom-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:8px 0}.bdr-rom-kpi,.bdr-rom-card{border:1px solid #dce6f0;border-radius:8px;padding:9px;background:#fff;font-size:10px}.bdr-rom-kpi b{display:block;font-size:13px;margin-top:3px}
        .bdr-rom-partes{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 0 8px}.bdr-rom-card h3{margin:0 0 6px;font-size:12px}.bdr-rom-card p{margin:3px 0}
        .bdr-rom-table-wrap{padding:0;overflow:visible}.bdr-rom-table{width:100%;border-collapse:collapse;table-layout:auto}.bdr-rom-table th{background:#123d70!important;color:#fff!important;padding:6px 4px;font-size:9px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.bdr-rom-table td{border:1px solid #dce6f0;padding:5px 4px;font-size:9px;overflow-wrap:anywhere}.bdr-rom-table td.num{text-align:right}.bdr-rom-table td small{display:block;font-size:7px;color:#64748b;margin-top:2px;overflow-wrap:anywhere}.bdr-rom-table td:nth-child(3){width:30%}.bdr-rom-table td:nth-child(2){width:19%}.bdr-rom-grid[style]{grid-template-columns:repeat(2,minmax(0,1fr))!important}.bdr-rom-kpi{break-inside:avoid}.bdr-rom-table tr{break-inside:avoid}.bdr-rom-table thead{display:table-header-group}.bdr-rom-table td small{display:block;font-size:9px;font-weight:600;line-height:1.35;color:#64748b;margin-top:3px;overflow-wrap:anywhere}.bdr-rom-table td{overflow-wrap:anywhere}.bdr-rom-table td:nth-child(3){width:31%}.bdr-rom-table td:nth-child(2){width:19%}
        .bdr-rom-total{margin:10px 0 0 auto;width:max-content;background:#eef6ff!important;border:1px solid #bfdbfe;border-radius:8px;padding:9px 12px;font-weight:1000;font-size:15px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.bdr-rom-alert{margin:10px 0;background:#fff8e7!important;border:1px solid #fde3a7;padding:8px 10px;border-radius:8px;color:#8a5a00;font-size:9px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .bdr-rom-actions,.bdr-export-menu{display:none!important}

        .atlas-doc-printable{width:100%;padding:0;background:#fff;color:#14345e;font-family:Arial,Helvetica,sans-serif;font-size:10px}
        .atlas-doc-brandbar{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #14549a;padding-bottom:10px;margin-bottom:11px}.atlas-doc-mark{display:flex;align-items:center;gap:8px}.atlas-doc-mark strong{font-size:28px}.atlas-doc-mark span{font-size:18px;font-weight:800;border-left:1px solid #14549a;padding-left:8px}.atlas-doc-mark span small{display:block;font-size:9px;font-weight:400}.atlas-doc-name{text-align:right}.atlas-doc-name b{display:block;font-size:18px}.atlas-doc-name small{color:#60758d;font-size:10px}
        .atlas-doc-stats{border:1px solid #cfdded;border-radius:6px;display:grid;grid-template-columns:repeat(3,1fr);margin:9px 0}.atlas-doc-stats>div{padding:8px 10px}.atlas-doc-stats>div+div{border-left:1px solid #cbd8e6}.atlas-doc-stats small,.atlas-doc-transport small{display:block;color:#61748a;font-size:9px}.atlas-doc-stats b{display:block;font-size:11px;margin-top:4px;overflow-wrap:anywhere}
        .atlas-doc-partes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:9px}.atlas-doc-partes section{border:1px solid #c9d9ed;border-radius:6px;overflow:hidden}.atlas-doc-partes h3{background:#e8f2ff!important;color:#17497e;padding:7px 8px;margin:0;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.atlas-doc-partes p{margin:4px 8px;font-size:9px;overflow-wrap:anywhere}.atlas-doc-transport{display:grid;grid-template-columns:1fr 1.5fr .85fr;border:1px solid #c9d9ed;border-radius:6px;margin-bottom:13px}.atlas-doc-transport>div{padding:8px}.atlas-doc-transport>div+div{border-left:1px solid #d3e0ec}.atlas-doc-transport b{display:block;font-size:10px;overflow-wrap:anywhere}
        .atlas-doc-table{width:100%;border-collapse:collapse;table-layout:fixed}.atlas-doc-table th{background:#123d70!important;color:white!important;font-size:8.5px;padding:6px 4px;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact}.atlas-doc-table td{font-size:8.5px;padding:5px 4px;border:1px solid #d7e2ef;vertical-align:top;overflow-wrap:anywhere}.atlas-doc-table th:nth-child(1){width:6%}.atlas-doc-table th:nth-child(2){width:18%}.atlas-doc-table th:nth-child(3){width:32%}.atlas-doc-table th:nth-child(4){width:7%}.atlas-doc-table th:nth-child(5){width:6%}.atlas-doc-table th:nth-child(6){width:18%}.atlas-doc-table th:nth-child(7){width:13%}.atlas-doc-table td small{display:block;font-size:8px;color:#556d86;margin-top:3px}.atlas-doc-table thead{display:table-header-group}.atlas-doc-table tr{break-inside:avoid}.atlas-doc-td-num{text-align:center}.atlas-doc-code{font-weight:800}.atlas-doc-price{text-align:right}
        .atlas-doc-total{text-align:right;margin:9px 0 14px;font-size:10px}.atlas-doc-total b{display:inline-block;padding:6px 8px;background:#ecf5ff!important;border-radius:5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .atlas-doc-print-signatures{border-top:1.5px solid #14549a;padding-top:10px;margin-top:12px;break-inside:avoid}.atlas-doc-print-signatures h3{font-size:12px;margin:0 0 10px}.atlas-doc-print-sign-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.atlas-doc-print-sign{border:1px solid #c9d9ec;border-radius:6px;text-align:center;break-inside:avoid;padding:0 9px 10px}.atlas-doc-print-sign-title{background:#e8f2ff!important;text-align:left;font-weight:800;padding:7px 9px;margin:0 -9px 6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.atlas-doc-print-sign-image{height:54px;display:flex;align-items:center;justify-content:center}.atlas-doc-print-sign-image img{max-height:54px;max-width:100%}.atlas-doc-print-sign-image span{font-size:9px;color:#7d8da2;font-style:italic}.atlas-doc-print-sign-line{border-top:1px solid #7d94aa;margin:0 18px 4px}.atlas-doc-print-sign b,.atlas-doc-print-sign small{display:block;margin:4px 0}.atlas-doc-print-sign small{color:#64788f}
        .atlas-doc-print-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1.5px solid #14549a;padding-top:10px;margin-top:13px;break-inside:avoid}.atlas-doc-print-footer>div{flex:1}.atlas-doc-qr-place{display:flex;align-items:center;gap:10px}.atlas-doc-qr-place img{width:60px;height:60px}.atlas-doc-print-footer small{display:block;color:#64788f;margin-top:4px;font-size:8px}
        @page{size:A4 portrait;margin:10mm}
      </style></head><body>${copia.outerHTML}</body></html>`);
    doc.close();

    iframe.onload=()=>{
      setTimeout(()=>{
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(()=>iframe.remove(),1000);
      },80);
    };
  }
  async function selecionarValor(percentual){
    const r=global.__bdrRomaneioAtual; if(!r) return;
    percentual=Number(percentual)===100?100:70;
    const total=r.linhas.reduce((s,l)=>s+l.qtd*(percentual===100?l.valor_bdr:l.valor_romaneio),0);
    const u=usuarioAtual();
    const payload={percentual_valor_romaneio:percentual,valor_total_romaneio:Math.round((total+Number.EPSILON)*100)/100,usuario_decisao_valor_id:Number(u?.id)||null,data_decisao_valor:new Date().toISOString()};
    const {error}=await db().from("pedidos_retirada").update(payload).eq("id",r.pedido.id);
    if(error){ global.AtlasModal?.erro?.("Não foi possível salvar a escolha do valor: "+error.message) || alert("Não foi possível salvar a escolha do valor: "+error.message); return; }
    if(r.snapshot?.id && !r.snapshot.fechado_em){
      const {error:erroRom}=await db().from("romaneios").update({percentual_valor:percentual,valor_total:payload.valor_total_romaneio,updated_at:new Date().toISOString()}).eq("id",r.snapshot.id);
      if(erroRom){ global.AtlasModal?.erro?.("Valor salvo no pedido, mas não foi possível atualizar o Romaneio: "+erroRom.message) || alert(erroRom.message); return; }
    }
    await abrir(r.pedido.id);
  }

  function toggleExportar(ev){ ev?.stopPropagation?.(); const m=document.getElementById("bdrExportMenu"); if(m) m.classList.toggle("ativo"); }
  function baixar(conteudo,nome,tipo){ const blob=new Blob(["\ufeff",conteudo],{type:tipo}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=nome; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
  function exportarExcel(){ const r=global.__bdrRomaneioAtual; if(!r)return; const tabela=tabelaHTML(r).replace(/<div[^>]*>.*?<\/div>/gs,""); baixar(`<html><head><meta charset="utf-8"></head><body><h2>BDR - Romaneio Fiscal de Saída ${esc(r.pedido.id)}</h2>${tabela}<p><b>Total: ${dinheiro(r.total)}</b></p></body></html>`,`Romaneio-${r.pedido.id}.xls`,`application/vnd.ms-excel`); }
  function exportarWord(){ const r=global.__bdrRomaneioAtual; if(!r)return; baixar(`<html><head><meta charset="utf-8"><style>table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px}th{background:#eee}</style></head><body><h1>BDR</h1><h2>Romaneio Fiscal de Saída ${esc(r.pedido.id)}</h2><p><b>Pedido:</b> ${esc(r.pedido.codigo||r.pedido.id)}<br><b>Origem:</b> ${esc(fmtObra(r.origem))}<br><b>Destino:</b> ${esc(fmtObra(r.destino))}<br><b>Placa:</b> ${esc(r.pedido.veiculo_placa)||"—"}<br><b>Motorista:</b> ${esc(r.pedido.motorista_nome)||"—"}</p>${tabelaHTML(r)}<h3>Total: ${dinheiro(r.total)}</h3></body></html>`,`Romaneio-${r.pedido.id}.doc`,`application/msword`); }


  function abrirTransporte(){
    const r=global.__bdrRomaneioAtual; if(!r) return;
    const p=r.pedido;
    document.getElementById("bdrRomTransporte")?.remove();
    const box=document.createElement("div"); box.id="bdrRomTransporte";
    box.style.cssText="position:fixed;inset:0;z-index:2147483647;background:#0f172a88;display:grid;place-items:center;padding:20px";
    box.innerHTML=`<div style="width:min(560px,100%);background:#fff;border-radius:16px;padding:22px;color:#102a4c;box-shadow:0 24px 60px #0004"><h2 style="margin:0 0 6px">🚚 Dados do transporte</h2><p style="margin:0 0 18px;color:#64748b">Preencha antes da emissão da NF-e. Estes dados passam a fazer parte do Romaneio.</p><label style="font-weight:800">Transportadora</label><input id="bdrRtTransp" value="${esc(p.transportadora)}" style="width:100%;padding:11px;margin:5px 0 12px;border:1px solid #cbd5e1;border-radius:8px"><label style="font-weight:800">Placa</label><input id="bdrRtPlaca" value="${esc(p.veiculo_placa)}" style="width:100%;padding:11px;margin:5px 0 12px;border:1px solid #cbd5e1;border-radius:8px;text-transform:uppercase"><label style="font-weight:800">Motorista</label><input id="bdrRtMotorista" value="${esc(p.motorista_nome)}" style="width:100%;padding:11px;margin:5px 0 18px;border:1px solid #cbd5e1;border-radius:8px"><div style="display:flex;gap:10px;justify-content:flex-end"><button class="bdr-rom-btn gray" onclick="document.getElementById('bdrRomTransporte').remove()">Cancelar</button><button class="bdr-rom-btn primary" onclick="AtlasRomaneio.salvarTransporte()">Salvar transporte</button></div></div>`;
    document.body.appendChild(box);
  }

  async function salvarTransporte(){
    const r=global.__bdrRomaneioAtual; if(!r) return;
    const transportadora=texto(document.getElementById("bdrRtTransp")?.value);
    const placa=upper(document.getElementById("bdrRtPlaca")?.value);
    const motorista=texto(document.getElementById("bdrRtMotorista")?.value);
    if(!transportadora || !placa || !motorista){ global.AtlasModal?.erro?.("Informe transportadora, placa e motorista.") || alert("Informe transportadora, placa e motorista."); return; }
    const {error}=await db().from("pedidos_retirada").update({transportadora,veiculo_placa:placa,motorista_nome:motorista}).eq("id",r.pedido.id);
    if(error){ global.AtlasModal?.erro?.(error.message) || alert(error.message); return; }
    if(r.snapshot?.id && !r.snapshot.fechado_em){
      const {error:erroRom}=await db().from("romaneios").update({transportadora,placa,motorista,updated_at:new Date().toISOString()}).eq("id",r.snapshot.id);
      if(erroRom){ global.AtlasModal?.erro?.(erroRom.message) || alert(erroRom.message); return; }
    }
    document.getElementById("bdrRomTransporte")?.remove();
    await abrir(r.pedido.id);
  }

  function fecharModalNfe(){ document.getElementById("bdrRomNfe")?.remove(); }

  function abrirModalNfe(pedidoId){
    const r=global.__bdrRomaneioAtual;
    if(r && (!texto(r.pedido.transportadora) || !texto(r.pedido.veiculo_placa) || !texto(r.pedido.motorista_nome))){
      global.AtlasModal?.erro?.("Preencha Transportadora, Placa e Motorista antes de registrar a NF-e.") || alert("Preencha Transportadora, Placa e Motorista antes de registrar a NF-e.");
      abrirTransporte(); return;
    }
    if(!global.AtlasFiscal?.registrarNfe){ global.AtlasModal?.erro?.("Módulo fiscal não carregado.") || alert("Módulo fiscal não carregado."); return; }
    document.getElementById("bdrRomNfe")?.remove();
    const box=document.createElement("div"); box.id="bdrRomNfe";
    box.style.cssText="position:fixed;inset:0;z-index:2147483647;background:#0f172a88;display:grid;place-items:center;padding:20px";
    const codigo=esc(r?.pedido?.codigo||("PED-"+pedidoId));
    box.innerHTML=`<div style="width:min(620px,100%);background:#fff;border-radius:16px;padding:24px;color:#102a4c;box-shadow:0 24px 60px #0004">
      <h2 style="margin:0 0 6px">🧾 Registrar NF-e</h2>
      <p style="margin:0 0 18px;color:#64748b">ROM ${Number(pedidoId)} • ${codigo} • Total ${dinheiro(r?.total||0)}</p>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px">
        <div><label style="font-weight:800">Número da NF-e</label><input id="bdrNfeNumero" autocomplete="off" inputmode="numeric" style="width:100%;padding:11px;margin-top:5px;border:1px solid #cbd5e1;border-radius:8px"></div>
        <div><label style="font-weight:800">Série</label><input id="bdrNfeSerie" value="1" autocomplete="off" inputmode="numeric" style="width:100%;padding:11px;margin-top:5px;border:1px solid #cbd5e1;border-radius:8px"></div>
      </div>
      <label style="display:block;font-weight:800;margin-top:14px">Chave de acesso</label>
      <input id="bdrNfeChave" autocomplete="off" inputmode="numeric" maxlength="54" placeholder="44 dígitos (opcional por enquanto)" style="width:100%;padding:11px;margin-top:5px;border:1px solid #cbd5e1;border-radius:8px">
      <div id="bdrNfeErro" style="display:none;margin-top:12px;padding:10px 12px;border-radius:8px;background:#fff1f2;color:#b91c1c;font-weight:700"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px"><button class="bdr-rom-btn gray" onclick="AtlasRomaneio.fecharModalNfe()">Cancelar</button><button class="bdr-rom-btn ok" id="bdrNfeSalvar" onclick="AtlasRomaneio.confirmarNfe(${Number(pedidoId)})">✓ Registrar NF-e</button></div>
    </div>`;
    box.addEventListener("click",e=>{ if(e.target===box) fecharModalNfe(); });
    document.body.appendChild(box);
    setTimeout(()=>document.getElementById("bdrNfeNumero")?.focus(),0);
  }

  async function confirmarNfe(pedidoId){
    const r=global.__bdrRomaneioAtual;
    const numero=texto(document.getElementById("bdrNfeNumero")?.value);
    const serie=texto(document.getElementById("bdrNfeSerie")?.value);
    const chave=texto(document.getElementById("bdrNfeChave")?.value).replace(/\D/g,"");
    const erro=document.getElementById("bdrNfeErro");
    const mostrarErro=(msg)=>{ if(erro){erro.textContent=msg;erro.style.display="block";} };
    if(!numero){ mostrarErro("Informe o número da NF-e."); document.getElementById("bdrNfeNumero")?.focus(); return; }
    if(!serie){ mostrarErro("Informe a série da NF-e."); document.getElementById("bdrNfeSerie")?.focus(); return; }
    if(chave && chave.length!==44){ mostrarErro("A chave de acesso deve conter 44 dígitos."); document.getElementById("bdrNfeChave")?.focus(); return; }
    const botao=document.getElementById("bdrNfeSalvar");
    if(botao){botao.disabled=true;botao.textContent="Registrando...";}
    try{
      await global.AtlasFiscal.registrarNfe(pedidoId,{numero_nfe:numero,serie_nfe:serie,chave_nfe:chave});
      if(r?.snapshot?.id && !r.snapshot.fechado_em){
        const agora=new Date().toISOString();
        const {error:erroRom}=await db().from("romaneios").update({numero_nfe:numero,serie_nfe:serie,chave_nfe:chave||null,status:"LIBERADO",updated_at:agora}).eq("id",r.snapshot.id);
        if(erroRom) throw erroRom;
      }
      fecharModalNfe();
      global.AtlasModal?.sucesso?.("NF-e registrada. Romaneio liberado para retirada.");
      await abrir(pedidoId);
      global.carregarTudo?.();
    }catch(e){
      mostrarErro(e?.message||String(e));
      if(botao){botao.disabled=false;botao.textContent="✓ Registrar NF-e";}
    }
  }

  function registrarNfe(pedidoId){ abrirModalNfe(pedidoId); }

  async function usuariosFiscais(){
    const banco=db();
    const {data:us,error}=await banco
      .from("usuarios_sistema")
      .select("id,nome,usuario,email,empresa_id,obra_id,perfil,cargo,ativo,permissoes")
      .eq("ativo",true);
    if(error) throw error;

    // Fiscal é uma responsabilidade explícita. Não usamos ADMIN/MASTER como
    // fallback para evitar enviar Romaneio a gestores que não atuam no fiscal.
    return (us||[]).filter(u=>temPermissaoFiscal(u));
  }

  async function notificarFiscal(pedidoId){
    const p=await pedido(pedidoId);
    if(p.exige_nfe!==true || upper(p.status_fiscal)==="NFE_EMITIDA") return {ok:false,notificacoes:0};
    const fiscais=await usuariosFiscais();
    const gestor=global.AtlasGestorNotificacoes;
    if(!gestor?.notificarLista || !fiscais.length) return {ok:false,notificacoes:0};
    const ids=fiscais.map(x=>Number(x.id)).filter(Number.isFinite);
    const {data:existentes,error:erroExistentes}=await db()
      .from("notificacoes")
      .select("usuario_destino_id")
      .eq("pedido_id",p.id)
      .eq("tipo","ROMANEIO_AGUARDANDO_NFE")
      .in("usuario_destino_id",ids);
    if(erroExistentes) throw erroExistentes;

    const jaNotificados=new Set((existentes||[]).map(x=>Number(x.usuario_destino_id)));
    const pendentes=fiscais.filter(x=>!jaNotificados.has(Number(x.id)));

    let total=0;
    if(pendentes.length){
      total=await gestor.notificarLista(pendentes,{
        empresa_id:p.empresa_id||null,tipo:"ROMANEIO_AGUARDANDO_NFE",titulo:"🧾 Etapa fiscal liberada",
        mensagem:`Pedido ${p.codigo||("#"+p.id)} entrou em separação • Romaneio ${p.id} disponível para conferência e emissão da NF-e em paralelo.`,
        link:`atlas.html?m=expedicao&acao=romaneio&pedido=${encodeURIComponent(p.id)}`,pedido_id:p.id,obra_origem_id:p.obra_origem_id||null,obra_destino_id:p.obra_destino_id||p.obra_id||null
      });
    }

    const destinatarios=fiscais.map(x=>({id:x.id,nome:x.nome}));
    return {
      ok:(total+jaNotificados.size)>0,
      notificacoes:total,
      ja_existentes:jaNotificados.size,
      destinatarios
    };
  }

  global.addEventListener("click",()=>document.getElementById("bdrExportMenu")?.classList.remove("ativo"));
  global.AtlasRomaneio={__loaded:true,montar,abrir,abrirRemessa,abrirDocumentoPedido,abaDocumento,atualizarAssinaturas,assinarSaida,usarAssinaturaPessoal,criarLinkMotorista,copiarLink,copiarDocumento,limparAssinatura,fecharAssinatura,salvarAssinatura,fechar,imprimir,selecionarValor,toggleExportar,exportarExcel,exportarWord,abrirTransporte,salvarTransporte,registrarNfe,fecharModalNfe,confirmarNfe,notificarFiscal,garantirSnapshot,buscarSnapshot,carregarDoSnapshot,obterRomaneio};
})(window);
