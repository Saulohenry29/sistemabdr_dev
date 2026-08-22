async function carregarTodosPatrimoniosDashboard(){
  const todos = [];
  const tamanhoPagina = 1000;
  let inicio = 0;

  while(true){
    const resposta = await db()
      .from("patrimonio")
      .select("*")
      .order("id", { ascending:false })
      .range(inicio, inicio + tamanhoPagina - 1);

    if(resposta.error){
      return { data:todos, error:resposta.error };
    }

    const lote = Array.isArray(resposta.data) ? resposta.data : [];
    todos.push(...lote);

    if(lote.length < tamanhoPagina) break;
    inicio += tamanhoPagina;

    // Trava defensiva: evita laço infinito em caso de resposta anômala.
    if(inicio > 100000) break;
  }

  return { data:todos, error:null };
}

async function carregarDados(){
  const usuario = usuarioAtual();

  document.getElementById("usuarioNome").innerText =
    usuario ? "Olá, " + usuario.nome : "Olá, usuário";

  document.getElementById("usuarioPerfil").innerText =
    usuario ? usuario.perfil || "-" : "-";

  /*
    O dropdown do usuário foi simplificado e não possui mais
    usuarioNomeMenu/usuarioPerfilMenu. Mantemos compatibilidade caso
    alguma versão futura volte a exibir esses campos.
  */
  const usuarioNomeMenu = document.getElementById("usuarioNomeMenu");
  if(usuarioNomeMenu){
    usuarioNomeMenu.innerText =
      usuario ? usuario.nome || "Usuário" : "Usuário";
  }

  const usuarioPerfilMenu = document.getElementById("usuarioPerfilMenu");
  if(usuarioPerfilMenu){
    usuarioPerfilMenu.innerText =
      usuario ? usuario.perfil || "-" : "-";
  }

  document.getElementById("ultimaAtualizacao").innerText =
    new Date().toLocaleString("pt-BR");

  if(!db()){
    alert("Supabase não carregado.");
    return;
  }

  const patResp = await carregarTodosPatrimoniosDashboard();
  const obrasResp = await db().from("obras").select("*").order("nome");
  const movResp = await db().from("movimentacoes").select("*").order("id",{ascending:false}).limit(200);

  if(patResp.error){
    alert("Erro ao carregar patrimônios: " + patResp.error.message);
    return;
  }

  patrimonios = patResp.data || [];
  obras = obrasResp.data || [];
  movimentacoes = movResp.data || [];

  /*
     ESCOPO OFICIAL DO DASHBOARD
     - OWNER id=1: todas as obras.
     - TODAS_OBRAS_VER: todas as obras.
     - Demais usuários: obra principal + obras_liberadas.
     - Não depende mais da antiga PROPRIA_OBRA_VER.
  */
  const podeVerTodas = usuarioPodeVerTodasObrasBDR(usuario);

  if(usuario && !podeVerTodas){
    const obrasPermitidas = obrasPermitidasDashboardBDR(usuario);
    const permitidas = new Set(obrasPermitidas.map(String));

    if(permitidas.size){
      patrimonios = patrimonios.filter(p =>
        permitidas.has(String(p.obra_id))
      );

      movimentacoes = movimentacoes.filter(m =>
        permitidas.has(String(m.obra_origem_id)) ||
        permitidas.has(String(m.obra_destino_id))
      );

      /*
        O filtro de obras do próprio Dashboard também mostra somente
        as obras que este usuário realmente pode consultar.
      */
      obras = obras.filter(o => permitidas.has(String(o.id)));
    }else{
      patrimonios = [];
      movimentacoes = [];
      obras = [];
    }
  }

  aplicarMenuPorPermissaoBDR();
  aplicarVisibilidadeValoresBDR();

  carregarFiltros();
  aplicarFiltros();

  console.log("BDR Dashboard OK:", {
    patrimonios: patrimonios.length,
    ativos_dashboard: patrimonios.filter(p => p.ativo !== false).length,
    obras: obras.length,
    movimentacoes: movimentacoes.length,
    valor_total_geral: patrimonios.reduce((s,p) => s + valorPatrimonio(p), 0),
    frota: patrimonios.filter(p => {
      const obra = obras.find(o => String(o.id) === String(p.obra_id));
      return String(obra?.codigo_obra || "").trim() === "04";
    }).length
  });
}
