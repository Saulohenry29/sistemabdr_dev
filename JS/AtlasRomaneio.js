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
  async function consultarPartesRomaneio(tipo,id){
    // Exibe apenas as empresas que fazem parte deste documento, mediante autorização por RPC.
    // O Fiscal autorizado para uma das obras pode ler os dados do documento sem acesso global à outra obra.
    const {data,error}=await db().rpc('atlas_romaneio_partes',{p_tipo:tipo,p_id:id});
    if(error){
      console.warn('Dados cadastrais completos do romaneio indisponíveis:',error.message);
      return null; // mantém compatibilidade com o modo legado, sem abrir acesso indevido
    }
    return data||null;
  }
  function cnpjFormatado(v){
    const t=texto(v), dig=t.replace(/\D/g,'');
    return dig.length===14?dig.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'):t;
  }
  function enderecoParte(e){
    return [e?.endereco,[e?.cidade,e?.estado].filter(Boolean).join(' / '),e?.cep?'CEP '+e.cep:''].filter(Boolean).join(' · ')||'—';
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
      item_id:Number(i.id), un:i.unidade||"UN", valor_bdr:num(i.valor_bdr), valor_romaneio:num(i.valor_romaneio), nf_entrada:i.numero_nfe_entrada||"",
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

      .atlas-doc-status-note{margin:10px 0;padding:10px 12px;background:#edf7f0;color:#176534;border:1px solid #bce4c8;border-radius:10px;display:flex;gap:10px;align-items:center;font-size:12px;font-weight:750;line-height:1.4}
      .atlas-doc-status-note[data-estado=preparo]{background:#f0f6ff;color:#1e4d82;border-color:#bdd5ef}
      .atlas-doc-status-note[data-estado=fiscal],.atlas-doc-status-note[data-estado=erro]{background:#fff7ed;color:#9a3412;border-color:#fdba74}
      .atlas-doc-status-note span:nth-child(2){flex:1}
      .atlas-doc-status-note button{background:#fff;border:1px solid #fed7aa;color:#9a3412;font-weight:900;white-space:nowrap}
      @media(max-width:700px){.atlas-doc-status-note{flex-wrap:wrap}.atlas-doc-status-note button{width:100%}}
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
      /* O Romaneio A4 não usa .bdr-rom: liberar seleção para copiar campos na NF-e.
         Escopo apenas do documento, preservando botões e assinatura desenhada. */
      .atlas-doc-backdrop .atlas-doc-printable,.atlas-doc-backdrop .atlas-doc-printable *{-webkit-user-select:text!important;user-select:text!important}
      .atlas-doc-backdrop .atlas-doc-printable :is(button,input,label){-webkit-user-select:none!important;user-select:none!important}
      .atlas-doc-backdrop .atlas-doc-printable ::selection{background:#b5d8ff;color:#14345e}
      .atlas-doc-brandbar{display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:3px solid #14549a;padding-bottom:16px;margin-bottom:20px}
      .atlas-doc-mark{display:flex;align-items:center;gap:14px;color:#12447b}.atlas-doc-mark>strong{font-size:38px;letter-spacing:-1px}.atlas-doc-mark>span{font-size:23px;font-weight:800;border-left:2px solid #14549a;padding-left:14px}.atlas-doc-mark small{display:block;font-size:11px;font-weight:500}
      .atlas-doc-name{text-align:right}.atlas-doc-name>b{font-size:25px;display:block}.atlas-doc-name>small{font-size:13px;color:#617995}
      .atlas-doc-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid #cbdaed;border-radius:11px;margin-bottom:17px;overflow:hidden}
      .atlas-doc-stats>div{padding:12px 16px;min-width:0}.atlas-doc-stats>div+div{border-left:1px solid #dbe5f1}.atlas-doc-stats small,.atlas-doc-transport small{display:block;font-size:11px;color:#586f89;margin-bottom:5px}.atlas-doc-stats b{display:block;font-size:14px;overflow-wrap:anywhere}
      .atlas-doc-partes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 17px}.atlas-doc-partes section{border:1px solid #c6d9ee;border-radius:10px;overflow:hidden;min-width:0;padding-bottom:9px}.atlas-doc-partes h3{background:#e2effe;color:#0a4185;font-size:15px;margin:0 0 9px;padding:10px 13px}.atlas-doc-partes p{font-size:11px;margin:3px 13px;line-height:1.28;overflow-wrap:anywhere}
      .atlas-doc-transport{display:grid;grid-template-columns:1fr 1.5fr .85fr;border:1px solid #c6d9ee;border-radius:10px;margin:0 0 18px;overflow:hidden}.atlas-doc-transport>div{padding:12px 13px;min-width:0}.atlas-doc-transport>div+div{border-left:1px solid #dce7f2}.atlas-doc-transport b{display:block;font-size:13px;overflow-wrap:anywhere}
      .atlas-doc-table-wrap{overflow:auto}.atlas-doc-table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:12px}.atlas-doc-table th{background:#103e76!important;color:#fff!important;font-size:11px;text-align:left;padding:9px 7px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.atlas-doc-table td{border:1px solid #d6e0ed;padding:9px 7px;vertical-align:top;overflow-wrap:anywhere}.atlas-doc-table th:nth-child(1){width:6%}.atlas-doc-table th:nth-child(2){width:18%}.atlas-doc-table th:nth-child(3){width:32%}.atlas-doc-table th:nth-child(4){width:7%}.atlas-doc-table th:nth-child(5){width:6%}.atlas-doc-table th:nth-child(6){width:18%}.atlas-doc-table th:nth-child(7){width:13%}.atlas-doc-table td small{display:block;line-height:1.35;color:#60758c;margin-top:4px}.atlas-doc-code{font-weight:800}.atlas-doc-price{text-align:right;white-space:nowrap}.atlas-doc-td-num{text-align:center}
      .atlas-doc-total{display:flex;justify-content:flex-end;margin:11px 0 19px;font-size:13px}.atlas-doc-total b{background:#eaf2fc;padding:9px 12px;border-radius:8px}
      .atlas-doc-print-signatures{border-top:2px solid #1d5c9a;padding-top:13px;margin-top:18px;break-inside:avoid}.atlas-doc-print-signatures>h3{font-size:16px;margin:0 0 14px}.atlas-doc-print-sign-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.atlas-doc-print-sign{border:1px solid #c6d9ee;border-radius:8px;padding:0 15px 12px;text-align:center;break-inside:avoid;min-height:150px}.atlas-doc-print-sign-title{background:#e6f2ff;color:#103f7a;font-size:13px;font-weight:800;padding:10px;margin:0 -15px 10px;text-align:left}.atlas-doc-print-sign-image{height:64px;display:flex;align-items:center;justify-content:center}.atlas-doc-print-sign-image img{max-width:100%;max-height:64px}.atlas-doc-print-sign-image span{color:#9aa8b9;font-size:11px;font-style:italic}.atlas-doc-print-sign-line{border-top:1px solid #8092ac;margin:0 24px 7px}.atlas-doc-print-sign b,.atlas-doc-print-sign small{display:block;margin:5px 0;background:transparent!important;box-shadow:none!important;min-width:0!important;width:auto!important;min-height:0!important;padding:0!important}.atlas-doc-print-sign small{font-size:11px;color:#5f7590}

      /* Valorização fiscal: painel operacional separado do A4 assinado. */
      .atlas-fiscal-painel{max-width:1060px;margin:0 auto 14px;background:#fff;border:1px solid #d4e1ef;border-radius:12px;padding:17px 19px;color:#173b64}
      .atlas-fiscal-topo{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}.atlas-fiscal-topo h3{margin:0 0 5px;font-size:17px}.atlas-fiscal-topo p,.atlas-fiscal-auditoria,.atlas-fiscal-alerta-note{font-size:11px;line-height:1.4;color:#62758c;margin:4px 0}.atlas-fiscal-situacao{font-size:11px;font-weight:800;background:#f0f6ff;color:#174a82;padding:7px 10px;border-radius:15px}.atlas-fiscal-lista{overflow-x:auto;margin:12px 0}.atlas-fiscal-todos{display:inline-flex;gap:8px;align-items:center;cursor:pointer;font-size:12px;font-weight:800;margin:0 0 12px}.atlas-fiscal-painel input[type=checkbox]{width:16px;height:16px;accent-color:#aa1e22}.atlas-fiscal-lista table{border-collapse:collapse;width:100%;font-size:12px;min-width:545px}.atlas-fiscal-lista th{background:#f3f7fc;color:#20486e;text-align:left;padding:9px 7px}.atlas-fiscal-lista td{border-bottom:1px solid #e3eaf1;padding:9px 7px;vertical-align:middle}.atlas-fiscal-lista small{display:block;margin-top:3px;color:#64748b;font-size:10px}.atlas-fiscal-check{display:flex;align-items:center;gap:6px;font-weight:800}.atlas-fiscal-rodape{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border-top:1px solid #e1e9f1;padding-top:14px}.atlas-fiscal-totais{display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:12px}.atlas-fiscal-totais span b{display:block;margin-top:4px}.atlas-fiscal-totais strong{display:block;font-size:17px;color:#9b1b20}.atlas-fiscal-alerta{border-color:#ffc6c6;background:#fff9f9}.atlas-fiscal-alerta-note{margin-top:9px}.atlas-doc-item-fiscal{display:block;margin-top:5px;font-size:9px;color:#12623a}.atlas-doc-resumo-fiscal{margin:13px 0 16px;border:1px solid #c8dcea;border-radius:8px;padding:12px 14px;break-inside:avoid}.atlas-doc-resumo-fiscal h3{margin:0 0 9px;font-size:13px}.atlas-doc-resumo-fiscal-valores{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12px}.atlas-doc-resumo-fiscal-valores b{display:block;margin-top:4px}.atlas-doc-resumo-fiscal>small{display:block;font-size:10px;color:#617890;margin-top:9px;line-height:1.35}
      /* Conferência fiscal integrada à própria tabela de patrimônios (sem painel duplicado). */
      .atlas-doc-fiscal-inline{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding:12px 14px;background:#f8fbff;border:1px solid #d1e1f2;border-radius:9px;margin:2px 0 10px;font-size:12px}
      .atlas-doc-fiscal-inline-text{display:flex;flex-direction:column;gap:4px;flex:1;min-width:210px}.atlas-doc-fiscal-inline-text>b{font-size:14px;color:#17487c}.atlas-doc-fiscal-inline-text small{font-size:11px;color:#637790}.atlas-doc-fiscal-inline-status{font-weight:800;color:#168153}.atlas-doc-fiscal-inline-status.pendente{color:#a05d09}
      .atlas-doc-fiscal-inline-actions{display:flex;align-items:center;flex-wrap:wrap;gap:12px}.atlas-doc-fiscal-inline-actions label,.atlas-doc-fiscal-check{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font-weight:800;cursor:pointer}
      .atlas-doc-fiscal-inline-actions input,.atlas-doc-fiscal-check input{width:16px;height:16px;accent-color:#b91c1c;cursor:pointer}.atlas-doc-fiscal-erro{background:#fff6f5;border-color:#f6c6c3;color:#8c2e28}
      .atlas-doc-table-fiscal th:nth-child(1){width:5%}.atlas-doc-table-fiscal th:nth-child(2){width:15%}.atlas-doc-table-fiscal th:nth-child(3){width:24%}.atlas-doc-table-fiscal th:nth-child(4){width:6%}.atlas-doc-table-fiscal th:nth-child(5){width:17%}.atlas-doc-table-fiscal th:nth-child(6){width:11%}.atlas-doc-table-fiscal th:nth-child(7){width:8%}.atlas-doc-table-fiscal th:nth-child(8){width:14%}
      .atlas-doc-table-fiscal td{padding:8px 5px;font-size:11px}.atlas-doc-table-fiscal .atlas-doc-price{white-space:normal;overflow-wrap:normal;font-variant-numeric:tabular-nums}.atlas-doc-table-fiscal .atlas-doc-price small{font-size:9px}
      .atlas-doc-ncm-pendente{color:#b45309}.atlas-doc-print-only{display:none}.atlas-doc-table-fiscal tfoot td{background:#f4f8fd!important;padding:12px 13px;font-size:12px}
      .atlas-doc-totais-fiscais{display:flex;justify-content:flex-end;align-items:center;gap:15px;flex-wrap:wrap}.atlas-doc-total-destaque{color:#143e72;font-size:14px}.atlas-doc-fiscal-situacao{display:block;text-align:right;color:#62758c;font-size:10px!important}.atlas-doc-fiscal-auditoria{text-align:right;font-size:10px;color:#59728b;margin-top:5px}
      @media(max-width:760px){.atlas-doc-fiscal-inline-actions{width:100%;justify-content:flex-end}.atlas-doc-table-fiscal{min-width:860px}}
      /* Coleta eletrônica direta no lugar da assinatura pendente; não sai na impressão. */
      .atlas-doc-print-sign-image{position:relative}
      .atlas-doc-print-sign-image > .atlas-doc-screen-sign{position:relative!important;left:auto!important;top:auto!important;right:auto!important;bottom:auto!important;transform:none!important;display:inline-flex;align-items:center;justify-content:center;gap:5px;flex:0 1 auto;width:max-content;max-width:calc(100% - 14px);min-height:38px;padding:8px 12px;border:1px solid #174d82;border-radius:9px;background:#17558f;color:#fff;font-family:inherit;font-size:12px;font-weight:800;white-space:normal;line-height:1.25;box-sizing:border-box;cursor:pointer;box-shadow:0 3px 10px #163b6021}
      .atlas-doc-screen-sign.motorista{background:#11794e;border-color:#11794e}
      .atlas-doc-screen-sign:hover:not(:disabled){filter:brightness(.94)}
      .atlas-doc-screen-sign:focus-visible{outline:3px solid #edb73d;outline-offset:2px}
      .atlas-doc-screen-sign:disabled{background:#eef2f7;color:#72869d;border-color:#d3dfeb;cursor:not-allowed;box-shadow:none}
      /* O texto pendente nao ocupa largura enquanto o botao estiver visivel. */
      .atlas-doc-screen-sign + .atlas-doc-print-sign-pending{display:none!important}
      /* Neutraliza transformacoes globais de hover/foco/active; evita o botao saltar ao passar o mouse. */
      .atlas-doc-print-sign-image > .atlas-doc-screen-sign:hover,
      .atlas-doc-print-sign-image > .atlas-doc-screen-sign:focus,
      .atlas-doc-print-sign-image > .atlas-doc-screen-sign:active{transform:none!important}
      @media print{.atlas-doc-screen-sign{display:none!important}.atlas-doc-screen-sign + .atlas-doc-print-sign-pending{display:inline!important;visibility:visible!important}}
      .atlas-doc-print-footer{display:flex;justify-content:space-between;gap:18px;align-items:center;border-top:2px solid #1d5c9a;padding-top:13px;margin-top:22px;break-inside:avoid;font-size:11px}.atlas-doc-print-footer>div{flex:1}.atlas-doc-print-footer small{display:block;margin-top:4px;color:#5b7290}.atlas-doc-qr-place{display:flex;align-items:center;gap:12px}.atlas-doc-qr-place img{width:74px;height:74px}
      .atlas-doc-sign-area{max-width:1060px;margin:0 auto;background:#fff;border:1px solid #d5e2f1;border-radius:0 0 13px 13px;padding:25px}.atlas-doc-sign-title{display:flex;align-items:center;justify-content:space-between;gap:10px}.atlas-doc-sign-title h2{font-size:21px;margin:0 0 15px}.atlas-doc-sign-title span{background:#e2f8f4;color:#166f62;border-radius:25px;padding:9px;font-weight:800;font-size:12px}.atlas-doc-sign-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.atlas-doc-sign-card{border:1px solid #c4d8f0;border-radius:12px;overflow:hidden}.atlas-doc-sign-head{display:flex;justify-content:space-between;align-items:start;background:#eef6ff;padding:15px;gap:10px}.atlas-doc-assinado .atlas-doc-sign-head{background:#e7f8ee}.atlas-doc-sign-head strong,.atlas-doc-sign-head small{display:block}.atlas-doc-sign-head small{font-size:12px;color:#56728f;margin-top:4px}.atlas-doc-sign-state{flex-shrink:0;font-size:12px;font-weight:800;color:#936015;background:#fff3d9;padding:6px 11px;border-radius:20px}.atlas-doc-sign-state.ok{color:#167343;background:#d8f7e3}.atlas-doc-sign-content{padding:18px;text-align:center;min-height:155px}.atlas-doc-sign-img{width:auto;max-width:95%;height:68px;object-fit:contain}.atlas-doc-sign-content strong,.atlas-doc-sign-content small{display:block;margin-top:7px}.atlas-doc-sign-content small{color:#59718a;font-size:12px}.atlas-doc-sign-empty{height:80px;border:2px dashed #cddced;background:#f8fbff;border-radius:9px;display:flex;align-items:center;justify-content:center;color:#7c8da2;font-size:13px}
      .atlas-doc-sign-buttons{display:flex;gap:10px;margin:18px 0 12px;flex-wrap:wrap}.atlas-doc-sign-note,.atlas-doc-warning{background:#edf5ff;padding:15px;border-radius:9px;color:#45627e;font-size:13px;line-height:1.5}.atlas-doc-warning{margin:13px 0;background:#fff7e5;color:#825510}.atlas-doc-driver-link{display:flex;align-items:center;flex-wrap:wrap;gap:15px;border:1px solid #b9d8f8;border-radius:10px;padding:16px;margin:16px 0}.atlas-doc-driver-link[hidden]{display:none}.atlas-doc-driver-link p{width:100%;margin:0}.atlas-doc-driver-link img{width:148px;height:148px}.atlas-doc-driver-link small{color:#64748b}
      .atlas-doc-pad-overlay{position:fixed;inset:0;z-index:2147483600;background:#0c1a32ba;display:flex;align-items:center;justify-content:center;padding:20px}.atlas-doc-pad-box{width:min(780px,100%);padding:24px;border-radius:16px;background:white;color:#17385e}.atlas-doc-pad-box h2{margin:0 0 10px}.atlas-doc-pad-box p{font-size:13px;color:#506a87}.atlas-doc-pad-box canvas{touch-action:none;width:100%;height:180px;border:2px dashed #b9cee6;border-radius:10px;background:white}.atlas-doc-pad-buttons{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:9px;margin-top:16px}
      /* Fluxo unificado: ações de assinatura junto do A4, sem aba separada. */
      .atlas-doc-sign-quick{max-width:1060px;margin:20px auto 14px;background:#fff;border:1px solid #d4e1ef;border-radius:13px;box-shadow:0 5px 18px #0d31590b;padding:16px 19px;color:#173b64}
      .atlas-doc-sign-quick-top{display:flex;align-items:center;justify-content:space-between;gap:13px;flex-wrap:wrap}
      .atlas-doc-sign-quick-title{font-size:15px;font-weight:900;display:block;margin-bottom:4px}
      .atlas-doc-sign-quick-help{font-size:12px;color:#5f7790}
      .atlas-doc-sign-quick-status{display:flex;gap:8px;flex-wrap:wrap}
      .atlas-doc-sign-pill{display:inline-flex;align-items:center;border-radius:20px;padding:7px 10px;background:#fff3dc;color:#86570b;font-weight:800;font-size:12px}
      .atlas-doc-sign-pill.done{background:#e3f8ec;color:#1a7143}
      .atlas-doc-sign-quick-buttons{display:flex;flex-wrap:wrap;gap:9px;margin-top:13px;align-items:center}
      .atlas-doc-sign-quick-buttons .atlas-doc-button{min-height:39px}
      .atlas-doc-sign-quick-buttons .atlas-doc-button.main{background:#1556a0}
      .atlas-doc-sign-quick-buttons .atlas-doc-button.success{background:#12804f;color:#fff;border-color:#12804f}
      .atlas-doc-sign-quick-note{font-size:11px;color:#71839a;margin-top:10px}
      .atlas-doc-sign-details{margin:14px auto 0;max-width:1060px}
      .atlas-doc-sign-details .atlas-doc-sign-area{border-radius:12px}
      .atlas-doc-driver-ready{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px;font-size:12px;background:#ebf5ff;padding:9px 11px;border-radius:9px}
      .atlas-doc-pad-field{display:block;font-weight:800;font-size:12px;margin:12px 0 7px}
      .atlas-doc-pad-input{width:100%;box-sizing:border-box;border:1px solid #bdcee2;border-radius:9px;padding:11px 12px;font-size:15px;color:#17385e}
      .atlas-doc-pad-confirmacao{font-size:12px!important;line-height:1.5;margin:12px 0 0;color:#476080!important}
      .atlas-doc-pad-audit{background:#f0f6fe;border:1px solid #d5e4f5;border-radius:9px;padding:10px;margin-top:12px;font-size:12px;color:#476080}
      @media(max-width:760px){.atlas-doc-sign-quick{margin:12px 6px;padding:13px}.atlas-doc-sign-quick-buttons .atlas-doc-button{flex:1 1 190px}.atlas-doc-pad-overlay{padding:8px}.atlas-doc-pad-box{max-height:95dvh;overflow:auto;padding:15px}.atlas-doc-pad-box canvas{height:150px}.atlas-doc-pad-buttons .atlas-doc-button{flex:1 1 130px}}
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
      // A versão fiscal nova usa decisões por ITEM; a escolha global 70/100
      // fica disponível somente até a instalação da migração. Sem decisão,
      // nunca presumir desconto em novos documentos.
      try{
        const {data:decisoes,error:erroFiscal}=await db().rpc('atlas_romaneio_valores_fiscais_ler',{
          p_tipo:'PED',p_id:Number(pedidoId)
        });
        if(erroFiscal)throw erroFiscal;
        if(Array.isArray(decisoes?.itens)){
          r.fiscalNovo=true;r.fiscalConferido=decisoes.conferido===true;
          r.fiscalAutor=decisoes.fiscal_nome||'';
          const m=new Map(decisoes.itens.map(i=>[Number(i.id),i]));
          r.linhas.forEach(l=>{
            const d=m.get(Number(l.item_id));
            if(!d)return;
            l.valor_romaneio=r.fiscalConferido?num(d.valor_unitario_fiscal):num(d.valor_original);
            l.total=Math.round(l.valor_romaneio*num(l.qtd)*100)/100;
          });
          r.total=r.linhas.reduce((s,l)=>s+l.total,0);
        }
      }catch(e){console.info('Romaneio fiscal: modo legado mantido até instalação da valorização por item:',e?.message||e);}
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
        ${r.fiscalNovo?`<div class="bdr-rom-valor"><strong>Valorização fiscal por item:</strong><span>${r.fiscalConferido?`✓ Conferida por ${esc(r.fiscalAutor||'Fiscal')} · Total ${dinheiro(r.total)}`:'Aguardando seleção do Fiscal (sem desconto até conferência)'}</span><button class="bdr-rom-btn primary" onclick="AtlasRomaneio.abrirDocumentoPedido(${Number(p.id)})">Conferir itens / descontos</button></div>`:`<div class="bdr-rom-valor"><strong>Valor para emissão da NF-e (legado):</strong><label class="bdr-rom-opcao"><input type="radio" name="bdrValorFiscal" value="70" ${r.percentual===70?"checked":""} onchange="AtlasRomaneio.selecionarValor(70)"> Romaneio 70% (${dinheiro(r.linhas.reduce((s,l)=>s+l.qtd*l.valor_romaneio,0))})</label><label class="bdr-rom-opcao"><input type="radio" name="bdrValorFiscal" value="100" ${r.percentual===100?"checked":""} onchange="AtlasRomaneio.selecionarValor(100)"> BDR 100% (${dinheiro(r.linhas.reduce((s,l)=>s+l.qtd*l.valor_bdr,0))})</label></div>`}
        <div class="bdr-rom-total">TOTAL GERAL DO ROMANEIO: ${dinheiro(r.total)}</div>
        ${pendencias.length?`<div class="bdr-rom-alert"><b>⚠ Pendências para conferência fiscal:</b> ${pendencias.map(esc).join(" • ")}</div>`:""}
        <div class="bdr-rom-actions"><button class="bdr-rom-btn primary" onclick="AtlasRomaneio.abrirDocumentoPedido(${Number(p.id)})">▤ Documento de transporte</button><button class="bdr-rom-btn gray" onclick="AtlasRomaneio.abrirTransporte()">🚚 Dados do transporte</button><button class="bdr-rom-btn gray" onclick="AtlasRomaneio.imprimir()">🖨 Imprimir</button><div class="bdr-export"><button class="bdr-rom-btn primary" onclick="AtlasRomaneio.toggleExportar(event)">⇩ Exportar ▾</button><div class="bdr-export-menu" id="bdrExportMenu"><button onclick="AtlasRomaneio.exportarExcel()">Exportar para Excel</button><button onclick="AtlasRomaneio.exportarWord()">Exportar para Word</button></div></div>${p.exige_nfe===true && upper(p.status_fiscal)!=="NFE_EMITIDA" && (!r.fiscalNovo||r.fiscalConferido)?`<button class="bdr-rom-btn ok" onclick="AtlasRomaneio.registrarNfe(${Number(p.id)})">✓ Registrar NF-e</button>`:""}<button class="bdr-rom-btn gray" onclick="AtlasRomaneio.fechar()">← Voltar</button></div>
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
  let assinaturaPresencialDisponivel=false;
  let assinaturaMotoristaPreparando=false;
  let assinaturasDocumento=[];
  let linkMotoristaGerado='';
  let assinaturaPerfil='';
  let pad=null;

  function aviso(mensagem){
    if(global.AtlasModal?.aviso){global.AtlasModal.aviso(mensagem);return;}
    alert(mensagem);
  }
  // Sucesso visual local: não altera as notificações globais do Atlas.
  function avisoSucesso(mensagem){
    document.getElementById('atlasDocSucessoToast')?.remove();
    const toast=document.createElement('div');
    toast.id='atlasDocSucessoToast';
    toast.setAttribute('role','status');
    toast.style.cssText='position:fixed;z-index:2147483601;top:16px;left:50%;transform:translateX(-50%);max-width:min(90vw,620px);padding:13px 20px;border:1px solid #86d5a5;border-left:5px solid #16834b;border-radius:11px;background:#e7f8ee;color:#12623a;box-shadow:0 8px 26px #102b2030;font-size:14px;font-weight:700;text-align:center;pointer-events:none';
    toast.textContent='✓ '+mensagem;
    document.body.appendChild(toast);
    setTimeout(()=>{if(toast.isConnected)toast.remove();},5000);
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
    const partes=await consultarPartesRomaneio('RP',id);
    const [orig,dest]=await Promise.all([obra(rp.obra_origem_id),obra(rp.obra_destino_id)]);
    const [empOrigLeg,empDestLeg]=await Promise.all([
      partes?.origem?.empresa?Promise.resolve(null):empresa(orig?.empresa_id||rp.empresa_id),
      partes?.destino?.empresa?Promise.resolve(null):empresa(dest?.empresa_id||rp.empresa_id)
    ]);
    const empOrig=partes?.origem?.empresa||empOrigLeg;
    const empDest=partes?.destino?.empresa||empDestLeg;
    const ids=[...new Set((itens||[]).map(i=>Number(i.patrimonio_id)).filter(n=>Number.isSafeInteger(n)&&n>0))];
    const pats=[];
    for(let n=0;n<ids.length;n+=100)pats.push(...await patrimonios(ids.slice(n,n+100)));
    const porId=new Map(pats.map(x=>[Number(x.id),x]));
    return {
      tipo:'RP',id,numero:rp.codigo||'RP-'+id,
      data:rp.enviado_em||rp.criado_em,status:rp.status||'',
      origem:partes?.origem?.nome_obra||rp.obra_origem_nome||fmtObra(orig),
      destino:partes?.destino?.nome_obra||rp.obra_destino_nome||fmtObra(dest),
      dadosOrigem:partes?.origem||null,dadosDestino:partes?.destino||null,
      empOrig,empDest,responsavel:rp.enviado_por_nome||'—',
      motorista:rp.motorista||rp.motorista_nome||'',transportadora:rp.transportadora||rp.veiculo||'',placa:rp.placa||rp.veiculo_placa||'',
      items:(itens||[]).map((i,index)=>{
        const x=porId.get(Number(i.patrimonio_id))||{};
        return {n:index+1,itemId:Number(i.id),codigo:i.codigo_qr||x.codigo_qr||String(i.patrimonio_id),
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
    const partes=await consultarPartesRomaneio('PED',id);
    const itensDocumento=[];
    for(const linha of r.linhas){
      // Cada patrimônio precisa ser identificável, sem ocultar um PAT dentro de um agrupamento.
      if(linha.patrimonios?.length){
        for(const pat of linha.patrimonios){
          itensDocumento.push({n:itensDocumento.length+1,itemId:Number(linha.item_id),codigo:pat,descricao:linha.descricao,detalhes:linha.codigo&&linha.codigo!==pat?'Referência: '+linha.codigo:'',qtd:1,unidade:'UN',ncm:linha.ncm,nf:linha.nf_entrada,valor:linha.valor_bdr});
        }
      }else{
        itensDocumento.push({n:itensDocumento.length+1,itemId:Number(linha.item_id),codigo:linha.codigo,descricao:linha.descricao,detalhes:linha.custo_direto&&linha.custo_direto!=='—'?linha.custo_direto:'',qtd:linha.qtd,unidade:linha.un,ncm:linha.ncm,nf:linha.nf_entrada,valor:linha.valor_bdr});
      }
    }
    return {
      tipo:'PED',id,numero:p.codigo||'PED-'+id,data:p.data_saida_cd||p.data_envio||p.data_finalizacao_separacao||p.data_criacao,
      status:p.status,exigeNfe:p.exige_nfe===true,statusFiscal:upper(p.status_fiscal),numeroNfe:texto(p.numero_nfe),origem:partes?.origem?.nome_obra||fmtObra(r.origem),destino:partes?.destino?.nome_obra||fmtObra(r.destino),
      dadosOrigem:partes?.origem||null,dadosDestino:partes?.destino||null,
      empOrig:partes?.origem?.empresa||r.empresaOrigem,empDest:partes?.destino?.empresa||r.empresaDestino,
      responsavel:p.usuario_saida_cd||p.usuario_finalizacao_separacao||p.solicitante||p.usuario_criacao||'—',
      motorista:p.motorista_nome||'',transportadora:p.transportadora||'',placa:p.veiculo_placa||'',items:itensDocumento
    };
  }
  async function obterAssinaturas(doc){
    // A listagem antiga não significa que o serviço PRESENCIAL foi instalado.
    assinaturaPresencialDisponivel=false;
    const {data,error}=await db().rpc('atlas_romaneio_assinaturas_listar',{p_tipo:doc.tipo,p_id:doc.id});
    if(error){
      assinaturasAtivas=false;
      assinaturasDocumento=[];
      assinaturaPerfil='';
      console.info('Atlas Romaneio: assinaturas dependem da migração segura do Supabase:',error.message);
      return;
    }
    assinaturasAtivas=true;
    assinaturasDocumento=Array.isArray(data)?data:(data?.assinaturas||[]);
    // Consulta autorizada, sem liberar a função de hash diretamente ao navegador.
    // A resposta também confirma que a RPC presencial existe e pode ser usada.
    if(prontidaoDocumento(doc).podeAssinar){
      const {data:hash,error:erroHash}=await db().rpc('atlas_romaneio_preparar_motorista_presencial',
        {p_tipo:doc.tipo,p_id:doc.id});
      assinaturaPresencialDisponivel=!erroHash && /^[a-f0-9]{64}$/i.test(String(hash||''));
      if(erroHash)console.info('Atlas Romaneio: assinatura presencial indisponível:',erroHash.message);
    }
    const {data:perfil,error:erroPerfil}=await db().rpc('atlas_romaneio_assinatura_pessoal');
    assinaturaPerfil=erroPerfil?'':(typeof perfil==='string'?perfil:'');
  }
  function assinaturaDo(papel){ return assinaturasDocumento.find(x=>x.papel===papel&&x.valida===true)||null; }
  function assinaturaCard(papel,titulo,descricao){
    const a=assinaturaDo(papel);
    return `<article class="atlas-doc-sign-card ${a?'atlas-doc-assinado':''}">
      <div class="atlas-doc-sign-head"><div><strong>${esc(titulo)}</strong><small>${esc(descricao)}</small></div><span class="atlas-doc-sign-state ${a?'ok':''}">${a?'✓ Assinado':'◷ Pendente'}</span></div>
      <div class="atlas-doc-sign-content">${a?`<img class="atlas-doc-sign-img" src="${esc(a.assinatura_png)}" alt="Assinatura registrada de ${esc(a.nome)}">
      <strong>${esc(a.nome)}</strong><small>${dataHoraBR(a.assinado_em)} · ${a.registrado_por_nome?`Presencial · aparelho de ${esc(a.registrado_por_nome)}`:a.metodo==='TOKEN_UNICO'?'Link seguro do motorista':'Confirmação no Atlas'}</small>`:
      `<div class="atlas-doc-sign-empty">Aguardando assinatura</div><small>${papel==='SAIDA'?'O responsável pela saída confirma os bens entregues.':'O motorista confere e confirma a retirada.'}</small>`}</div>
      </article>`;
  }
  function assinaturaImpressao(papel,titulo){
    const a=assinaturaDo(papel);
    const pronto=prontidaoDocumento(documentoAtual);
    // Botões apenas na visualização: a via impressa mantém o espaço em branco.
    const podeMostrarAcao=!a && assinaturasAtivas && pronto.podeAssinar;
    const motorista=papel==='MOTORISTA';
    const habilitado=podeMostrarAcao && (!motorista || (assinaturaDo('SAIDA') && assinaturaPresencialDisponivel));
    const dica=motorista && !assinaturaDo('SAIDA')
      ? 'O responsável deve assinar a saída primeiro.'
      : motorista && !assinaturaPresencialDisponivel
        ? 'A coleta presencial não está disponível neste documento.'
        : 'Assinar eletronicamente neste aparelho (sem certificado digital).';
    const acao=podeMostrarAcao
      ? `<button type="button" class="atlas-doc-screen-sign ${motorista?'motorista':'saida'}" onclick="AtlasRomaneio.${motorista?'assinarMotoristaNesteAparelho':'assinarSaida'}()" title="${esc(dica)}" aria-label="Assinar eletronicamente: ${esc(titulo)}" ${habilitado?'':'disabled'}>✍ Assinar eletronicamente</button>`
      : '';
    return `<div class="atlas-doc-print-sign"><div class="atlas-doc-print-sign-title">${esc(titulo)}</div>
      <div class="atlas-doc-print-sign-image">${a?`<img src="${esc(a.assinatura_png)}" alt="Assinatura">`:`${acao}<span class="atlas-doc-print-sign-pending">Assinatura pendente</span>`}</div>
      <div class="atlas-doc-print-sign-line"></div><b>${a?esc(a.nome):'—'}</b><small>${a?dataHoraBR(a.assinado_em):'Não assinado'}</small>${a?.registrado_por_nome?`<small>Coleta presencial: ${esc(a.registrado_por_nome)}</small>`:''}</div>`;
  }
  // Valorização fiscal independente: nunca altera o patrimônio nem o hash das assinaturas.
  // A seleção é validada e auditada pelo Supabase RPC, não pelo checkbox no navegador.
  let fiscalAtual=null;
  let fiscalErro='';
  let fiscalSelecao=new Map();
  function docFiscalCorreto(doc){
    return documentoAtual && doc && documentoAtual.tipo===doc.tipo && Number(documentoAtual.id)===Number(doc.id);
  }
  async function carregarFiscal(doc){
    fiscalAtual=null;fiscalErro='';fiscalSelecao=new Map();
    try{
      const {data,error}=await db().rpc('atlas_romaneio_valores_fiscais_ler',{
        p_tipo:doc.tipo,p_id:doc.id
      });
      if(error)throw error;
      if(!data||!Array.isArray(data.itens))throw new Error('Consulta fiscal retornou dados inválidos.');
      fiscalAtual=data;
      fiscalSelecao=new Map(data.itens.map(x=>[Number(x.id),x.desconto===true]));
    }catch(e){
      // A instalação é incremental. Nunca prejudicar o documento nem as assinaturas.
      fiscalErro=/(Could not find the function|PGRST202|does not exist)/i.test(String(e?.message||''))
        ?'Controle de descontos ainda não instalado no Supabase. O Romaneio continua funcionando sem descontos.'
        :'Não foi possível carregar a conferência fiscal: '+(e?.message||e);
      console.info('Atlas: valorização fiscal indisponível:',e?.message||e);
    }
  }
  // A valorização fiscal faz parte da própria tabela do Romaneio.
  // Edição é autorizada no Supabase; marcações locais são só uma prévia até salvar.
  function fiscalMudou(){
    return fiscalAtual?.pode_editar===true && fiscalAtual.itens.some(i =>
      (fiscalSelecao.get(Number(i.id))===true)!==(i.desconto===true));
  }
  function calculoFiscalItem(item){
    const itemFiscal=docFiscalCorreto(documentoAtual)
      ? fiscalAtual?.itens.find(i=>Number(i.id)===Number(item.itemId)) : null;
    const qtd=num(item.qtd)||1;
    const base=itemFiscal ? num(itemFiscal.valor_original) : num(item.valor);
    const aplicar=itemFiscal ? (fiscalAtual?.pode_editar===true
      ? fiscalSelecao.get(Number(itemFiscal.id))===true : itemFiscal.desconto===true) : false;
    // O banco calcula por unidade e arredonda em centavos, antes de multiplicar.
    const unitario=Math.round(Math.round(base*100)*(aplicar?.7:1))/100;
    const total=Math.round(unitario*qtd*100)/100;
    return {itemFiscal,base,aplicar,unitario,total,qtd};
  }
  function totaisFiscais(doc){
    let origCent=0,finalCent=0;
    if(docFiscalCorreto(doc) && fiscalAtual?.itens?.length){
      for(const item of fiscalAtual.itens){
        const qtd=num(item.qtd)||1;
        const unidadeBase=Math.round(num(item.valor_original)*100);
        const desconto=fiscalAtual.pode_editar===true
          ? fiscalSelecao.get(Number(item.id))===true : item.desconto===true;
        origCent+=Math.round(unidadeBase*qtd);
        finalCent+=Math.round(Math.round(unidadeBase*(desconto?.7:1))*qtd);
      }
    } else for(const item of doc.items){
      const qtd=num(item.qtd)||1;
      const valor=Math.round(num(item.valor)*100);
      origCent+=Math.round(valor*qtd);finalCent+=Math.round(valor*qtd);
    }
    return {original:origCent/100,final:finalCent/100,desconto:(origCent-finalCent)/100};
  }
  function controleFiscalNaTabela(doc){
    if(!docFiscalCorreto(doc))return '';
    if(!fiscalAtual){
      // A mensagem de indisponibilidade fica imediatamente antes da tabela,
      // não como outro painel ou documento de valores.
      return temPermissaoFiscal(usuarioAtual())
        ? `<div class="atlas-doc-fiscal-inline atlas-doc-only-screen atlas-doc-fiscal-erro">⚠ ${esc(fiscalErro||'Controle fiscal indisponível.')}</div>` : '';
    }
    const editar=fiscalAtual.pode_editar===true;
    const todos=fiscalAtual.itens.length>0 && fiscalAtual.itens.every(i=>fiscalSelecao.get(Number(i.id))===true);
    const alterado=fiscalMudou();
    const situacao=alterado?'● Alterações não salvas':fiscalAtual.conferido?'✓ Conferência fiscal salva':'◷ Aguardando conferência fiscal';
    return `<div class="atlas-doc-fiscal-inline atlas-doc-only-screen" id="atlasRomFiscalControle">
      <div class="atlas-doc-fiscal-inline-text"><b>🧾 Valores para emissão da NF-e</b>
        <small>${editar?'O Fiscal seleciona abaixo quais itens recebem 30% de desconto. Os demais mantêm o valor original.':'Valores definidos pelo Fiscal; edição restrita a EXPEDICAO_FISCAL.'}</small>
        <span class="atlas-doc-fiscal-inline-status ${alterado?'pendente':''}">${esc(situacao)}</span>
      </div>
      ${editar?`<div class="atlas-doc-fiscal-inline-actions">
        <label><input type="checkbox" ${todos?'checked':''} onchange="AtlasRomaneio.marcarTodosFiscal(this.checked)"> Desconto de 30% em todos</label>
        <button type="button" class="atlas-doc-button main atlas-doc-fiscal-salvar" onclick="AtlasRomaneio.salvarValoresFiscais()">Salvar valores fiscais</button>
      </div>`:''}
    </div>`;
  }
  function atualizarTabelaFiscal(){
    const wrap=document.getElementById('atlasDocTabelaValores');
    if(!wrap||!documentoAtual)return;
    const anterior=wrap.querySelector('.atlas-doc-table-wrap')?.scrollLeft||0;
    wrap.outerHTML=docTabela(documentoAtual);
    const novo=document.querySelector('#atlasDocTabelaValores .atlas-doc-table-wrap');
    if(novo)novo.scrollLeft=anterior;
  }
  function marcarItemFiscal(id,aplicar){
    if(!fiscalAtual?.pode_editar)return;
    id=Number(id);
    if(!fiscalAtual.itens.some(x=>Number(x.id)===id))return;
    fiscalSelecao.set(id,aplicar===true);
    atualizarTabelaFiscal();
  }
  function marcarTodosFiscal(aplicar){
    if(!fiscalAtual?.pode_editar)return;
    fiscalAtual.itens.forEach(i=>fiscalSelecao.set(Number(i.id),aplicar===true));
    atualizarTabelaFiscal();
  }
  async function salvarValoresFiscais(){
    if(!documentoAtual||!fiscalAtual?.pode_editar)return aviso('Somente o Fiscal autorizado pode registrar os descontos.');
    const doc=documentoAtual;
    const itens=fiscalAtual.itens.map(i=>({id:Number(i.id),desconto:fiscalSelecao.get(Number(i.id))===true}));
    const botao=document.querySelector('#atlasRomFiscalControle .atlas-doc-fiscal-salvar');
    if(botao){botao.disabled=true;botao.textContent='Salvando...';}
    try{
      const {error}=await db().rpc('atlas_romaneio_valores_fiscais_salvar',{
        p_tipo:doc.tipo,p_id:doc.id,p_itens:itens
      });
      if(error)throw error;
      if(!docFiscalCorreto(doc))return;
      await carregarFiscal(doc);
      if(fiscalErro)throw new Error(fiscalErro);
      atualizarTabelaFiscal();
      avisoSucesso('Valores fiscais do Romaneio salvos com sucesso!');
    }catch(e){aviso('Falha ao salvar valores fiscais: '+(e?.message||e));}
    finally{if(botao?.isConnected){botao.disabled=false;botao.textContent='Salvar valores fiscais';}}
  }
  function docTabela(doc){
    const fiscal=docFiscalCorreto(doc)?fiscalAtual:null;
    const editavel=fiscal?.pode_editar===true;
    const valores=totaisFiscais(doc);
    const alterado=fiscalMudou();
    const linhas=doc.items.map(l=>{
      const v=calculoFiscalItem(l);
      const id=Number(l.itemId);
      const mostraControle=editavel && v.itemFiscal && Number.isSafeInteger(id) && id>0;
      const desconto=v.itemFiscal?(v.aplicar?'30%':'0%'):'—';
      const textoPreco=(l.valor==null||l.valor==='') && !v.itemFiscal?'A conferir':dinheiro(v.base);
      const ncm=esc(l.ncm)||'<span class="atlas-doc-ncm-pendente">A conferir</span>';
      return `<tr><td class="atlas-doc-td-num">${esc(l.n)}</td><td class="atlas-doc-code">${esc(l.codigo)}</td>
        <td><b>${esc(l.descricao)}</b>${l.detalhes?`<small>${esc(l.detalhes)}</small>`:''}</td>
        <td class="atlas-doc-td-num">${esc(l.qtd)}<small>${esc(l.unidade||'UN')}</small></td>
        <td><b>NCM: ${ncm}</b><small>NF entrada: ${esc(l.nf)||'—'}</small></td>
        <td class="atlas-doc-price">${textoPreco}</td>
        <td class="atlas-doc-fiscal-col">${mostraControle?`<label class="atlas-doc-fiscal-check atlas-doc-only-screen"><input type="checkbox" ${v.aplicar?'checked':''} onchange="AtlasRomaneio.marcarItemFiscal(${id},this.checked)" aria-label="Aplicar desconto de 30% ao item ${esc(l.codigo)}"> ${desconto}</label><span class="atlas-doc-print-only">${desconto}</span>`:desconto}</td>
        <td class="atlas-doc-price"><b>${dinheiro(v.total)}</b><small>${dinheiro(v.unitario)} / un.</small></td></tr>`;
    }).join('');
    const situacao=fiscal ? (alterado?'Prévia, não salva':fiscal.conferido?'Conferido pelo Fiscal':'Aguardando conferência fiscal'):'Sem conferência fiscal';
    const auditoria=fiscal?.conferido && fiscal.fiscal_nome
      ? `<div class="atlas-doc-fiscal-auditoria">Conferência: ${esc(fiscal.fiscal_nome)} · ${dataHoraBR(fiscal.decidido_em)}. Assinaturas confirmam a transferência dos bens; a valorização é registrada pelo Fiscal.</div>` : '';
    return `<div id="atlasDocTabelaValores">${controleFiscalNaTabela(doc)}
      <div class="atlas-doc-table-wrap"><table class="atlas-doc-table atlas-doc-table-fiscal">
      <thead><tr><th>Item</th><th>Patrimônio</th><th>Descrição / identificação</th><th>Qtd.</th><th>NCM / referências</th><th>Valor original</th><th>Desc.</th><th>Valor Romaneio</th></tr></thead>
      <tbody>${linhas||'<tr><td colspan="8">Nenhum patrimônio encontrado</td></tr>'}</tbody>
      <tfoot><tr><td colspan="8"><div class="atlas-doc-totais-fiscais"><span>Original: <b>${dinheiro(valores.original)}</b></span><span>Desconto: <b>${dinheiro(valores.desconto)}</b></span><span class="atlas-doc-total-destaque">Total do Romaneio: <b>${dinheiro(valores.final)}</b></span></div><small class="atlas-doc-fiscal-situacao">${situacao}</small>${auditoria}</td></tr></tfoot>
      </table></div></div>`;
  }
  function htmlDadosParte(empresa,dadosObra,nomeObra){
    const codigo=texto(dadosObra?.codigo_obra),codigoSienge=texto(dadosObra?.codigo_sienge);
    const tabela=dadosObra?.tabela_insumo;
    const codigos=[empresa?.codigo_empresa?'Empresa '+empresa.codigo_empresa:'',codigo?'Obra '+codigo:'',
      codigoSienge?'Sienge '+codigoSienge:'',tabela!=null?'Tabela '+tabela:''].filter(Boolean).join(' · ');
    return `<p><b>Empresa:</b> ${esc(empresa?.nome)||'—'}</p>
      <p><b>CNPJ:</b> ${esc(cnpjFormatado(empresa?.cnpj))||'—'}</p>
      <p><b>Obra:</b> ${esc(nomeObra)||'—'}</p>
      <p><b>Códigos:</b> ${esc(codigos)||'—'}</p>
      <p><b>Endereço:</b> ${esc(empresa?.endereco)||'—'}</p>
      <p><b>Cidade / UF:</b> ${esc([empresa?.cidade,empresa?.estado].filter(Boolean).join(' / '))||'—'}</p>
      <p><b>CEP:</b> ${esc(empresa?.cep)||'—'}</p>
      ${empresa?.telefone?`<p><b>Telefone:</b> ${esc(empresa.telefone)}</p>`:''}`;
  }
  function cabecalhoDocumento(doc){
    return `<header class="atlas-doc-brandbar"><div class="atlas-doc-mark"><strong>BDR</strong><span>Atlas<small>Gestão Patrimonial</small></span></div>
       <div class="atlas-doc-name"><b>ROMANEIO PATRIMONIAL</b><small>Documento de transferência</small></div></header>
       <div class="atlas-doc-stats"><div><small>Remessa</small><b>${esc(doc.numero)}</b></div><div><small>Data / Hora</small><b>${dataHoraBR(doc.data)}</b></div>
       <div><small>Situação</small><b>${esc(formatoStatus(doc.status))}</b></div></div>
       <div class="atlas-doc-partes"><section><h3>↗ Origem</h3>${htmlDadosParte(doc.empOrig,doc.dadosOrigem,doc.origem)}</section>
       <section><h3>⌖ Destino</h3>${htmlDadosParte(doc.empDest,doc.dadosDestino,doc.destino)}</section></div>
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
    <div class="atlas-doc-sign-buttons"><button class="atlas-doc-button" onclick="AtlasRomaneio.atualizarAssinaturas()">↻ Atualizar assinaturas</button></div>
    ${!assinaturasAtivas?'<div class="atlas-doc-warning">Assinatura eletrônica indisponível: é necessário instalar e validar a migração segura do Supabase. O documento permanece imprimível, com assinaturas pendentes claramente identificadas.</div>':''}
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
  // Mantido como atalho para integrações antigas; não existem mais abas obrigatórias.
  function abaDocumento(nome){
    if(nome==='assinaturas')mostrarDetalhesAssinaturas(true);
  }
  // Controle visual preventivo. O Supabase valida novamente cada operacao:
  // o frontend nao concede permissao nem muda o status da remessa.
  function prontidaoDocumento(doc){
    if(!doc)return {podeAssinar:false,tipo:'erro',mensagem:'Documento indisponível.'};
    const st=upper(doc.status).replace(/\s+/g,'_');
    if(doc.tipo==='RP'){
      if(st==='AGUARDANDO_EXPEDICAO')return {
        podeAssinar:true,tipo:'preparo',
        mensagem:'Remessa aguardando expedição. As duas assinaturas podem ser coletadas agora; isso NÃO envia os patrimônios nem substitui a liberação da Expedição.'};
      if(st==='EM_TRANSITO')return {podeAssinar:true,tipo:'ok',mensagem:'Remessa em trânsito. Assinaturas permitidas.'};
      return {podeAssinar:false,tipo:'erro',mensagem:`Esta RP está em ${st.replaceAll('_',' ')||'status indefinido'}. Assinaturas novas não são permitidas nessa situação. Confira o andamento na Expedição.`};
    }
    if(doc.tipo==='PED'){
      if(doc.exigeNfe===true && upper(doc.statusFiscal)!=='NFE_EMITIDA')return {
        podeAssinar:false,tipo:'fiscal',
        mensagem:'NF-e obrigatória ainda não registrada. O pedido não pode ser assinado nem enviado antes da regularização fiscal.'};
      if(['AGUARDANDO_RETIRADA','EM_TRANSITO'].includes(st))return {podeAssinar:true,tipo:'ok',mensagem:'Pedido apto à coleta de assinaturas.'};
      return {podeAssinar:false,tipo:'erro',mensagem:`Este PED está em ${st.replaceAll('_',' ')||'status indefinido'}. Aguarde a separação e a liberação para retirada.`};
    }
    return {podeAssinar:false,tipo:'erro',mensagem:'Tipo de documento desconhecido.'};
  }
  async function regularizarFiscalPedido(){
    const doc=documentoAtual;
    if(!doc||doc.tipo!=='PED')return;
    // O registro continua restrito ao modulo Fiscal, com suas validacoes de permissao.
    try{
      if(global.AtlasExpedicaoLoader?.modulo)await global.AtlasExpedicaoLoader.modulo('fiscal');
      if(typeof global.abrirRegistroNfeAtlas!=='function')throw new Error('O módulo de NF-e não foi carregado. Abra Expedição → Fiscal.');
      fechar();
      global.abrirRegistroNfeAtlas(doc.id);
    }catch(e){aviso('Não foi possível abrir o registro fiscal: '+(e.message||e));}
  }
  function assinaturaResumo(){
    const a=assinaturaDo('SAIDA'),m=assinaturaDo('MOTORISTA');
    const feito=Number(Boolean(a))+Number(Boolean(m));
    const pronto=prontidaoDocumento(documentoAtual);
    const habilitado=assinaturasAtivas&&pronto.podeAssinar;
    const local=global.location.protocol!=='https:'||['localhost','127.0.0.1'].includes(global.location.hostname);
    // O endpoint publico do motorista permanece REVOGADO no Supabase.
    // Nao habilitar apenas mudando o frontend: requer revisao e GRANT especifico no banco.
    const linkPublicoLiberado=global.ATLAS_ROMANEIO_LINK_PUBLICO_ATIVO===true;
    return `<div class="atlas-doc-sign-quick">
      <div class="atlas-doc-sign-quick-top"><div><strong class="atlas-doc-sign-quick-title">✍ Assinaturas do romaneio · ${feito}/2</strong>
      <span class="atlas-doc-sign-quick-help">Para assinar, utilize os botões nos campos do documento abaixo.</span></div>
      <div class="atlas-doc-sign-quick-status"><span class="atlas-doc-sign-pill ${a?'done':''}">${a?'✓':'◷'} Saída ${a?'assinada':'pendente'}</span><span class="atlas-doc-sign-pill ${m?'done':''}">${m?'✓':'◷'} Motorista ${m?'assinado':'pendente'}</span></div></div>
      <div class="atlas-doc-status-note" role="status" data-estado="${esc(pronto.tipo)}"><span>${pronto.tipo==='fiscal'?'🧾':pronto.tipo==='preparo'?'📦':pronto.tipo==='ok'?'✓':'⚠'}</span><span>${esc(pronto.mensagem)}</span>${pronto.tipo==='fiscal'?`<button class="atlas-doc-button" onclick="AtlasRomaneio.regularizarFiscalPedido()">Registrar NF-e</button>`:''}</div>
      <div class="atlas-doc-sign-quick-buttons">
        ${!a&&assinaturaPerfil?`<button class="atlas-doc-button" onclick="AtlasRomaneio.usarAssinaturaPessoal()" ${!habilitado?'disabled':''}>✓ Usar minha assinatura salva</button>`:''}
        ${a&&!m&&linkPublicoLiberado&&!local?`<button class="atlas-doc-button" onclick="AtlasRomaneio.criarLinkMotorista()" ${!habilitado?'disabled':''}>▦ QR / link para o motorista</button>`:''}
        <button class="atlas-doc-button" onclick="AtlasRomaneio.mostrarDetalhesAssinaturas()">ⓘ Ver detalhes das assinaturas</button>
        <button class="atlas-doc-button" onclick="AtlasRomaneio.atualizarAssinaturas()">↻ Atualizar</button>
      </div>
      ${linkMotoristaGerado?`<div class="atlas-doc-driver-ready"><b>Link gerado:</b> <a href="${esc(linkMotoristaGerado)}" target="_blank" rel="noopener noreferrer">Abrir</a><button class="atlas-doc-button" onclick="AtlasRomaneio.copiarLink()">Copiar link</button><img id="atlasDocQrMotorista" alt="QR do motorista" width="90" height="90"></div>`:''}
      <div class="atlas-doc-sign-quick-note">${a&&!m?'Entregue o aparelho ao motorista para ele próprio desenhar a assinatura. O funcionário autenticado será registrado como responsável pela coleta.':!a?'Primeiro o responsável pela saída confirma os itens e assina.': 'As duas assinaturas foram registradas para esta versão do documento.'}
      ${local?' · QR externo exige endereço HTTPS público.':''}${!linkPublicoLiberado?' · Link externo ainda não liberado no banco.':''}</div>
    </div>`;
  }
  function mostrarDetalhesAssinaturas(forcar=false){
    const detalhe=document.getElementById('atlasDocAssinaturasDetalhes');if(!detalhe)return;
    detalhe.hidden=forcar?false:!detalhe.hidden;
    if(!detalhe.hidden)detalhe.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function renderAssinaturas(){
    const resumo=document.getElementById('atlasDocAcoesAssinatura');
    if(resumo)resumo.innerHTML=assinaturaResumo();
    const sec=document.getElementById('atlasDocAssinaturasDetalhes');
    if(sec)sec.innerHTML=docAssinaturas(documentoAtual);
    const print=document.querySelector('#bdrRomaneioFiscal .atlas-doc-printable');
    if(print)print.outerHTML=docImpressao(documentoAtual);
  }
  async function atualizarAssinaturas(){
    if(!documentoAtual)return false;
    const anterior=documentoAtual;
    try{
      // Não reutilizar status e itens antigos na tela ou no documento impresso.
      const novo=anterior.tipo==='RP'?await carregarDocumentoRP(anterior.id):await carregarDocumentoPED(anterior.id);
      if(documentoAtual!==anterior)return false;
      documentoAtual=novo;
      await obterAssinaturas(novo);
      renderAssinaturas();
      await desenharQRCode(novo);
      return true;
    }catch(e){
      console.warn('Atlas Romaneio: erro ao atualizar documento e assinaturas:',e);
      aviso('Não foi possível atualizar o romaneio. Feche e abra novamente para visualizar os dados atuais.');
      return false;
    }
  }
  async function abrirDocumento(tipo,id){
    id=Number(id);if(!Number.isSafeInteger(id)||id<=0)throw new Error('Número de remessa inválido.');
    const doc=tipo==='RP'?await carregarDocumentoRP(id):await carregarDocumentoPED(id);
    documentoAtual=doc;linkMotoristaGerado='';
    await obterAssinaturas(doc);
    await carregarFiscal(doc);
    estilos();
    document.getElementById('bdrRomaneioFiscal')?.remove();
    const fundo=document.createElement('div');fundo.id='bdrRomaneioFiscal';fundo.className='bdr-rom-bg atlas-doc-backdrop';
    fundo.innerHTML=`<div class="atlas-doc-shell"><header class="atlas-doc-toolbar"><div><h1>Romaneio Patrimonial</h1><small>Documento de transferência · ${esc(doc.numero)}</small></div>
       <div class="atlas-doc-toolbar-actions"><button class="atlas-doc-button" type="button" onclick="AtlasRomaneio.copiarItensNfe()" title="Copiar os dados conferidos em colunas para colar no Excel ou em um emissor compatível">▤ Copiar itens para NF-e</button><button class="atlas-doc-button" onclick="AtlasRomaneio.imprimir()">▣ Imprimir / salvar PDF</button>
       <button class="atlas-doc-button" onclick="AtlasRomaneio.copiarDocumento()">↗ Copiar link</button><button class="atlas-doc-button atlas-doc-close" onclick="AtlasRomaneio.fechar()" aria-label="Fechar">×</button></div></header>
       <main class="atlas-doc-content"><div id="atlasDocAcoesAssinatura">${assinaturaResumo()}</div>
       ${docImpressao(doc)}<section id="atlasDocAssinaturasDetalhes" class="atlas-doc-sign-details" hidden>${docAssinaturas(doc)}</section></main></div>`;
    document.body.appendChild(fundo);
    await desenharQRCode(doc);
  }
  async function abrirRemessa(id){return abrirDocumento('RP',id);}
  async function abrirDocumentoPedido(id){return abrirDocumento('PED',id);}
  // Copia dados estruturados do MESMO Romaneio exibido e já conferido; não cria outra tela.
  // TSV é adequado ao colar no Excel. Para emissores de NF-e sem colagem múltipla,
  // o texto do A4 permanece selecionável campo a campo.
  async function copiarItensNfe(){
    const doc=documentoAtual;
    if(!doc)return aviso('Abra um Romaneio antes de copiar os itens.');
    if(fiscalMudou())return aviso('Salve os descontos alterados antes de copiar os dados para a NF-e.');
    if(docFiscalCorreto(doc) && (!fiscalAtual || !fiscalAtual.conferido)){
      return aviso('Aguarde a conferência fiscal dos valores antes de copiar os dados para a NF-e.');
    }
    if(!Array.isArray(doc.items)||!doc.items.length)return aviso('O Romaneio não possui itens para copiar.');
    const seguro=(v)=>{
      const t=texto(v).replace(/[\t\r\n]+/g,' ').trim();
      // Evita fórmulas executáveis ao colar textos da base em planilhas.
      return /^[=+\-@]/.test(t)?"'"+t:t;
    };
    const numero=(v)=>num(v).toFixed(2).replace('.',',');
    const cabecalho=['Patrimônio','Descrição','NCM','Quantidade','Unidade','Desconto (%)','Valor unitário (R$)','Valor total (R$)','NF de entrada'];
    let ncmPendente=0;
    const linhas=doc.items.map(l=>{
      const v=calculoFiscalItem(l);
      const ncm=texto(l.ncm);
      if(!ncm)ncmPendente++;
      return [seguro(l.codigo),seguro(l.descricao),seguro(ncm),seguro(l.qtd),seguro(l.unidade||'UN'),
        v.aplicar?'30':'0',numero(v.unitario),numero(v.total),seguro(l.nf)].join('\t');
    });
    const resultado=[cabecalho.join('\t'),...linhas].join('\n');
    try{
      if(!global.navigator?.clipboard?.writeText)throw new Error('Clipboard API indisponível');
      await global.navigator.clipboard.writeText(resultado);
    }catch(_){
      // Fallback para ambientes de rede/localhost que bloqueiam Clipboard API.
      const ta=document.createElement('textarea');ta.value=resultado;ta.readOnly=true;
      ta.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';document.body.appendChild(ta);
      ta.focus();ta.select();
      const ok=typeof document.execCommand==='function' && document.execCommand('copy');
      ta.remove();
      if(!ok){global.prompt('Copie os itens do Romaneio:',resultado);return;}
    }
    avisoSucesso(doc.items.length+' item(ns) copiado(s) em colunas para NF-e / Excel.'+
      (ncmPendente?' Atenção: '+ncmPendente+' item(ns) sem NCM para conferir.':''));
  }
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
    if(!assinaturaDo('SAIDA')){aviso('Assine primeiro a saída do romaneio.');return;}
    if(global.ATLAS_ROMANEIO_LINK_PUBLICO_ATIVO!==true){aviso('O link externo do motorista ainda não foi liberado no banco. Use a assinatura presencial neste aparelho.');return;}
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
      renderAssinaturas();
      await desenharQRCode(documentoAtual);
    }catch(e){aviso('Não foi possível gerar o link seguro: '+(e.message||e));}
  }
  function assinaturaModal(nome,papel,hashEsperado=''){
    const existente=document.getElementById('atlasDocPadOverlay');if(existente)existente.remove();
    const motorista=papel==='MOTORISTA';
    const overlay=document.createElement('div');overlay.id='atlasDocPadOverlay';overlay.className='atlas-doc-pad-overlay';
    overlay.innerHTML=`<div class="atlas-doc-pad-box"><h2>${motorista?'Assinatura presencial do motorista':'Assinatura do responsável pela saída'}</h2>
      <p>${motorista?'Motorista: confira os bens no romaneio acima antes de confirmar. Você deve desenhar sua própria assinatura, usando este aparelho.':`${esc(nome)} — confira o romaneio antes de assinar.`}</p>
      ${motorista?`<label class="atlas-doc-pad-field" for="atlasDocMotoristaNome">Nome completo do motorista</label>
      <input id="atlasDocMotoristaNome" class="atlas-doc-pad-input" type="text" maxlength="120" autocomplete="name" placeholder="Nome completo" value="${esc(nome)}">`:''}
      <label class="atlas-doc-pad-field" for="atlasDocPad">Desenhe a assinatura abaixo</label>
      <canvas id="atlasDocPad" width="780" height="230" aria-label="Área para desenhar a assinatura"></canvas>
      ${motorista?`<p class="atlas-doc-pad-confirmacao">Ao clicar em <strong>Confirmar assinatura do motorista</strong>, o motorista declara que conferiu os bens e que a assinatura desenhada é sua.</p>
      <div class="atlas-doc-pad-audit">Coleta presencial por: <b>${esc(usuarioAtual()?.nome||'Funcionário autenticado')}</b>. Isso não equivale à assinatura digital com certificado.</div>`:''}
      <div class="atlas-doc-pad-buttons"><button class="atlas-doc-button" onclick="AtlasRomaneio.limparAssinatura()">Limpar</button>
      <button class="atlas-doc-button" onclick="AtlasRomaneio.fecharAssinatura()">Cancelar</button>
      <button class="atlas-doc-button main" onclick="AtlasRomaneio.salvarAssinatura()">${motorista?'Confirmar assinatura do motorista':'Confirmar e assinar esta remessa'}</button></div></div>`;
    document.body.appendChild(overlay);
    const c=overlay.querySelector('canvas'),ctx=c.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle='#0b2854';ctx.lineWidth=3.4;ctx.lineCap='round';ctx.lineJoin='round';
    pad={c,ctx,ativo:false,desenhou:false,papel,documentoTipo:documentoAtual?.tipo,
      documentoId:documentoAtual?.id,hashEsperado:papel==='MOTORISTA'?hashEsperado:''};
    const ponto=e=>{const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height};};
    c.addEventListener('pointerdown',e=>{c.setPointerCapture(e.pointerId);pad.ativo=true;pad.desenhou=true;const pt=ponto(e);ctx.beginPath();ctx.moveTo(pt.x,pt.y);ctx.lineTo(pt.x+.2,pt.y+.2);ctx.stroke();});
    c.addEventListener('pointermove',e=>{if(!pad?.ativo)return;const pt=ponto(e);ctx.lineTo(pt.x,pt.y);ctx.stroke();});
    ['pointerup','pointercancel'].forEach(tipo=>c.addEventListener(tipo,()=>{if(pad)pad.ativo=false;}));
  }
  function limparAssinatura(){if(pad){pad.ctx.fillStyle='#fff';pad.ctx.fillRect(0,0,pad.c.width,pad.c.height);pad.desenhou=false;}}
  function fecharAssinatura(){document.getElementById('atlasDocPadOverlay')?.remove();pad=null;}
  function assinarSaida(){
    if(!documentoAtual||!assinaturasAtivas)return;
    const pronto=prontidaoDocumento(documentoAtual);
    if(!pronto.podeAssinar){aviso(pronto.mensagem);return;}
    assinaturaModal(usuarioAtual()?.nome||'Responsável pela saída','SAIDA');
  }
  async function assinarMotoristaNesteAparelho(){
    if(!documentoAtual||!assinaturasAtivas)return;
    if(!assinaturaPresencialDisponivel){
      aviso('A assinatura presencial ainda não está habilitada no banco para este documento.');return;
    }
    const anterior=documentoAtual;
    const pronto=prontidaoDocumento(anterior);
    if(!pronto.podeAssinar){aviso(pronto.mensagem);return;}
    if(!assinaturaDo('SAIDA')){aviso('O responsável deve assinar a saída antes do motorista.');return;}
    if(assinaturaDo('MOTORISTA')){aviso('O motorista já assinou esta versão do romaneio.');return;}
    if(assinaturaMotoristaPreparando)return;
    assinaturaMotoristaPreparando=true;
    try{
      const args={p_tipo:anterior.tipo,p_id:anterior.id};
      // Hash antes da leitura, nova leitura visual e hash após a leitura.
      // Mudanças concorrentes invalidam a preparação.
      const {data:hashAntes,error:erroAntes}=await db().rpc('atlas_romaneio_preparar_motorista_presencial',args);
      if(erroAntes)throw erroAntes;
      const novo=anterior.tipo==='RP'?await carregarDocumentoRP(anterior.id):await carregarDocumentoPED(anterior.id);
      const {data:hashDepois,error:erroDepois}=await db().rpc('atlas_romaneio_preparar_motorista_presencial',args);
      if(erroDepois)throw erroDepois;
      if(!/^[a-f0-9]{64}$/i.test(String(hashAntes||''))||hashAntes!==hashDepois)
        throw new Error('O documento foi alterado durante a conferência. Atualize e confira novamente.');
      if(documentoAtual!==anterior)throw new Error('O documento mudou durante a conferência. Abra novamente.');
      const conteudoMudou=JSON.stringify(anterior)!==JSON.stringify(novo);
      documentoAtual=novo;
      await obterAssinaturas(novo);
      renderAssinaturas();
      await desenharQRCode(novo);
      if(conteudoMudou){
        aviso('O romaneio foi atualizado. Confira os dados e patrimônios na tela e clique novamente em assinar.');return;
      }
      if(!assinaturaPresencialDisponivel)throw new Error('O serviço de assinatura presencial ficou indisponível.');
      if(!assinaturaDo('SAIDA'))throw new Error('A assinatura de saída precisa estar válida antes da assinatura do motorista.');
      if(assinaturaDo('MOTORISTA'))throw new Error('O motorista já assinou esta versão do documento.');
      assinaturaModal(novo.motorista||'','MOTORISTA',String(hashDepois));
    }catch(e){aviso('Não foi possível preparar a assinatura do motorista: '+(e.message||e));}
    finally{assinaturaMotoristaPreparando=false;}
  }
  async function usarAssinaturaPessoal(){
    if(!assinaturaPerfil||!documentoAtual||!assinaturasAtivas)return;
    const pronto=prontidaoDocumento(documentoAtual);
    if(!pronto.podeAssinar){aviso(pronto.mensagem);return;}
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
    const atual=pad;
    if(atual.documentoTipo!==documentoAtual.tipo||atual.documentoId!==documentoAtual.id){aviso('O documento mudou. Abra a assinatura novamente.');return;}
    const pronto=prontidaoDocumento(documentoAtual);
    if(!pronto.podeAssinar){aviso(pronto.mensagem);return;}
    const motorista=atual.papel==='MOTORISTA';
    if(motorista&&!/^[a-f0-9]{64}$/i.test(atual.hashEsperado||'')){
      aviso('Versão do romaneio não conferida. Feche a assinatura e abra novamente.');return;
    }
    let nome='';
    if(motorista){
      nome=texto(document.getElementById('atlasDocMotoristaNome')?.value).replace(/\s+/g,' ');
      if(nome.length<4||nome.length>120){aviso('Informe o nome completo do motorista (4 a 120 caracteres).');return;}
    }
    const png=atual.c.toDataURL('image/png');
    const botoes=Array.from(document.querySelectorAll('#atlasDocPadOverlay button'));
    botoes.forEach(x=>x.disabled=true);
    try{
      const {error}=motorista
        ? await db().rpc('atlas_romaneio_assinar_motorista_presencial',{p_tipo:documentoAtual.tipo,p_id:documentoAtual.id,p_nome:nome,p_png:png,p_aceite:true,p_hash_esperado:atual.hashEsperado})
        : await db().rpc('atlas_romaneio_assinar_saida',{p_tipo:documentoAtual.tipo,p_id:documentoAtual.id,p_png:png});
      if(error)throw error;
      fecharAssinatura();
      const atualizou=await atualizarAssinaturas();
      if(atualizou){
        avisoSucesso(motorista?'Assinatura presencial do motorista registrada com sucesso!':'Assinatura registrada com sucesso!');
      }else{
        aviso('Assinatura registrada no banco. Reabra o romaneio para conferir os dados atualizados.');
      }
    }catch(e){aviso('Assinatura não registrada: '+(e.message||e));}
    finally{botoes.forEach(x=>x.disabled=false);}
  }

  function fechar(){ document.getElementById("bdrRomaneioFiscal")?.remove(); }
  function imprimir(){
    if(fiscalMudou())return aviso('Existem descontos alterados e ainda não salvos. O Fiscal precisa salvar antes de imprimir.');
    const origem=document.querySelector("#bdrRomaneioFiscal .atlas-doc-printable") || document.querySelector("#bdrRomaneioFiscal .bdr-rom");
    if(!origem) return;

    const copia=origem.cloneNode(true);
    copia.querySelectorAll(".bdr-rom-actions").forEach(el=>el.remove());
    copia.querySelectorAll(".atlas-doc-screen-sign,.atlas-doc-only-screen").forEach(el=>el.remove());
    // Só imprime os valores já confirmados; seletores ficam fora do A4.
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
        .atlas-doc-partes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:9px}.atlas-doc-partes section{border:1px solid #c9d9ed;border-radius:6px;overflow:hidden}.atlas-doc-partes h3{background:#e8f2ff!important;color:#17497e;padding:7px 8px;margin:0;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.atlas-doc-partes p{margin:3px 8px;font-size:8.5px;line-height:1.25;overflow-wrap:anywhere}.atlas-doc-transport{display:grid;grid-template-columns:1fr 1.5fr .85fr;border:1px solid #c9d9ed;border-radius:6px;margin-bottom:13px}.atlas-doc-transport>div{padding:8px}.atlas-doc-transport>div+div{border-left:1px solid #d3e0ec}.atlas-doc-transport b{display:block;font-size:10px;overflow-wrap:anywhere}
        .atlas-doc-table{width:100%;border-collapse:collapse;table-layout:fixed}.atlas-doc-table th{background:#123d70!important;color:white!important;font-size:8.5px;padding:6px 4px;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact}.atlas-doc-table td{font-size:8.5px;padding:5px 4px;border:1px solid #d7e2ef;vertical-align:top;overflow-wrap:anywhere}.atlas-doc-table th:nth-child(1){width:6%}.atlas-doc-table th:nth-child(2){width:18%}.atlas-doc-table th:nth-child(3){width:32%}.atlas-doc-table th:nth-child(4){width:7%}.atlas-doc-table th:nth-child(5){width:6%}.atlas-doc-table th:nth-child(6){width:18%}.atlas-doc-table th:nth-child(7){width:13%}.atlas-doc-table td small{display:block;font-size:8px;color:#556d86;margin-top:3px}.atlas-doc-table thead{display:table-header-group}.atlas-doc-table tr{break-inside:avoid}.atlas-doc-td-num{text-align:center}.atlas-doc-code{font-weight:800}.atlas-doc-price{text-align:right}
        .atlas-doc-total{text-align:right;margin:9px 0 14px;font-size:10px}.atlas-doc-total b{display:inline-block;padding:6px 8px;background:#ecf5ff!important;border-radius:5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .atlas-doc-resumo-fiscal{margin:10px 0 13px;border:1px solid #c8dcea;border-radius:5px;padding:8px 10px;break-inside:avoid}.atlas-doc-resumo-fiscal h3{font-size:10px;margin:0 0 6px}.atlas-doc-resumo-fiscal-valores{display:flex;justify-content:space-between;gap:8px;font-size:9px}.atlas-doc-resumo-fiscal-valores b{display:block}.atlas-doc-resumo-fiscal>small{font-size:7px;line-height:1.3;color:#62758c;display:block;margin-top:6px}.atlas-doc-item-fiscal{display:block;margin-top:3px;font-size:7.5px;color:#12623a}
        .atlas-doc-print-only{display:inline!important}.atlas-doc-only-screen,.atlas-doc-screen-sign{display:none!important}
        .atlas-doc-table-fiscal th:nth-child(1){width:5%}.atlas-doc-table-fiscal th:nth-child(2){width:15%}.atlas-doc-table-fiscal th:nth-child(3){width:24%}.atlas-doc-table-fiscal th:nth-child(4){width:6%}.atlas-doc-table-fiscal th:nth-child(5){width:17%}.atlas-doc-table-fiscal th:nth-child(6){width:11%}.atlas-doc-table-fiscal th:nth-child(7){width:8%}.atlas-doc-table-fiscal th:nth-child(8){width:14%}
        .atlas-doc-table-fiscal th{font-size:7.3px;padding:5px 3px}.atlas-doc-table-fiscal td{font-size:7.5px;padding:5px 3px}.atlas-doc-table-fiscal .atlas-doc-price{white-space:normal;font-variant-numeric:tabular-nums}.atlas-doc-table-fiscal .atlas-doc-price small{font-size:7px}.atlas-doc-table-fiscal tfoot{display:table-footer-group}.atlas-doc-table-fiscal tfoot td{background:#f2f7fd!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:8px;font-size:8px}.atlas-doc-totais-fiscais{display:flex;justify-content:flex-end;gap:15px;align-items:center;flex-wrap:wrap}.atlas-doc-total-destaque{font-weight:800}.atlas-doc-fiscal-situacao,.atlas-doc-fiscal-auditoria{display:block;text-align:right;color:#5c6e82;font-size:7px;margin-top:4px}
        .atlas-doc-print-signatures{border-top:1.5px solid #14549a;padding-top:10px;margin-top:12px;break-inside:avoid}.atlas-doc-print-signatures h3{font-size:12px;margin:0 0 10px}.atlas-doc-print-sign-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.atlas-doc-print-sign{border:1px solid #c9d9ec;border-radius:6px;text-align:center;break-inside:avoid;padding:0 9px 10px}.atlas-doc-print-sign-title{background:#e8f2ff!important;text-align:left;font-weight:800;padding:7px 9px;margin:0 -9px 6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}/* Impressão: linha contínua atrás da assinatura, mesmo quando o PNG tem fundo branco. */
        .atlas-doc-print-sign-image{height:54px;display:flex;align-items:center;justify-content:center;position:relative;isolation:isolate}
        .atlas-doc-print-sign-image::after{content:"";position:absolute;left:18px;right:18px;bottom:0;border-top:1px solid #7d94aa;z-index:0}
        .atlas-doc-print-sign-image img{max-height:54px;max-width:100%;position:relative;z-index:1;mix-blend-mode:multiply}
        .atlas-doc-print-sign-image span{font-size:9px;color:#7d8da2;font-style:italic}
        .atlas-doc-print-sign-line{display:none}
        .atlas-doc-print-sign b,.atlas-doc-print-sign small{display:block;margin:4px 0}.atlas-doc-print-sign small{color:#64788f}
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
    if(r.fiscalNovo)return aviso('Para definir descontos por item, abra o documento de transporte e use a conferência fiscal.');
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
    if(r?.fiscalNovo && !r.fiscalConferido){
      aviso('Antes de registrar a NF-e, o Fiscal precisa salvar a seleção de descontos de todos os itens.');
      return;
    }
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
  global.AtlasRomaneio={__loaded:true,montar,abrir,abrirRemessa,abrirDocumentoPedido,abaDocumento,regularizarFiscalPedido,mostrarDetalhesAssinaturas,atualizarAssinaturas,assinarSaida,assinarMotoristaNesteAparelho,usarAssinaturaPessoal,criarLinkMotorista,copiarLink,copiarDocumento,copiarItensNfe,limparAssinatura,fecharAssinatura,salvarAssinatura,fechar,imprimir,selecionarValor,marcarItemFiscal,marcarTodosFiscal,salvarValoresFiscais,toggleExportar,exportarExcel,exportarWord,abrirTransporte,salvarTransporte,registrarNfe,fecharModalNfe,confirmarNfe,notificarFiscal,garantirSnapshot,buscarSnapshot,carregarDoSnapshot,obterRomaneio};
})(window);
