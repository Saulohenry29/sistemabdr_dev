(()=>{
  "use strict";

  const db=()=>window.BDR?.supabase || window.supabaseClient || window.supabase;

  const usuario=()=>{
    try{
      return JSON.parse(
        localStorage.getItem("usuario_logado") ||
        localStorage.getItem("usuarioLogado") ||
        "null"
      );
    }catch(_){ return null; }
  };

  const perfil=()=>String(usuario()?.perfil_rapido||usuario()?.perfil||"").toUpperCase();
  const owner=()=>Number(usuario()?.id||0)===1 || ["OWNER","MASTER"].includes(perfil());
  const permissoes=()=>String(usuario()?.permissoes||"").toUpperCase();

  function obras(){
    if(owner()) return null;

    const u=usuario()||{};
    let libs=[];

    try{
      const p=JSON.parse(u.obras_liberadas||"[]");
      libs=Array.isArray(p)?p:[];
    }catch(_){
      libs=String(u.obras_liberadas||"").split(/[,;|]/);
    }

    return [...new Set([
      Number(u.obra_id||0),
      ...libs.map(Number)
    ].filter(Boolean))];
  }

  function dias(v){
    if(!v) return null;
    const h=new Date();
    h.setHours(0,0,0,0);
    return Math.ceil((new Date(`${v}T00:00:00`)-h)/86400000);
  }

  async function contarEmManutencao(os){
    let q=db()
      .from("patrimonio")
      .select("id",{count:"exact",head:true})
      .eq("status","MANUTENCAO");

    if(Array.isArray(os)){
      if(!os.length) return 0;
      q=os.length===1 ? q.eq("obra_id",os[0]) : q.in("obra_id",os);
    }

    const {count,error}=await q;
    if(error){
      console.warn("Dashboard manutenção:",error.message);
      return 0;
    }

    return Number(count||0);
  }

  function renderGrafico(vencidas,proximas,emDia){
    const box=document.getElementById("dashManutGrafico");
    if(!box) return;

    const maior=Math.max(1,vencidas,proximas,emDia);
    const pct=v=>Math.max(v>0?6:0,Math.round((v/maior)*100));

    box.innerHTML=`
      <div class="dash-manut-bar-row">
        <span class="label">Vencidas</span>
        <div class="dash-manut-track"><div class="dash-manut-fill danger" style="width:${pct(vencidas)}%"></div></div>
        <span class="dash-manut-value">${vencidas}</span>
      </div>

      <div class="dash-manut-bar-row">
        <span class="label">Próximas</span>
        <div class="dash-manut-track"><div class="dash-manut-fill warning" style="width:${pct(proximas)}%"></div></div>
        <span class="dash-manut-value">${proximas}</span>
      </div>

      <div class="dash-manut-bar-row">
        <span class="label">Em dia</span>
        <div class="dash-manut-track"><div class="dash-manut-fill ok" style="width:${pct(emDia)}%"></div></div>
        <span class="dash-manut-value">${emDia}</span>
      </div>`;
  }

  async function gerarNotificacoes(planos){
    const u=usuario();
    if(!u?.id) return;

    /* MASTER/OWNER recebe; demais só se a preferência estiver habilitada. */
    if(!owner() && !permissoes().includes("NOTIF_MANUTENCAO_PREVENTIVA")) return;

    const criticos=planos.filter(p=>{
      const d=dias(p.proxima_manutencao);
      return d!==null && (d<0 || d<=Number(p.aviso_dias||15));
    });

    if(!criticos.length) return;

    const hoje=new Date().toISOString().slice(0,10);

    for(const p of criticos.slice(0,20)){
      try{
        const {data:existe}=await db()
          .from("notificacoes")
          .select("id")
          .eq("usuario_destino_id",Number(u.id))
          .eq("referencia_tabela","atlas_manutencao_preventiva")
          .eq("referencia_id",Number(p.id))
          .gte("created_at",`${hoje}T00:00:00`)
          .limit(1);

        if(existe?.length) continue;

        const d=dias(p.proxima_manutencao);
        const vencida=d<0;

        await db().from("notificacoes").insert([{
          usuario_destino_id:Number(u.id),
          usuario_destino:u.usuario||u.nome||null,
          obra_id:p.obra_id||null,
          titulo:vencida ? "🔴 Manutenção preventiva vencida" : "🟡 Manutenção preventiva próxima",
          mensagem:vencida
            ? `Existe uma manutenção preventiva vencida há ${Math.abs(d)} dia(s).`
            : `Existe uma manutenção preventiva prevista para daqui a ${d} dia(s).`,
          tipo:"MANUTENCAO_PREVENTIVA",
          lida:false,
          referencia_tabela:"atlas_manutencao_preventiva",
          referencia_id:Number(p.id),
          patrimonio_id:Number(p.patrimonio_id),
          link:"manutencao.html?modo=preventiva"
        }]);
      }catch(e){
        console.warn("Preventiva: notificação não criada",e?.message||e);
      }
    }
  }

  async function carregar(){
    if(!db()) return;

    const os=obras();

    let q=db()
      .from("atlas_manutencao_preventiva")
      .select("id,patrimonio_id,obra_id,ativo,proxima_manutencao,aviso_dias")
      .eq("ativo",true)
      .limit(3000);

    if(Array.isArray(os)){
      if(!os.length) return;
      q=os.length===1 ? q.eq("obra_id",os[0]) : q.in("obra_id",os);
    }

    const [{data,error},emManutencao]=await Promise.all([
      q,
      contarEmManutencao(os)
    ]);

    if(error){
      console.warn("Dashboard preventiva:",error.message);
      return;
    }

    const planos=data||[];

    const vencidas=planos.filter(p=>{
      const d=dias(p.proxima_manutencao);
      return d!==null && d<0;
    }).length;

    const proximas=planos.filter(p=>{
      const d=dias(p.proxima_manutencao);
      return d!==null && d>=0 && d<=Number(p.aviso_dias||15);
    }).length;

    const emDia=Math.max(0,planos.length-vencidas-proximas);

    renderGrafico(vencidas,proximas,emDia);

    const agora=document.getElementById("dashManutAgora");
    if(agora) agora.textContent=emManutencao;

    await gerarNotificacoes(planos);
  }

  window.addEventListener("load",()=>setTimeout(carregar,900));
})();