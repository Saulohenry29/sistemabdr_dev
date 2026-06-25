/* =========================================================
   BDR OWNER CORE V8 - MODAL PREMIUM COMPACTO
   - abre com 10 cliques no escudo do card Atenção Master
   - lista registros automaticamente por aba
   - busca em um campo só
   - editar / desativar / apagar com confirmação
========================================================= */

console.log("🛡️ BDR OWNER CORE V8 carregado - busca automática + reativar");

/* ALTERE AQUI */
const BDR_OWNER_LOGIN = "saulo";
const BDR_OWNER_SENHA = "852410";
const BDR_OWNER_CLIQUES = 5;
const BDR_OWNER_TEMPO = 6000;

let bdrOwnerCliques = 0;
let bdrOwnerTimer = null;
let bdrOwnerAreaAtual = "patrimonio";
let bdrOwnerRegistros = [];
let bdrOwnerSelecionado = null;
let bdrOwnerBuscaTimer = null;

const BDR_OWNER_AREAS = {
  patrimonio: {
    titulo: "Patrimônios",
    icone: "fa-tags",
    tabela: "patrimonio",
    ordem: "id",
    exemplo: "PAT-100130014",
    busca: ["codigo_qr", "nome_bem", "modelo", "marca", "localizacao", "status"],
    campos: ["id", "codigo_qr", "nome_bem", "modelo", "localizacao", "status"],
    destaque: "codigo_qr"
  },
  produtos: {
    titulo: "Produtos / Insumos",
    icone: "fa-box-open",
    tabela: "produtos",
    ordem: "id",
    exemplo: "FURADEIRA ou 505",
    busca: ["codigo", "descricao", "nome", "categoria", "unidade"],
    campos: ["id", "codigo", "descricao", "nome", "categoria", "unidade"],
    destaque: "descricao"
  },
  empresas: {
    titulo: "Empresas",
    icone: "fa-building",
    tabela: "empresas",
    ordem: "id",
    exemplo: "BDR CONSTRUART",
    busca: ["nome", "razao_social", "cnpj", "codigo_empresa"],
    campos: ["id", "nome", "razao_social", "cnpj", "codigo_empresa", "ativo"],
    destaque: "nome"
  },
  obras: {
    titulo: "Obras / Setores",
    icone: "fa-city",
    tabela: "obras",
    ordem: "id",
    exemplo: "10013 - CD CENTRO DE DISTRIBUIÇÃO",
    busca: ["codigo_obra", "nome", "tipo", "codigo_sienge"],
    campos: ["id", "codigo_obra", "nome", "tipo", "codigo_sienge", "ativo"],
    destaque: "nome"
  },
  movimentacoes: {
    titulo: "Movimentações",
    icone: "fa-right-left",
    tabela: "movimentacoes",
    ordem: "id",
    exemplo: "PAT-100130014",
    busca: ["codigo_qr", "tipo", "status_anterior", "status_novo", "observacao"],
    campos: ["id", "codigo_qr", "tipo", "status_anterior", "status_novo", "observacao"],
    destaque: "codigo_qr"
  },
  relatorios: {
    titulo: "Relatórios / Analytics",
    icone: "fa-chart-line",
    tabela: "analytics_patrimonio",
    ordem: "id",
    exemplo: "PAT-100130014 ou MOVIMENTACAO",
    busca: ["tipo_evento", "status_anterior", "status_novo", "observacao", "local_novo"],
    campos: ["id", "tipo_evento", "status_anterior", "status_novo", "local_novo", "observacao"],
    destaque: "tipo_evento"
  },
  logs: {
    titulo: "Logs / Auditoria",
    icone: "fa-clipboard-list",
    tabela: "logs_sistema",
    ordem: "id",
    exemplo: "Saulo, edição, exclusão",
    busca: ["acao", "tabela", "usuario", "motivo", "descricao"],
    campos: ["id", "acao", "tabela", "usuario", "motivo", "created_at"],
    destaque: "acao"
  },
  perfis: {
    titulo: "Perfis rápidos",
    icone: "fa-user-shield",
    tabela: "perfis_rapidos",
    ordem: "id",
    exemplo: "CONFERENCIA, ADMIN, FINANCEIRO",
    busca: ["nome", "descricao", "permissoes"],
    campos: ["id", "nome", "descricao", "permissoes", "ativo", "created_at"],
    destaque: "nome"
  }
};

