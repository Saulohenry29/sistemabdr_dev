(()=>{
  "use strict";

  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const db=()=>window.BDR?.supabase || window.supabaseClient || window.supabase;
  const usuario=()=>{
    try{
      return JSON.parse(
        localStorage.getItem("usuario_logado") ||
        localStorage.getItem("usuarioLogado") ||
        localStorage.getItem("usuarioAtual") ||
        "null"
      );
    }catch(_){ return null; }
  };
  const perms=()=>String(usuario()?.permissoes||"").toUpperCase();
  const perfil=()=>String(usuario()?.perfil_rapido||usuario()?.perfil||"").toUpperCase();
  const owner=()=>Number(usuario()?.id||0)===1 || ["OWNER","MASTER"].includes(perfil());
  const podeGerenciar=()=>owner() || perms().split(/[;,|]/).map(x=>x.trim()).includes("MANUTENCAO_PREVENTIVA_GERENCIAR");

  const state={
    planos:[],
    patrimonios:[],
    filtro:"",
    status:"TODOS"
  };

  function normalizarObras(valor){
    if(valor==null||valor==="") return [];
    let v=valor;
    if(typeof v==="string"){
      try{ const p=JSON.parse(v); v=Array.isArray(p)?p:v.split(/[,;|]/); }
      catch(_){ v=v.split(/[,;|]/); }
    }
    if(!Array.isArray(v)) v=[v];
    return [...new Set(v.map(x=>Number(x?.id??x?.obra_id??x)).filter(Number.isFinite))];
  }

  function obrasPermitidas(){
    if(owner()) return null;
    const u=usuario()||{};
    return [...new Set([
      Number(u.obra_id||0),
      ...normalizarObras(u.obras_liberadas)
    ].filter(Boolean))];
  }

  function parseMomento(valor,dataFallback=null){
    if(valor){
      const d=new Date(valor);
      if(!Number.isNaN(d.getTime())) return d;
    }
    if(dataFallback){
      const d=new Date(`${dataFallback}T23:59:00`);
      if(!Number.isNaN(d.getTime())) return d;
    }
    return null;
  }

  function momentoManutencao(p){
    return parseMomento(p.proxima_manutencao_em,p.proxima_manutencao);
  }

  function momentoAviso(p){
    return parseMomento(p.aviso_programado_em,null);
  }

  function statusPlano(p){
    if(!p.ativo) return {key:"INATIVO",label:"Inativo",cls:"off",momento:null};

    const manut=momentoManutencao(p);
    if(!manut) return {key:"SEM_DATA",label:"Sem data",cls:"off",momento:null};

    const agora=new Date();
    if(manut.getTime() < agora.getTime()){
      const min=Math.max(1,Math.floor((agora-manut)/60000));
      if(min < 60) return {key:"VENCIDA",label:`Vencida há ${min} min`,cls:"danger",momento:manut};
      const horas=Math.floor(min/60);
      if(horas < 24) return {key:"VENCIDA",label:`Vencida há ${horas} h`,cls:"danger",momento:manut};
      return {key:"VENCIDA",label:`Vencida há ${Math.floor(horas/24)} dia(s)`,cls:"danger",momento:manut};
    }

    const aviso=momentoAviso(p);
    const mesmaData=manut.toDateString()===agora.toDateString();

    if(aviso && agora.getTime() >= aviso.getTime()){
      return {
        key:mesmaData?"HOJE":"PROXIMA",
        label:mesmaData?"Hoje":"Próxima",
        cls:"warning",
        momento:manut
      };
    }

    if(mesmaData){
      return {key:"HOJE",label:"Hoje",cls:"warning",momento:manut};
    }

    return {key:"EM_DIA",label:"Em dia",cls:"ok",momento:manut};
  }

  function dataHoraBR(valor,dataFallback=null){
    const d=parseMomento(valor,dataFallback);
    if(!d) return "-";
    return d.toLocaleString("pt-BR",{
      day:"2-digit",month:"2-digit",year:"numeric",
      hour:"2-digit",minute:"2-digit"
    });
  }

  function inputDateTimeLocal(valor,dataFallback=null){
    const d=parseMomento(valor,dataFallback);
    if(!d) return "";
    const z=n=>String(n).padStart(2,"0");
    return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
  }

  function isoDoInput(valor){
    if(!valor) return null;
    const d=new Date(valor);
    if(Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function patrimonioDoPlano(p){
    return state.patrimonios.find(x=>String(x.id)===String(p.patrimonio_id)) || {};
  }

  function periodo(p){
    if(Number(p.periodicidade_meses||0)>0) return `A cada ${p.periodicidade_meses} mês(es)`;
    if(Number(p.periodicidade_dias||0)>0) return `A cada ${p.periodicidade_dias} dia(s)`;
    return "Sem periodicidade";
  }

  async function carregarDados(){
    if(!db()) throw new Error("Supabase não carregado.");

    let pq=db().from("patrimonio")
      .select("id,codigo_qr,codigo_antigo,nome_bem,marca,modelo,obra_id,empresa_id,localizacao,status")
      .neq("status","BAIXADO")
      .order("nome_bem",{ascending:true})
      .limit(3000);

    const obras=obrasPermitidas();
    if(Array.isArray(obras)){
      if(!obras.length){ state.patrimonios=[]; state.planos=[]; render(); return; }
      pq=obras.length===1 ? pq.eq("obra_id",obras[0]) : pq.in("obra_id",obras);
    }

    let plq=db().from("atlas_manutencao_preventiva")
      .select("*")
      .order("proxima_manutencao",{ascending:true,nullsFirst:false})
      .limit(3000);

    if(Array.isArray(obras)){
      plq=obras.length===1 ? plq.eq("obra_id",obras[0]) : plq.in("obra_id",obras);
    }

    const [pat,plan]=await Promise.all([pq,plq]);
    if(pat.error) throw pat.error;
    if(plan.error) throw plan.error;

    state.patrimonios=pat.data||[];
    state.planos=plan.data||[];
    render();
    await gerarAlertaDoUsuario();
  }

  function resumo(){
    const ativos=state.planos.filter(p=>p.ativo);
    return {
      total:ativos.length,
      emDia:ativos.filter(p=>statusPlano(p).key==="EM_DIA").length,
      hoje:ativos.filter(p=>statusPlano(p).key==="HOJE").length,
      proximas:ativos.filter(p=>statusPlano(p).key==="PROXIMA").length,
      vencidas:ativos.filter(p=>statusPlano(p).key==="VENCIDA").length,
      semPlano:Math.max(0,state.patrimonios.length-ativos.length)
    };
  }

  function listaFiltrada(){
    const termo=state.filtro.trim().toLowerCase();
    return state.planos.filter(p=>{
      const pat=patrimonioDoPlano(p);
      const st=statusPlano(p);
      const texto=[
        pat.codigo_qr,pat.codigo_antigo,pat.nome_bem,pat.marca,pat.modelo,
        p.descricao_servico,p.observacao
      ].join(" ").toLowerCase();
      return (!termo||texto.includes(termo)) &&
             (state.status==="TODOS"||st.key===state.status);
    });
  }

  function render(){
    const app=$("#atlasManutPreventivaApp");
    if(!app) return;

    const r=resumo();
    const lista=listaFiltrada();
    const badge=$("#manutPrevBadge");
    if(badge){
      const criticos=r.vencidas+r.hoje+r.proximas;
      badge.hidden=!criticos;
      badge.textContent=criticos;
    }

    app.innerHTML=`
      <div class="atlas-prev-shell">
        <div class="atlas-prev-top">
          <div>
            <h2>🗓 Manutenção preventiva</h2>
            <p>Planeje revisões antes da falha e acompanhe o que está próximo ou vencido.</p>
          </div>
          ${podeGerenciar()?`<button class="atlas-prev-btn primary" id="btnNovoPlanoPrev" type="button"><i class="fa-solid fa-plus"></i> Novo plano</button>`:""}
        </div>

        <div class="atlas-prev-kpis">
          <div class="atlas-prev-kpi"><strong>${r.hoje}</strong><span>Hoje</span></div>
          <div class="atlas-prev-kpi"><strong>${r.proximas}</strong><span>Próximas</span></div>
          <div class="atlas-prev-kpi"><strong>${r.vencidas}</strong><span>Vencidas</span></div>
          <div class="atlas-prev-kpi"><strong>${r.emDia}</strong><span>Em dia</span></div>
          <div class="atlas-prev-kpi"><strong>${r.semPlano}</strong><span>Sem plano</span></div>
        </div>

        <div class="atlas-prev-toolbar">
          <input id="buscaPreventiva" value="${esc(state.filtro)}" placeholder="Buscar patrimônio, código ou serviço...">
          <select id="filtroPreventivaStatus">
            <option value="TODOS" ${state.status==="TODOS"?"selected":""}>Todos os status</option>
            <option value="HOJE" ${state.status==="HOJE"?"selected":""}>Hoje</option>
            <option value="VENCIDA" ${state.status==="VENCIDA"?"selected":""}>Vencidas</option>
            <option value="PROXIMA" ${state.status==="PROXIMA"?"selected":""}>Próximas</option>
            <option value="EM_DIA" ${state.status==="EM_DIA"?"selected":""}>Em dia</option>
            <option value="INATIVO" ${state.status==="INATIVO"?"selected":""}>Inativas</option>
          </select>
          <button class="atlas-prev-btn" id="btnAtualizarPrev" type="button"><i class="fa-solid fa-rotate"></i> Atualizar</button>
        </div>

        <div class="atlas-prev-list">
          ${lista.length?lista.map(p=>linhaPlano(p)).join(""):`<div class="atlas-prev-empty"><b>Nenhum plano encontrado.</b><br>Cadastre o primeiro plano preventivo para começar.</div>`}
        </div>
      </div>`;

    $("#btnNovoPlanoPrev")?.addEventListener("click",()=>abrirPlano());
    $("#btnAtualizarPrev")?.addEventListener("click",()=>carregarDados().catch(erro));
    $("#buscaPreventiva")?.addEventListener("input",e=>{state.filtro=e.target.value;render();});
    $("#filtroPreventivaStatus")?.addEventListener("change",e=>{state.status=e.target.value;render();});

    app.querySelectorAll("[data-prev-editar]").forEach(b=>b.onclick=()=>abrirPlano(Number(b.dataset.prevEditar)));
    app.querySelectorAll("[data-prev-realizar]").forEach(b=>b.onclick=()=>realizar(Number(b.dataset.prevRealizar)));
    app.querySelectorAll("[data-prev-toggle]").forEach(b=>b.onclick=()=>alternar(Number(b.dataset.prevToggle)));
  }

  function linhaPlano(p){
    const pat=patrimonioDoPlano(p);
    const st=statusPlano(p);
    return `
      <div class="atlas-prev-row">
        <div class="atlas-prev-item">
          <strong>${esc(pat.nome_bem||"Patrimônio")}</strong>
          <small>${esc(pat.codigo_qr||pat.codigo_antigo||"#"+p.patrimonio_id)} • ${esc(pat.localizacao||"Obra "+(p.obra_id||"-"))}</small>
        </div>
        <div class="atlas-prev-item atlas-prev-period">
          <strong>${esc(p.descricao_servico||"Revisão preventiva")}</strong>
          <small>${esc(periodo(p))} • aviso ${Number(p.aviso_dias||15)} dia(s) antes</small>
        </div>
        <div class="atlas-prev-date">
          <strong>${dataHoraBR(p.proxima_manutencao_em,p.proxima_manutencao)}</strong>
          <small>Aviso: ${dataHoraBR(p.aviso_programado_em)}</small>
        </div>
        <div><span class="atlas-prev-status ${st.cls}">${esc(st.label)}</span></div>
        <div class="atlas-prev-actions">
          ${p.ativo?`<button class="atlas-prev-btn primary" data-prev-realizar="${p.id}" type="button">Realizar</button>`:""}
          ${podeGerenciar()?`
            <button class="atlas-prev-btn" data-prev-editar="${p.id}" type="button">Editar</button>
            <button class="atlas-prev-btn ${p.ativo?"danger":""}" data-prev-toggle="${p.id}" type="button">${p.ativo?"Pausar":"Ativar"}</button>`:""}
        </div>
      </div>`;
  }

  function modalBase(){
    const bg=document.createElement("div");
    bg.className="atlas-prev-modal-bg";
    bg.innerHTML=`<div class="atlas-prev-modal">
      <button class="atlas-prev-close" type="button" data-close>X</button>
      <h3>Plano de manutenção preventiva</h3>
      <p>Configure quando o Atlas deve avisar que este patrimônio precisa de revisão.</p>
      <div id="prevModalConteudo"></div>
    </div>`;
    document.body.appendChild(bg);
    const fechar=()=>bg.remove();
    bg.querySelector("[data-close]").onclick=fechar;
    bg.onclick=e=>{if(e.target===bg)fechar();};
    const escKey=e=>{if(e.key==="Escape"){document.removeEventListener("keydown",escKey);fechar();}};
    document.addEventListener("keydown",escKey);
    return bg;
  }

  function abrirPlano(id=null){
    if(!podeGerenciar()) return;
    const plano=id?state.planos.find(x=>Number(x.id)===Number(id)):null;
    const bg=modalBase();
    const box=$("#prevModalConteudo",bg);

    const options=state.patrimonios.map(p=>
      `<option value="${p.id}" ${plano&&Number(plano.patrimonio_id)===Number(p.id)?"selected":""}>${esc(p.codigo_qr||p.codigo_antigo||"#"+p.id)} - ${esc(p.nome_bem||"-")}</option>`
    ).join("");

    box.innerHTML=`
      <div class="atlas-prev-form">
        <label class="wide">Patrimônio *
          <select id="prevPatrimonio" ${plano?"disabled":""}>
            <option value="">Selecione...</option>
            ${options}
          </select>
        </label>
        <label>Periodicidade em meses
          <input id="prevMeses" type="number" min="0" step="1" value="${Number(plano?.periodicidade_meses||6)}">
        </label>
        <label>Ou periodicidade em dias
          <input id="prevDias" type="number" min="0" step="1" value="${Number(plano?.periodicidade_dias||0)}">
        </label>
        <label>Última manutenção
          <input id="prevUltima" type="date" value="${esc(plano?.ultima_manutencao||"")}">
        </label>
        <label>Data e hora da manutenção *
          <input id="prevProxima" type="datetime-local"
                 value="${esc(inputDateTimeLocal(plano?.proxima_manutencao_em,plano?.proxima_manutencao))}">
        </label>
        <label>Data e hora do aviso *
          <input id="prevAvisoEm" type="datetime-local"
                 value="${esc(inputDateTimeLocal(plano?.aviso_programado_em))}">
        </label>
        <label class="wide">Serviço previsto
          <input id="prevServico" value="${esc(plano?.descricao_servico||"Revisão preventiva")}" placeholder="Ex.: troca de óleo, filtros e inspeção">
        </label>
        <label class="wide">Observação
          <textarea id="prevObs">${esc(plano?.observacao||"")}</textarea>
        </label>
      </div>
      <div class="atlas-prev-note">Escolha a data/hora do serviço e a data/hora exata em que o Atlas deve avisar. O aviso pode ser no mesmo dia ou vários dias antes.</div>
      <div class="atlas-prev-modal-actions">
        <button class="atlas-prev-btn" type="button" data-cancel>Cancelar</button>
        <button class="atlas-prev-btn primary" type="button" data-save>Salvar plano</button>
      </div>`;

    bg.querySelector("[data-cancel]").onclick=()=>bg.remove();

    bg.querySelector("[data-save]").onclick=async()=>{
      const patrimonioId=Number($("#prevPatrimonio",bg).value||plano?.patrimonio_id||0);
      const pat=state.patrimonios.find(x=>Number(x.id)===patrimonioId);
      const proximaLocal=$("#prevProxima",bg).value;
      const avisoLocal=$("#prevAvisoEm",bg).value;
      if(!patrimonioId || !pat){ alert("Selecione o patrimônio."); return; }
      if(!proximaLocal){ alert("Informe a data e hora da manutenção."); return; }
      if(!avisoLocal){ alert("Informe a data e hora do aviso."); return; }

      const proximaISO=isoDoInput(proximaLocal);
      const avisoISO=isoDoInput(avisoLocal);

      if(!proximaISO || !avisoISO){
        alert("Data ou hora inválida.");
        return;
      }

      if(new Date(avisoISO).getTime() > new Date(proximaISO).getTime()){
        alert("O aviso precisa acontecer antes ou no mesmo momento da manutenção.");
        return;
      }

      const payload={
        patrimonio_id:patrimonioId,
        empresa_id:pat.empresa_id||null,
        obra_id:pat.obra_id||null,
        ativo:true,
        criterio:"DATA",
        periodicidade_meses:Number($("#prevMeses",bg).value||0),
        periodicidade_dias:Number($("#prevDias",bg).value||0),
        aviso_dias:0,
        ultima_manutencao:$("#prevUltima",bg).value||null,
        proxima_manutencao:proximaLocal.slice(0,10),
        proxima_manutencao_em:proximaISO,
        aviso_programado_em:avisoISO,
        descricao_servico:$("#prevServico",bg).value.trim()||"Revisão preventiva",
        observacao:$("#prevObs",bg).value.trim()||null,
        criado_por:usuario()?.nome||usuario()?.usuario||"SISTEMA",
        atualizado_em:new Date().toISOString()
      };

      let q;
      if(plano){
        q=db().from("atlas_manutencao_preventiva").update(payload).eq("id",plano.id);
      }else{
        q=db().from("atlas_manutencao_preventiva").insert([payload]);
      }
      const {error}=await q;
      if(error){ erro(error); return; }
      bg.remove();
      await carregarDados();
    };
  }

  async function alternar(id){
    if(!podeGerenciar()) return;
    const p=state.planos.find(x=>Number(x.id)===Number(id));
    if(!p) return;
    const {error}=await db().from("atlas_manutencao_preventiva")
      .update({ativo:!p.ativo,atualizado_em:new Date().toISOString()})
      .eq("id",p.id);
    if(error){erro(error);return;}
    await carregarDados();
  }

  async function realizar(id){
    const plano=state.planos.find(x=>Number(x.id)===Number(id));
    const pat=plano?patrimonioDoPlano(plano):null;
    if(!plano||!pat?.id) return;
    if(!window.AtlasManutencao?.abrirPreventiva){
      erro(new Error("Rotina de manutenção ainda não carregou."));
      return;
    }
    window.AtlasManutencao.abrirPreventiva(pat,plano);
  }

  async function gerarAlertaDoUsuario(){
    try{
      await window.AtlasPreventivaAlertas?.verificarAgora?.();
    }catch(e){
      console.warn("Atlas Preventiva: verificação de alerta não concluída",e?.message||e);
    }
  }

  function erro(e){
    console.error(e);
    const msg=e?.message||String(e||"Erro na manutenção preventiva.");
    alert(msg.includes("atlas_manutencao_preventiva")
      ? "A estrutura da manutenção preventiva ainda não foi criada. Execute SQL/atlas_manutencao_preventiva.sql no Supabase."
      : msg);
  }

  function alternarModo(modo){
    const ordens=$("#atlasManutOrdensArea");
    const prev=$("#atlasManutPreventivaArea");
    const bOrd=$("#btnManutModoOrdens");
    const bPrev=$("#btnManutModoPreventivas");
    const ativaPrev=modo==="PREVENTIVAS";

    if(ordens) ordens.hidden=ativaPrev;
    if(prev) prev.hidden=!ativaPrev;
    bOrd?.classList.toggle("active",!ativaPrev);
    bPrev?.classList.toggle("active",ativaPrev);

    if(ativaPrev && !state.planos.length){
      carregarDados().catch(erro);
    }
  }

  function iniciar(){
    const btnPrev=$("#btnManutModoPreventivas");
    const btnOrd=$("#btnManutModoOrdens");
    if(!btnPrev||!btnOrd) return;

    btnPrev.onclick=()=>alternarModo("PREVENTIVAS");
    btnOrd.onclick=()=>alternarModo("ORDENS");

    if(String(new URLSearchParams(location.search).get("modo")||"").toLowerCase()==="preventiva"){
      alternarModo("PREVENTIVAS");
    }else{
      carregarDados().catch(e=>console.warn("Atlas Preventiva:",e?.message||e));
    }
  }

  window.AtlasManutencaoPreventiva={carregar:carregarDados,abrirPlano,statusPlano};

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",iniciar,{once:true});
  }else{
    iniciar();
  }

  console.log("✅ ATLAS MANUTENÇÃO PREVENTIVA carregada");
})();