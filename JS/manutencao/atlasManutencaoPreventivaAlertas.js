(()=>{
  "use strict";

  if(window.AtlasPreventivaAlertas?.__loaded) return;

  const INTERVALO_MS=30000;
  let timer=null;
  let executando=false;

  const db=()=>window.BDR?.supabase || window.supabaseClient || window.supabase;

  function usuario(){
    try{
      return JSON.parse(
        localStorage.getItem("usuario_logado") ||
        localStorage.getItem("usuarioLogado") ||
        localStorage.getItem("usuarioAtual") ||
        "null"
      );
    }catch(_){ return null; }
  }

  function tokensPermissao(){
    return String(usuario()?.permissoes||"")
      .toUpperCase()
      .split(/[;,|]/)
      .map(x=>x.trim())
      .filter(Boolean);
  }

  function podeReceber(){
    const u=usuario();
    if(!u?.id) return false;
    const perfil=String(u.perfil_rapido||u.perfil||"").toUpperCase();
    return Number(u.id)===1 ||
           ["OWNER","MASTER"].includes(perfil) ||
           tokensPermissao().includes("NOTIF_MANUTENCAO_PREVENTIVA");
  }

  function normalizarObras(valor){
    if(valor==null||valor==="") return [];
    let v=valor;
    if(typeof v==="string"){
      try{
        const parsed=JSON.parse(v);
        v=Array.isArray(parsed)?parsed:v.split(/[,;|]/);
      }catch(_){
        v=v.split(/[,;|]/);
      }
    }
    if(!Array.isArray(v)) v=[v];
    return [...new Set(v.map(x=>Number(x?.id??x?.obra_id??x)).filter(Number.isFinite))];
  }

  function obrasPermitidas(){
    const u=usuario()||{};
    const perfil=String(u.perfil_rapido||u.perfil||"").toUpperCase();
    if(Number(u.id)===1 || ["OWNER","MASTER"].includes(perfil)) return null;

    return [...new Set([
      Number(u.obra_id||0),
      ...normalizarObras(u.obras_liberadas)
    ].filter(Boolean))];
  }

  function formatarDataHora(valor){
    const d=new Date(valor);
    if(Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("pt-BR",{
      day:"2-digit",month:"2-digit",year:"numeric",
      hour:"2-digit",minute:"2-digit"
    });
  }

  async function patrimonioMap(planos){
    const ids=[...new Set(planos.map(p=>Number(p.patrimonio_id)).filter(Boolean))];
    if(!ids.length) return new Map();

    const {data,error}=await db()
      .from("patrimonio")
      .select("id,codigo_qr,codigo_antigo,nome_bem,marca,modelo,placa")
      .in("id",ids);

    if(error){
      console.warn("Preventiva Alertas: patrimônio não carregado",error.message);
      return new Map();
    }

    return new Map((data||[]).map(p=>[Number(p.id),p]));
  }

  async function jaNotificado(u,plano){
    const inicioCiclo=plano.aviso_programado_em || plano.proxima_manutencao_em;
    let q=db()
      .from("notificacoes")
      .select("id")
      .eq("usuario_destino_id",Number(u.id))
      .eq("referencia_tabela","atlas_manutencao_preventiva")
      .eq("referencia_id",Number(plano.id))
      .limit(1);

    if(inicioCiclo){
      q=q.gte("created_at",inicioCiclo);
    }

    const {data,error}=await q;
    if(error){
      console.warn("Preventiva Alertas: deduplicação",error.message);
      return false;
    }
    return !!data?.length;
  }

  async function criarNotificacao(u,plano,pat){
    if(await jaNotificado(u,plano)) return false;

    const manut=new Date(plano.proxima_manutencao_em);
    const vencida=!Number.isNaN(manut.getTime()) && manut.getTime()<Date.now();

    const codigo=pat?.codigo_qr || pat?.codigo_antigo || `#${plano.patrimonio_id}`;
    const nome=pat?.nome_bem || [pat?.marca,pat?.modelo].filter(Boolean).join(" ") || "Patrimônio";
    const placa=pat?.placa ? ` • Placa ${pat.placa}` : "";
    const servico=plano.descricao_servico || "Manutenção preventiva";

    const payload={
      usuario_destino_id:Number(u.id),
      usuario_destino:u.usuario||u.nome||null,
      obra_id:plano.obra_id||null,
      titulo:vencida ? "🔴 Preventiva vencida" : "🟡 Lembrete de manutenção preventiva",
      mensagem:`${codigo} • ${nome}${placa} • ${servico} • Programada: ${formatarDataHora(plano.proxima_manutencao_em)}`,
      tipo:"MANUTENCAO_PREVENTIVA",
      lida:false,
      referencia_tabela:"atlas_manutencao_preventiva",
      referencia_id:Number(plano.id),
      patrimonio_id:Number(plano.patrimonio_id),
      link:"manutencao.html?modo=preventiva"
    };

    const {error}=await db().from("notificacoes").insert([payload]);
    if(error){
      console.warn("Preventiva Alertas: notificação não criada",error.message);
      return false;
    }

    document.dispatchEvent(new CustomEvent("atlas:notificacoes:atualizar"));
    return true;
  }

  async function verificarAgora(){
    if(executando || !document.body || !db() || !podeReceber()) return;
    executando=true;

    try{
      const u=usuario();
      const agora=new Date().toISOString();

      let q=db()
        .from("atlas_manutencao_preventiva")
        .select("id,patrimonio_id,obra_id,ativo,descricao_servico,proxima_manutencao_em,aviso_programado_em")
        .eq("ativo",true)
        .not("aviso_programado_em","is",null)
        .lte("aviso_programado_em",agora)
        .order("aviso_programado_em",{ascending:true})
        .limit(30);

      const obras=obrasPermitidas();
      if(Array.isArray(obras)){
        if(!obras.length) return;
        q=obras.length===1 ? q.eq("obra_id",obras[0]) : q.in("obra_id",obras);
      }

      const {data,error}=await q;
      if(error){
        console.warn("Preventiva Alertas:",error.message);
        return;
      }

      const planos=data||[];
      if(!planos.length) return;

      const pats=await patrimonioMap(planos);

      for(const plano of planos){
        await criarNotificacao(u,plano,pats.get(Number(plano.patrimonio_id)));
      }
    }finally{
      executando=false;
    }
  }

  function iniciar(){
    clearInterval(timer);
    verificarAgora();
    timer=setInterval(verificarAgora,INTERVALO_MS);

    window.addEventListener("focus",verificarAgora);
    document.addEventListener("visibilitychange",()=>{
      if(!document.hidden) verificarAgora();
    });
  }

  window.AtlasPreventivaAlertas={
    __loaded:true,
    verificarAgora
  };

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",iniciar,{once:true});
  }else{
    iniciar();
  }

  console.log("✅ ATLAS PREVENTIVA ALERTAS carregado — verificação a cada 30s");
})();