function bdrOwnerDB(){
  return window.client || window.supabaseClient || window.clientSupabase || null;
}

function bdrOwnerUsuarioLocal(){
  try{
    return JSON.parse(localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado") || "{}");
  }catch(e){
    return {};
  }
}

function bdrOwnerLoginAtual(){
  const u = bdrOwnerUsuarioLocal();
  return String(u.usuario || u.email || u.nome || "").trim().toLowerCase();
}

function bdrOwnerEhOwner(){
  const u = bdrOwnerUsuarioLocal();
  return Number(u?.id) === 1;
}

function bdrOwnerEsc(v){
  return String(v ?? "").replace(/[&<>'"]/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;"
  }[c]));
}

function bdrOwnerNormalizar(v){
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function bdrCliqueSecretoOwner(e){
  if(e) e.stopPropagation();

  bdrOwnerCliques++;
  console.log("BDR CORE cliques:", bdrOwnerCliques);

  clearTimeout(bdrOwnerTimer);
  bdrOwnerTimer = setTimeout(() => bdrOwnerCliques = 0, BDR_OWNER_TEMPO);

  if(bdrOwnerCliques >= BDR_OWNER_CLIQUES){
    bdrOwnerCliques = 0;

    if(!bdrOwnerEhOwner()){
      alert("Acesso negado.");
      return;
    }

    const senha = prompt("Senha BDR CORE:");
    if(senha !== BDR_OWNER_SENHA){
      alert("Senha incorreta.");
      return;
    }

    bdrOwnerAbrir();
  }
}
window.bdrCliqueSecretoOwner = bdrCliqueSecretoOwner;

function bdrOwnerAbrir(){
  bdrOwnerCriarModal();
  document.getElementById("bdrOwnerModalV6").classList.add("ativo");
  bdrOwnerTrocarArea(bdrOwnerAreaAtual || "patrimonio");
}
window.bdrOwnerAbrir = bdrOwnerAbrir;

function bdrOwnerFechar(){
  document.getElementById("bdrOwnerModalV6")?.classList.remove("ativo");
}
window.bdrOwnerFechar = bdrOwnerFechar;

function bdrOwnerCriarModal(){
  if(document.getElementById("bdrOwnerModalV6")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="bdrOwnerModalV6" class="bdr-owner-v6-bg">
      <div class="bdr-owner-v6-modal">

        <div class="bdr-owner-v6-top">
          <div class="bdr-owner-v6-titlebox">
            <div class="bdr-owner-v6-shield"><i class="fa-solid fa-shield-halved"></i></div>
            <div>
              <h2>BDR CORE <span>Correção segura do sistema</span></h2>
              <p>Área exclusiva para corrigir registros sem acessar o Supabase.</p>
            </div>
          </div>
          <div class="bdr-owner-v6-top-actions">
            <button class="v6-btn dark" onclick="bdrOwnerCarregarArea()"><i class="fa-solid fa-rotate"></i> Atualizar</button>
            <button class="v6-btn light" onclick="bdrOwnerFechar()"><i class="fa-solid fa-xmark"></i> Fechar</button>
          </div>
        </div>

        <div class="bdr-owner-v6-tabs" id="bdrOwnerTabsV6"></div>

        <div class="bdr-owner-v6-info">
          <i class="fa-solid fa-circle-info"></i>
          Use <b>Editar</b>, <b>Desativar/Reativar</b> ou <b>Apagar definitivo</b>. A busca acontece enquanto você digita.
        </div>

        <div class="bdr-owner-v6-search-card">
          <div>
            <h3 id="bdrOwnerTituloBusca">Consultar registros</h3>
            <p id="bdrOwnerSubBusca">Busque por código, ID ou nome.</p>
          </div>
          <div class="bdr-owner-v6-search-line">
            <input id="bdrOwnerBuscaV6" placeholder="Digite aqui..." oninput="bdrOwnerBuscaAutomatica()" onkeydown="if(event.key==='Enter') bdrOwnerBuscar()">
            <button class="v6-btn dark" onclick="bdrOwnerCarregarArea()"><i class="fa-solid fa-list"></i> Últimos</button>
          </div>
        </div>

        <div class="bdr-owner-v6-main">
          <section class="bdr-owner-v6-list-card">
            <div class="bdr-owner-v6-list-head">
              <h3 id="bdrOwnerTituloLista">Lista</h3>
              <div class="bdr-owner-v6-filter-mini">
                <select id="bdrOwnerFiltroStatus" onchange="bdrOwnerRenderizarLista()">
                  <option value="">Todos</option>
                  <option value="ATIVO">Ativos</option>
                  <option value="INATIVO">Desativados</option>
                </select>
                <select id="bdrOwnerQtd" onchange="bdrOwnerCarregarArea()">
                  <option value="10">10 registros</option>
                  <option value="25" selected>25 registros</option>
                  <option value="50">50 registros</option>
                </select>
              </div>
            </div>
            <div id="bdrOwnerListaV6" class="bdr-owner-v6-lista"></div>
          </section>

          <aside class="bdr-owner-v6-side">
            <section class="bdr-owner-v6-actions-card">
              <h3><i class="fa-solid fa-bolt"></i> Ações rápidas</h3>
              <button class="v6-action blue" onclick="bdrOwnerEditarSelecionado()"><i class="fa-solid fa-pen-to-square"></i><span><b>Editar registro</b><small>Alterar dados do item selecionado.</small></span></button>
              <button class="v6-action orange" onclick="bdrOwnerAlternarAtivoSelecionado()"><i class="fa-solid fa-toggle-on"></i><span><b>Desativar / Reativar</b><small>Ocultar ou trazer de volta o registro.</small></span></button>
              <button class="v6-action red" onclick="bdrOwnerApagarSelecionado()"><i class="fa-solid fa-trash-can"></i><span><b>Apagar definitivo</b><small>Remove permanentemente.</small></span></button>
            </section>

            <section class="bdr-owner-v6-security">
              <h3><i class="fa-solid fa-triangle-exclamation"></i> Segurança</h3>
              <p>Desativar é mais seguro que apagar. Apague apenas registros fake/teste ou correções autorizadas.</p>
            </section>

            <section class="bdr-owner-v6-summary">
              <h3><i class="fa-solid fa-chart-pie"></i> Resumo</h3>
              <div id="bdrOwnerResumoV6">Carregando...</div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  `);

  bdrOwnerMontarTabs();
}

function bdrOwnerMontarTabs(){
  const box = document.getElementById("bdrOwnerTabsV6");
  if(!box) return;

  box.innerHTML = Object.entries(BDR_OWNER_AREAS).map(([key, area]) => `
    <button class="bdr-owner-v6-tab ${key === bdrOwnerAreaAtual ? "active" : ""}" onclick="bdrOwnerTrocarArea('${key}')">
      <i class="fa-solid ${area.icone}"></i> ${area.titulo}
    </button>
  `).join("");
}

function bdrOwnerTrocarArea(area){
  bdrOwnerAreaAtual = area;
  bdrOwnerSelecionado = null;
  bdrOwnerMontarTabs();

  const cfg = BDR_OWNER_AREAS[area];
  document.getElementById("bdrOwnerTituloBusca").innerText = `Consultar ${cfg.titulo}`;
  document.getElementById("bdrOwnerSubBusca").innerText = `Exemplo real: ${cfg.exemplo}`;
  document.getElementById("bdrOwnerBuscaV6").placeholder = `Digite código, ID ou nome... Ex: ${cfg.exemplo}`;
  document.getElementById("bdrOwnerTituloLista").innerText = `Lista de ${cfg.titulo}`;

  bdrOwnerCarregarArea();
}
window.bdrOwnerTrocarArea = bdrOwnerTrocarArea;

async function bdrOwnerCarregarArea(){
  const db = bdrOwnerDB();
  const cfg = BDR_OWNER_AREAS[bdrOwnerAreaAtual];
  const limit = Number(document.getElementById("bdrOwnerQtd")?.value || 25);

  if(!db){
    alert("Supabase não carregado.");
    return;
  }

  const box = document.getElementById("bdrOwnerListaV6");
  if(box) box.innerHTML = `<div class="v6-loading">Carregando ${cfg.titulo}...</div>`;

  let query = db.from(cfg.tabela).select("*").limit(limit);
  try{ query = query.order(cfg.ordem, { ascending:false }); }catch(e){}

  const { data, error } = await query;

  if(error){
    bdrOwnerRegistros = [];
    box.innerHTML = `<div class="v6-empty">Erro ao carregar tabela <b>${cfg.tabela}</b>: ${bdrOwnerEsc(error.message)}</div>`;
    bdrOwnerAtualizarResumo();
    return;
  }

  bdrOwnerRegistros = data || [];
  bdrOwnerRenderizarLista();
}
window.bdrOwnerCarregarArea = bdrOwnerCarregarArea;

async function bdrOwnerBuscar(){
  const db = bdrOwnerDB();
  const cfg = BDR_OWNER_AREAS[bdrOwnerAreaAtual];
  const termo = document.getElementById("bdrOwnerBuscaV6")?.value.trim();
  const limit = Number(document.getElementById("bdrOwnerQtd")?.value || 25);

  if(!termo){
    bdrOwnerCarregarArea();
    return;
  }

  if(!db){
    alert("Supabase não carregado.");
    return;
  }

  const box = document.getElementById("bdrOwnerListaV6");
  box.innerHTML = `<div class="v6-loading">Buscando "${bdrOwnerEsc(termo)}"...</div>`;

  let query = db.from(cfg.tabela).select("*").limit(80);
  try{ query = query.order(cfg.ordem, { ascending:false }); }catch(e){}

  const { data, error } = await query;
  if(error){
    box.innerHTML = `<div class="v6-empty">Erro na busca: ${bdrOwnerEsc(error.message)}</div>`;
    return;
  }

  const t = bdrOwnerNormalizar(termo);
  bdrOwnerRegistros = (data || []).filter(r => {
    if(String(r.id || "") === termo) return true;
    return cfg.busca.some(c => bdrOwnerNormalizar(r[c]).includes(t));
  });

  bdrOwnerRenderizarLista();
}
window.bdrOwnerBuscar = bdrOwnerBuscar;

function bdrOwnerBuscaAutomatica(){
  clearTimeout(bdrOwnerBuscaTimer);
  bdrOwnerBuscaTimer = setTimeout(() => {
    const termo = document.getElementById("bdrOwnerBuscaV6")?.value.trim();
    if(termo){
      bdrOwnerBuscar();
    }else{
      bdrOwnerCarregarArea();
    }
  }, 350);
}
window.bdrOwnerBuscaAutomatica = bdrOwnerBuscaAutomatica;

function bdrOwnerAtivoValor(r){
  if(r.ativo === false) return false;
  if(String(r.status || "").toUpperCase() === "INATIVO") return false;
  return true;
}

function bdrOwnerRenderizarLista(){
  const cfg = BDR_OWNER_AREAS[bdrOwnerAreaAtual];
  const box = document.getElementById("bdrOwnerListaV6");
  const filtro = document.getElementById("bdrOwnerFiltroStatus")?.value || "";

  let lista = [...bdrOwnerRegistros];
  if(filtro === "ATIVO") lista = lista.filter(bdrOwnerAtivoValor);
  if(filtro === "INATIVO") lista = lista.filter(r => !bdrOwnerAtivoValor(r));

  if(!lista.length){
    box.innerHTML = `<div class="v6-empty">Nenhum registro encontrado em ${cfg.titulo}.</div>`;
    bdrOwnerAtualizarResumo();
    return;
  }

  box.innerHTML = lista.map(r => bdrOwnerCardRegistro(r, cfg)).join("");
  bdrOwnerAtualizarResumo(lista);
}
window.bdrOwnerRenderizarLista = bdrOwnerRenderizarLista;

function bdrOwnerCardRegistro(r, cfg){
  const ativo = bdrOwnerAtivoValor(r);
  const titulo = r[cfg.destaque] || r.nome_bem || r.nome || r.descricao || r.codigo_qr || `ID ${r.id}`;

  const campos = cfg.campos
    .filter(c => r[c] !== undefined && r[c] !== null && String(r[c]) !== "")
    .slice(0, 6)
    .map(c => `
      <div class="v6-field-mini">
        <small>${bdrOwnerEsc(c)}</small>
        <b>${bdrOwnerEsc(r[c])}</b>
      </div>
    `).join("");

  return `
    <div class="v6-registro ${bdrOwnerSelecionado?.id === r.id ? "selected" : ""}" onclick="bdrOwnerSelecionar(${Number(r.id)})">
      <div class="v6-reg-main">
        <div class="v6-reg-title">
          <span>#${bdrOwnerEsc(r.id)}</span>
          <b>${bdrOwnerEsc(titulo)}</b>
          <em class="${ativo ? "ok" : "off"}">${ativo ? "ATIVO" : "DESATIVADO"}</em>
        </div>
        <div class="v6-reg-fields">${campos}</div>
      </div>
      <div class="v6-reg-actions" onclick="event.stopPropagation()">
        <button class="mini blue" onclick="bdrOwnerEditar(${Number(r.id)})"><i class="fa-solid fa-pen"></i></button>
        <button class="mini orange" onclick="bdrOwnerAlternarAtivo(${Number(r.id)})"><i class="fa-solid fa-toggle-on"></i></button>
        <button class="mini red" onclick="bdrOwnerApagar(${Number(r.id)})"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `;
}

function bdrOwnerSelecionar(id){
  bdrOwnerSelecionado = bdrOwnerRegistros.find(r => Number(r.id) === Number(id));
  bdrOwnerRenderizarLista();
}
window.bdrOwnerSelecionar = bdrOwnerSelecionar;

function bdrOwnerRegistroPorId(id){
  return bdrOwnerRegistros.find(r => Number(r.id) === Number(id));
}

function bdrOwnerEditarSelecionado(){
  if(!bdrOwnerSelecionado){ alert("Selecione um registro na lista."); return; }
  bdrOwnerEditar(bdrOwnerSelecionado.id);
}
window.bdrOwnerEditarSelecionado = bdrOwnerEditarSelecionado;

async function bdrOwnerEditar(id){
  const cfg = BDR_OWNER_AREAS[bdrOwnerAreaAtual];
  const r = bdrOwnerRegistroPorId(id);
  if(!r) return;

  bdrOwnerCriarEditorModal();
  bdrOwnerMontarEditorCampos(cfg, r);
  document.getElementById("bdrOwnerEditModal").classList.add("ativo");
}
window.bdrOwnerEditar = bdrOwnerEditar;

function bdrOwnerCriarEditorModal(){
  if(document.getElementById("bdrOwnerEditModal")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="bdrOwnerEditModal" class="bdr-owner-edit-bg">
      <div class="bdr-owner-edit-modal">
        <div class="bdr-owner-edit-top">
          <div>
            <h2 id="bdrOwnerEditTitulo">Editar registro</h2>
            <p id="bdrOwnerEditSub">Altere os campos necessários e salve tudo de uma vez.</p>
          </div>
          <button class="v6-btn light" onclick="bdrOwnerFecharEditor()"><i class="fa-solid fa-xmark"></i> Fechar</button>
        </div>

        <div class="bdr-owner-edit-alert">
          <i class="fa-solid fa-circle-info"></i>
          O campo <b>ID</b> fica bloqueado. Campos vazios serão salvos como vazio/nulo conforme o tipo original.
        </div>

        <div id="bdrOwnerEditCampos" class="bdr-owner-edit-grid"></div>

        <div class="bdr-owner-edit-footer">
          <button class="v6-btn light" onclick="bdrOwnerFecharEditor()">Cancelar</button>
          <button class="v6-btn red" onclick="bdrOwnerSalvarEditor()"><i class="fa-solid fa-floppy-disk"></i> Salvar alterações</button>
        </div>
      </div>
    </div>
  `);
}

function bdrOwnerFecharEditor(){
  document.getElementById("bdrOwnerEditModal")?.classList.remove("ativo");
}
window.bdrOwnerFecharEditor = bdrOwnerFecharEditor;

function bdrOwnerTipoCampo(valor){
  if(typeof valor === "boolean") return "boolean";
  if(typeof valor === "number") return "number";
  if(valor === null || valor === undefined) return "text";
  const txt = String(valor);
  if(/^\d{4}-\d{2}-\d{2}T/.test(txt) || /^\d{4}-\d{2}-\d{2}/.test(txt)) return "date";
  if(txt.length > 90 || txt.includes("\n")) return "textarea";
  return "text";
}

function bdrOwnerCampoBloqueado(campo){
  return ["id"].includes(String(campo).toLowerCase());
}

function bdrOwnerMontarEditorCampos(cfg, r){
  bdrOwnerSelecionado = r;
  const box = document.getElementById("bdrOwnerEditCampos");
  document.getElementById("bdrOwnerEditTitulo").innerText = `Editar ${cfg.titulo} #${r.id}`;
  document.getElementById("bdrOwnerEditSub").innerText = `Tabela: ${cfg.tabela} • Você pode corrigir os campos deste registro.`;

  const prioridade = [
    "id", "codigo_qr", "codigo", "nome_bem", "nome", "descricao", "razao_social", "cnpj",
    "empresa_id", "obra_id", "localizacao", "status", "ativo", "tipo_item", "marca", "modelo",
    "numero_serie", "placa", "valor_bem", "observacao", "created_at", "updated_at"
  ];

  const chaves = Object.keys(r).sort((a,b) => {
    const ia = prioridade.indexOf(a);
    const ib = prioridade.indexOf(b);
    if(ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.localeCompare(b);
  });

  box.innerHTML = chaves.map(campo => {
    const valor = r[campo];
    const tipo = bdrOwnerTipoCampo(valor);
    const bloqueado = bdrOwnerCampoBloqueado(campo) ? "disabled" : "";
    const dataTipo = tipo;
    const valorEsc = bdrOwnerEsc(valor ?? "");

    if(tipo === "boolean"){
      return `
        <label class="bdr-owner-edit-field">
          <span>${bdrOwnerEsc(campo)}</span>
          <select data-campo="${bdrOwnerEsc(campo)}" data-tipo="boolean" ${bloqueado}>
            <option value="true" ${valor === true ? "selected" : ""}>true / sim</option>
            <option value="false" ${valor === false ? "selected" : ""}>false / não</option>
          </select>
        </label>
      `;
    }

    if(tipo === "textarea"){
      return `
        <label class="bdr-owner-edit-field wide">
          <span>${bdrOwnerEsc(campo)}</span>
          <textarea data-campo="${bdrOwnerEsc(campo)}" data-tipo="textarea" ${bloqueado}>${valorEsc}</textarea>
        </label>
      `;
    }

    return `
      <label class="bdr-owner-edit-field">
        <span>${bdrOwnerEsc(campo)}</span>
        <input data-campo="${bdrOwnerEsc(campo)}" data-tipo="${dataTipo}" value="${valorEsc}" ${bloqueado}>
      </label>
    `;
  }).join("");
}

function bdrOwnerConverterValor(valor, tipo, original){
  if(tipo === "boolean") return String(valor) === "true";
  if(valor === "" && (original === null || original === undefined)) return null;
  if(typeof original === "number"){
    const n = Number(String(valor).replace(",", "."));
    return Number.isFinite(n) ? n : original;
  }
  return valor;
}

async function bdrOwnerSalvarEditor(){
  const cfg = BDR_OWNER_AREAS[bdrOwnerAreaAtual];
  const original = bdrOwnerSelecionado;
  if(!original){ alert("Nenhum registro selecionado."); return; }

  const inputs = [...document.querySelectorAll("#bdrOwnerEditCampos [data-campo]")];
  const payload = {};
  const alterados = [];

  inputs.forEach(el => {
    const campo = el.dataset.campo;
    if(!campo || bdrOwnerCampoBloqueado(campo)) return;

    const tipo = el.dataset.tipo || "text";
    const novo = bdrOwnerConverterValor(el.value, tipo, original[campo]);
    const antigo = original[campo];

    if(String(novo ?? "") !== String(antigo ?? "")){
      payload[campo] = novo;
      alterados.push(`${campo}: ${antigo ?? ""} → ${novo ?? ""}`);
    }
  });

  if(Object.keys(payload).length === 0){
    alert("Nenhuma alteração para salvar.");
    return;
  }

  const motivo = prompt("Motivo da correção:", "Correção via BDR CORE");
  if(!motivo || motivo.trim().length < 3){
    alert("Informe um motivo para salvar.");
    return;
  }

  const confirmar = confirm(
    `Salvar alterações em ${cfg.titulo} #${original.id}?\n\n` +
    alterados.slice(0, 12).join("\n") +
    (alterados.length > 12 ? `\n... +${alterados.length - 12} campo(s)` : "")
  );

  if(!confirmar) return;

  const { error } = await bdrOwnerDB().from(cfg.tabela).update(payload).eq("id", original.id);

  if(error){
    alert("Erro ao salvar alterações: " + error.message);
    return;
  }

  await bdrOwnerTentarLog({
    acao:"EDICAO_OWNER",
    tabela: cfg.tabela,
    registro_id: original.id,
    motivo,
    descricao: alterados.join(" | ")
  });

  alert("Alterações salvas com sucesso.");
  bdrOwnerFecharEditor();
  bdrOwnerCarregarArea();
}
window.bdrOwnerSalvarEditor = bdrOwnerSalvarEditor;

async function bdrOwnerTentarLog(info){
  try{
    const db = bdrOwnerDB();
    if(!db) return;
    const usuario = bdrOwnerUsuarioLocal();
    await db.from("logs_sistema").insert([{
      acao: info.acao,
      tabela: info.tabela,
      registro_id: info.registro_id,
      usuario: usuario?.nome || usuario?.usuario || BDR_OWNER_LOGIN,
      motivo: info.motivo || null,
      descricao: info.descricao || null,
      created_at: new Date().toISOString()
    }]);
  }catch(e){
    console.warn("Log não gravado. Talvez logs_sistema não exista ainda.", e);
  }
}
window.bdrOwnerTentarLog = bdrOwnerTentarLog;

function bdrOwnerAlternarAtivoSelecionado(){
  if(!bdrOwnerSelecionado){ alert("Selecione um registro na lista."); return; }
  bdrOwnerAlternarAtivo(bdrOwnerSelecionado.id);
}
window.bdrOwnerAlternarAtivoSelecionado = bdrOwnerAlternarAtivoSelecionado;

async function bdrOwnerAlternarAtivo(id){
  const cfg = BDR_OWNER_AREAS[bdrOwnerAreaAtual];
  const r = bdrOwnerRegistroPorId(id);
  if(!r) return;

  const estaAtivo = bdrOwnerAtivoValor(r);
  const acao = estaAtivo ? "DESATIVAR" : "REATIVAR";
  const novoAtivo = !estaAtivo;

  const msgConfirmar = `${acao} registro #${id} em ${cfg.titulo}?\n\n${estaAtivo ? "Ele ficará oculto, mas não será apagado." : "Ele voltará a aparecer no sistema."}`;

  if(!confirm(msgConfirmar)) return;

  const payload = { ativo: novoAtivo };

  const { error } = await bdrOwnerDB().from(cfg.tabela).update(payload).eq("id", id);

  if(error){
    const msgErro =
      `Erro ao ${estaAtivo ? "desativar" : "reativar"}: ${error.message}` +
      "\n\nProvável causa: a tabela ainda não tem a coluna ativo." +
      `\n\nRode no Supabase:\nALTER TABLE ${cfg.tabela} ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;`;

    alert(msgErro);
    return;
  }

  alert(estaAtivo ? "Registro desativado com segurança." : "Registro reativado com sucesso.");
  bdrOwnerCarregarArea();
}
window.bdrOwnerAlternarAtivo = bdrOwnerAlternarAtivo;
// compatibilidade com versões antigas
window.bdrOwnerDesativar = bdrOwnerAlternarAtivo;
window.bdrOwnerDesativarSelecionado = bdrOwnerAlternarAtivoSelecionado;

function bdrOwnerApagarSelecionado(){
  if(!bdrOwnerSelecionado){ alert("Selecione um registro na lista."); return; }
  bdrOwnerApagar(bdrOwnerSelecionado.id);
}
window.bdrOwnerApagarSelecionado = bdrOwnerApagarSelecionado;

async function bdrOwnerApagar(id){
  const cfg = BDR_OWNER_AREAS[bdrOwnerAreaAtual];

  const senha = prompt("Digite sua senha master:");
  if(senha !== BDR_OWNER_SENHA){
    alert("Senha incorreta. Nada foi apagado.");
    return;
  }

  const resp = await bdrOwnerDB()
    .from(cfg.tabela)
    .delete()
    .eq("id", id)
    .select("id");

  if(resp.error){
    alert(
      "Erro ao apagar: " +
      resp.error.message +
      "\n\nPode existir vínculo com outra tabela. Nesse caso, use DESATIVAR."
    );
    return;
  }

  if(!resp.data || resp.data.length === 0){
    alert(
      "O Supabase não apagou nenhuma linha.\n\n" +
      "Provável bloqueio de RLS/policy ou vínculo no banco.\n" +
      "Nada foi apagado."
    );
    return;
  }

  alert("Registro apagado definitivamente.");
  bdrOwnerCarregarArea();
}
window.bdrOwnerApagar = bdrOwnerApagar;

function bdrOwnerAtualizarResumo(lista = null){
  const box = document.getElementById("bdrOwnerResumoV6");
  if(!box) return;

  const dados = lista || bdrOwnerRegistros || [];
  const total = dados.length;
  const ativos = dados.filter(bdrOwnerAtivoValor).length;
  const desativados = total - ativos;

  box.innerHTML = `
    <div class="v6-res-line" onclick="bdrOwnerSetFiltroStatus('')" title="Mostrar todos"><span>Total listado</span><b>${total}</b></div>
    <div class="v6-res-line" onclick="bdrOwnerSetFiltroStatus('ATIVO')" title="Filtrar ativos"><span>Ativos</span><b class="green">${ativos}</b></div>
    <div class="v6-res-line" onclick="bdrOwnerSetFiltroStatus('INATIVO')" title="Filtrar desativados"><span>Desativados</span><b class="orange">${desativados}</b></div>
    <div class="v6-res-line"><span>Área atual</span><b>${BDR_OWNER_AREAS[bdrOwnerAreaAtual]?.titulo || "-"}</b></div>
  `;
}

function bdrOwnerSetFiltroStatus(valor){
  const sel = document.getElementById("bdrOwnerFiltroStatus");
  if(sel) sel.value = valor;
  bdrOwnerRenderizarLista();
}
window.bdrOwnerSetFiltroStatus = bdrOwnerSetFiltroStatus;

/* Proteção visual do usuário owner nos botões do usuários.js, se existir */
(function bdrOwnerProtecaoUsuario(){
  const oldAlternar = window.alternarStatus;
  if(typeof oldAlternar === "function"){
    window.alternarStatus = function(id){
      try{
        const u = (window.usuarios || usuarios || []).find(x => Number(x.id) === Number(id));
        const login = String(u?.usuario || u?.email || "").toLowerCase();
        if(login === String(BDR_OWNER_LOGIN).toLowerCase() && !bdrOwnerEhOwner()){
          alert("Este usuário é protegido pelo sistema.");
          return;
        }
      }catch(e){}
      return oldAlternar(id);
    };
  }
})();
