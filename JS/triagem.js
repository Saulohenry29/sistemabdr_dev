let entradas = [];
let itens = [];
let obras = [];
let enderecos = [];
let visaoAtual = "CALENDARIO";

window.onload = async () => {
  const usuario = usuarioAtual();

  const dataAtual = document.getElementById("dataAtual");
  if(dataAtual){
    dataAtual.innerText = new Date().toLocaleDateString("pt-BR");
  }

  const usuarioInfo = document.getElementById("usuarioInfo");
  if(usuarioInfo){
    usuarioInfo.innerText = usuario ? "👤 " + (usuario.nome || "") : "";
  }

  await carregarTriagem();
};

function ir(pagina){ window.location.href = pagina; }
function db(){
  return window.client || window.supabaseClient || window.clientSupabase || globalThis.client;
}
function usuarioAtual(){ const u = localStorage.getItem("usuario_logado"); return u ? JSON.parse(u) : null; }
function valor(id){ const el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; }
function moeda(v){ return Number(v || 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }

function dataBR(data){
  if(!data) return "-";
  const p=String(data).slice(0,10).split("-");
  return p.length===3 ? `${p[2]}/${p[1]}/${p[0]}` : data;
}

function mesAnoBR(data){
  if(!data) return "Sem data";
  const meses=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const [ano,mes]=String(data).slice(0,10).split("-");
  return `${meses[Number(mes)-1]}/${ano}`;
}

function chaveMes(data){ return String(data || "").slice(0,7); }

function normalizar(txt){
  return String(txt || "").trim().toUpperCase();
}

async function carregarTriagem(){
  const banco = db();

  if(!banco){
    alert("Supabase não foi carregado. Confira o arquivo ./JS/supabaseClient.js");
    return;
  }

  const entradaResp = await banco
    .from("entradas_materiais")
    .select("*")
    .eq("status","ENVIADO_TRIAGEM")
    .order("id",{ascending:false});

  const itensResp = await banco
    .from("entradas_materiais_itens")
    .select("*")
    .eq("status_triagem","PENDENTE")
    .order("id",{ascending:false});

  const obrasResp = await banco
    .from("obras")
    .select("*")
    .eq("ativa",true)
    .order("nome");

  const endResp = await banco
    .from("enderecamento_estoque")
    .select("*")
    .eq("status","LIVRE")
    .order("codigo_curto");

  if(entradaResp.error){ alert("Erro ao carregar entradas: " + entradaResp.error.message); return; }
  if(itensResp.error){ alert("Erro ao carregar itens da triagem: " + itensResp.error.message); return; }
  if(obrasResp.error){ console.warn("Erro ao carregar obras:", obrasResp.error.message); }
  if(endResp.error){ alert("Erro ao carregar endereços livres: " + endResp.error.message); return; }

  entradas = entradaResp.data || [];
  itens = itensResp.data || [];
  obras = obrasResp.data || [];
  enderecos = endResp.data || [];

  carregarFiltroMes();
  renderizarTudo();
}

async function recarregarEnderecosLivres(){
  const { data, error } = await db()
    .from("enderecamento_estoque")
    .select("*")
    .eq("status","LIVRE")
    .order("codigo_curto");

  if(error){
    alert(error.message);
    return;
  }

  enderecos = data || [];
}

function carregarFiltroMes(){
  const select = document.getElementById("filtroMes");
  if(!select) return;
  const atual = select.value;
  const meses = [...new Set(entradas.map(e => chaveMes(e.data_recebimento)).filter(Boolean))].sort().reverse();

  select.innerHTML = `<option value="">Todos os meses</option>`;

  meses.forEach(m => {
    const e = entradas.find(x => chaveMes(x.data_recebimento) === m);
    select.innerHTML += `<option value="${m}">${mesAnoBR(e.data_recebimento)}</option>`;
  });

  select.value = atual;
}

function mudarVisao(visao){
  visaoAtual = visao;
  document.getElementById("abaCalendario").classList.toggle("ativa", visao === "CALENDARIO");
  document.getElementById("abaNFs").classList.toggle("ativa", visao === "NFS");
  renderizarTudo();
}

function entradasFiltradas(){
  const busca = valor("busca").toLowerCase();
  const filtroMes = valor("filtroMes");

  return entradas.filter(e => {
    const itensEntrada = itens.filter(i => String(i.entrada_id) === String(e.id));
    if(itensEntrada.length === 0) return false;

    const textoItens = itensEntrada.map(i => i.descricao_xml || "").join(" ");
    const texto = `${e.id} ${e.numero_nf||""} ${e.fornecedor||""} ${e.responsavel||""} ${textoItens}`.toLowerCase();

    return texto.includes(busca) && (!filtroMes || chaveMes(e.data_recebimento) === filtroMes);
  });
}

function renderizarTudo(){
  atualizarResumo();

  if(visaoAtual === "CALENDARIO"){
    renderizarCalendario();
  }else{
    renderizarNFs(entradasFiltradas());
  }
}

function atualizarResumo(){
  const ents = entradasFiltradas();
  const ids = ents.map(e => String(e.id));
  const itensPendentes = itens.filter(i => ids.includes(String(i.entrada_id)));
  const valorTotal = itensPendentes.reduce((s,i) => s + Number(i.valor_total || 0), 0);
  const sugestoes = itensPendentes.filter(i => ["PATRIMONIO","ANALISAR_PATRIMONIO"].includes(sugerirDestino(i))).length;

  const resumoNFs = document.getElementById("resumoNFs");
  const resumoItens = document.getElementById("resumoItens");
  const resumoValor = document.getElementById("resumoValor");
  const resumoPatrimonio = document.getElementById("resumoPatrimonio");

  if(resumoNFs) resumoNFs.innerText = ents.length;
  if(resumoItens) resumoItens.innerText = itensPendentes.length;
  if(resumoValor) resumoValor.innerText = moeda(valorTotal);
  if(resumoPatrimonio) resumoPatrimonio.innerText = sugestoes;
}

function renderizarCalendario(){
  const lista = document.getElementById("listaTriagem");
  lista.innerHTML = "";
  const ents = entradasFiltradas();

  if(ents.length === 0){
    lista.innerHTML = `<div class="card">Nenhuma entrada aguardando triagem.</div>`;
    return;
  }

  const gruposMes = {};

  ents.forEach(e => {
    const mes = mesAnoBR(e.data_recebimento);
    const dia = dataBR(e.data_recebimento);

    if(!gruposMes[mes]) gruposMes[mes] = {};
    if(!gruposMes[mes][dia]) gruposMes[mes][dia] = [];

    gruposMes[mes][dia].push(e);
  });

  Object.keys(gruposMes).forEach(mes => {
    let htmlDias = "";

    Object.keys(gruposMes[mes]).forEach(dia => {
      const entradasDia = gruposMes[mes][dia];
      const ids = entradasDia.map(e => String(e.id));
      const qtdItens = itens.filter(i => ids.includes(String(i.entrada_id))).length;

      htmlDias += `
        <div class="dia-linha" onclick="abrirDia('${dia}')">
          <strong>${dia}</strong>
          <span>${entradasDia.length} NF(s) • ${qtdItens} item(ns) pendente(s)</span>
          <span class="badge badge-info">Abrir</span>
        </div>

        <div id="dia-${dia.replaceAll('/','-')}" style="display:none;margin-bottom:12px;">
          ${montarNFsHTML(entradasDia)}
        </div>
      `;
    });

    lista.innerHTML += `<div class="mes-card"><h3>${mes}</h3>${htmlDias}</div>`;
  });
}

function abrirDia(dia){
  const div = document.getElementById("dia-" + dia.replaceAll("/","-"));
  if(div){
    div.style.display = div.style.display === "none" ? "block" : "none";
  }
}

function renderizarNFs(ents){
  const lista = document.getElementById("listaTriagem");
  lista.innerHTML = ents.length ? montarNFsHTML(ents) : `<div class="card">Nenhuma NF aguardando triagem.</div>`;
}

function montarNFsHTML(ents){
  let html = "";

  ents.forEach(e => {
    const itensEntrada = itens.filter(i => String(i.entrada_id) === String(e.id));
    const valorTotal = itensEntrada.reduce((s,i) => s + Number(i.valor_total || 0), 0);

    html += `
      <div class="nf-card">
        <div class="nf-header" onclick="abrirNF(${e.id})">
          <strong>NF ${e.numero_nf || e.id}</strong>
          <span>${e.fornecedor || "-"}</span>
          <span>${dataBR(e.data_recebimento)}</span>
          <span class="badge badge-pendente">${itensEntrada.length} item(ns)</span>
        </div>

        <div style="font-size:12px;color:#6b7280;margin-top:6px;">
          Responsável: ${e.responsavel || "-"} • Total pendente: ${moeda(valorTotal)}
        </div>

        <div class="nf-itens" id="nf-${e.id}">
          ${montarItensHTML(itensEntrada)}
        </div>
      </div>
    `;
  });

  return html;
}

function abrirNF(id){
  const div = document.getElementById("nf-" + id);
  if(div){
    div.style.display = div.style.display === "none" ? "block" : "none";
  }
}

/* Triagem inteligente por pontuação */
function sugerirDestino(item){
  const desc = String(item.descricao_xml || "").toLowerCase();
  const valorUnit = Number(item.valor_unitario || 0);
  const quantidade = Number(item.quantidade || 0);

  let pontos = 0;

  if(valorUnit >= 1200) pontos += 4;
  if(valorUnit >= 5000) pontos += 2;
  if(quantidade <= 2) pontos += 2;
  if(quantidade >= 10) pontos -= 2;

  const consumo = [
    "luva","uniforme","camiseta","calça","calca","bota","capacete","disco",
    "parafuso","porca","arruela","cabo","fio","tinta","cimento","areia","brita",
    "cola","fita","papel","caneta","toner","cartucho","epi"
  ];

  if(consumo.some(p => desc.includes(p))) pontos -= 5;

  const duravel = [
    "equipamento","maquina","máquina","aparelho","ferramenta","motor","compressor",
    "bomba","gerador","notebook","computador","monitor","impressora","televisor",
    "televisão","televisao","tv","smart tv","geladeira","freezer","bebedouro",
    "ar condicionado","furadeira","parafusadeira","esmerilhadeira","serra",
    "solda","inversora","lavadora"
  ];

  if(duravel.some(p => desc.includes(p))) pontos += 4;

  if(pontos >= 5) return "PATRIMONIO";
  if(pontos >= 3) return "ANALISAR_PATRIMONIO";
  return "ESTOQUE";
}

function tipoAreaPorDestino(destino, item){
  if(destino === "PATRIMONIO") return "PATRIMONIO";
  if(destino === "AVARIADO") return "QUARENTENA";

  const desc = String(item.descricao_xml || "").toLowerCase();

  if(desc.includes("luva") || desc.includes("capacete") || desc.includes("bota") || desc.includes("epi")) return "EPI";
  if(desc.includes("fio") || desc.includes("cabo") || desc.includes("disjuntor")) return "ELETRICA";
  if(desc.includes("cano") || desc.includes("tubo") || desc.includes("conex")) return "HIDRAULICA";
  if(desc.includes("furadeira") || desc.includes("parafusadeira") || desc.includes("serra")) return "FERRAMENTAS";

  return "GERAL";
}

/*
  Regra corrigida:
  1. Tenta área específica: PATRIMONIO/EPI/GERAL etc.
  2. Se não achar, usa GERAL.
  3. Se não achar, usa QUALQUER endereço LIVRE.
*/
function sugerirEndereco(destino, item){
  const tipo = normalizar(tipoAreaPorDestino(destino, item));

  let encontrado = enderecos.find(e =>
    normalizar(e.tipo_area) === tipo &&
    normalizar(e.status) === "LIVRE"
  );

  if(!encontrado && tipo !== "GERAL"){
    encontrado = enderecos.find(e =>
      normalizar(e.tipo_area) === "GERAL" &&
      normalizar(e.status) === "LIVRE"
    );
  }

  if(!encontrado){
    encontrado = enderecos.find(e =>
      normalizar(e.status) === "LIVRE"
    );
  }

  return encontrado || null;
}

function montarOptionsObras(){
  let html = '<option value="">Selecione a obra</option>';

  obras.forEach(o => {
    html += `<option value="${o.id}">${o.codigo_obra || "-"} - ${o.nome || "-"}</option>`;
  });

  return html;
}

function montarItensHTML(listaItens){
  let html = "";

  listaItens.forEach(i => {
    const sugestao = sugerirDestino(i);
    const destinoPadrao = ["PATRIMONIO","ANALISAR_PATRIMONIO"].includes(sugestao) ? "PATRIMONIO" : "ESTOQUE";
    const endereco = sugerirEndereco(destinoPadrao, i);

    const alerta = destinoPadrao === "PATRIMONIO"
      ? `<div class="alerta">⚠️ Sug.: PATRIMÔNIO • Motivo: valor/quantidade/durabilidade</div>`
      : "";

    html += `
      <div class="item">
        <strong>${i.descricao_xml || "Item sem descrição"}</strong>

        <div class="grid" style="margin-top:8px;">
          <div><b>Qtd:</b> ${i.quantidade || 0}</div>
          <div><b>Vlr:</b> ${moeda(i.valor_unitario)}</div>
          <div><b>Total:</b> ${moeda(i.valor_total)}</div>
          <div><b>Estado:</b> ${i.estado_material || "-"}</div>
        </div>

        ${alerta}

        <div class="grid" style="margin-top:10px;">
          <div>
            <label>Destino</label>
            <select id="destino-${i.id}" onchange="atualizarEnderecoItem(${i.id})">
              <option value="ESTOQUE" ${destinoPadrao === "ESTOQUE" ? "selected" : ""}>Estoque CD</option>
              <option value="PATRIMONIO" ${destinoPadrao === "PATRIMONIO" ? "selected" : ""}>Patrimônio + Estoque</option>
              <option value="OBRA">Direto para Obra</option>
              <option value="AVARIADO">Avariado</option>
            </select>
          </div>

          <div id="boxObra-${i.id}" style="display:none;">
            <label>Obra destino</label>
            <select id="obraDestino-${i.id}">
              ${montarOptionsObras()}
            </select>
          </div>

          <div>
            <label>Endereço sugerido</label>
            <div class="codigo-end" id="enderecoTexto-${i.id}">
              ${endereco ? endereco.codigo_curto : "SEM ENDEREÇO LIVRE"}
            </div>
            <input type="hidden" id="enderecoId-${i.id}" value="${endereco ? endereco.id : ""}">
          </div>

          <div>
            <label>Observação</label>
            <input id="obs-${i.id}" placeholder="Observação">
          </div>
        </div>

        <div class="linha-acoes">
          <button class="btn btn-blue" onclick="atualizarEnderecoItem(${i.id})">🔄 Recalcular endereço</button>
          <button class="btn btn-ok" onclick="confirmarItem(${i.id})">✅ Confirmar triagem</button>
        </div>
      </div>
    `;
  });

  return html;
}

async function atualizarEnderecoItem(itemId){
  await recarregarEnderecosLivres();

  const item = itens.find(i => Number(i.id) === Number(itemId));
  if(!item) return;

  const destino = valor("destino-" + itemId);
  const boxObra = document.getElementById("boxObra-" + itemId);

  if(boxObra){
    boxObra.style.display = destino === "OBRA" ? "block" : "none";
  }

  const endereco = sugerirEndereco(destino, item);

  document.getElementById("enderecoTexto-" + itemId).innerText =
    endereco ? endereco.codigo_curto : "SEM ENDEREÇO LIVRE";

  document.getElementById("enderecoId-" + itemId).value =
    endereco ? endereco.id : "";
}

async function confirmarItem(itemId){
  await recarregarEnderecosLivres();

  const item = itens.find(i => Number(i.id) === Number(itemId));

  if(!item){
    alert("Item não encontrado.");
    return;
  }

  const destino = valor("destino-" + itemId);
  const obraDestino = valor("obraDestino-" + itemId) || null;
  let enderecoId = valor("enderecoId-" + itemId) || null;
  const obs = valor("obs-" + itemId);

  if(destino === "OBRA" && !obraDestino){
    alert("Selecione a obra destino.");
    return;
  }

  if((destino === "ESTOQUE" || destino === "PATRIMONIO") && !enderecoId){
    const enderecoAuto = sugerirEndereco(destino, item);

    if(enderecoAuto){
      enderecoId = enderecoAuto.id;
      document.getElementById("enderecoTexto-" + itemId).innerText = enderecoAuto.codigo_curto;
      document.getElementById("enderecoId-" + itemId).value = enderecoAuto.id;
    }
  }

  if((destino === "ESTOQUE" || destino === "PATRIMONIO") && !enderecoId){
    alert("Nenhum endereço livre encontrado. Cadastre ou libere posições no Endereçamento.");
    return;
  }

  const endereco = enderecos.find(e => String(e.id) === String(enderecoId)) || null;

  try{
    if(destino === "ESTOQUE" || destino === "OBRA" || destino === "PATRIMONIO"){
      await salvarNoEstoque(item, destino, obraDestino, endereco, obs);
    }

    if(destino === "AVARIADO"){
      await registrarTriagem(item, "AVARIADO", obraDestino, obs, endereco);

      if(endereco){
        await ocuparEndereco(endereco.id);
      }
    }

    await marcarItemTriado(item.id);
    await verificarEntradaFinalizada(item.entrada_id);

    alert("Triagem confirmada com sucesso!");
    await carregarTriagem();

  }catch(err){
    console.error(err);
    alert("Erro na triagem: " + err.message);
  }
}

async function salvarNoEstoque(item, destino, obraDestino, endereco, obs){
  const usuario = usuarioAtual();
  const codigo = "EST-" + Date.now() + "-" + item.id;
  const tipoControle = destino === "PATRIMONIO" ? "PATRIMONIO" : "CONSUMO";

  const { data: produto, error } = await db()
    .from("estoque_produtos")
    .insert([{
      codigo,
      descricao: item.descricao_xml || "Item sem descrição",
      unidade: "UN",
      tipo_controle: tipoControle,
      estado_material: item.estado_material || "NOVO",
      quantidade: Number(item.quantidade || 0),
      valor_unitario: Number(item.valor_unitario || 0),
      patrimonio_id: null,
      empresa_id: null,
      obra_id: obraDestino || null,
      status: obraDestino ? "EM_USO" : "DISPONIVEL",
      usuario_cadastro: usuario?.nome || "Usuário não identificado",
      rua: endereco?.rua || null,
      prateleira: endereco?.prateleira || null,
      coluna: endereco?.coluna || null,
      nivel: endereco?.nivel || null,
      caixa: endereco?.caixa || null,
      localizacao_fisica: endereco?.codigo_curto || null
    }])
    .select()
    .single();

  if(error) throw error;

  await db()
    .from("estoque_movimentacoes")
    .insert([{
      produto_id: produto.id,
      tipo_movimentacao: destino === "OBRA" ? "SAIDA_DIRETA_OBRA" : "ENTRADA",
      quantidade: Number(item.quantidade || 0),
      origem: "TRIAGEM",
      destino: destino === "OBRA" ? "OBRA " + obraDestino : (endereco?.codigo_curto || "CD"),
      usuario: usuario?.nome || "Usuário não identificado",
      observacao: obs
    }]);

  await registrarTriagem(item, destino, obraDestino, obs, endereco);

  if(endereco && destino !== "OBRA"){
    await ocuparEndereco(endereco.id);
  }
}

async function ocuparEndereco(enderecoId){
  const { error } = await db()
    .from("enderecamento_estoque")
    .update({ status:"OCUPADO" })
    .eq("id", enderecoId);

  if(error) throw error;
}

async function registrarTriagem(item, destino, obraDestino, obs, endereco){
  const usuario = usuarioAtual();
  const sugestao = sugerirDestino(item);

  const { error } = await db()
    .from("triagem_materiais")
    .insert([{
      descricao: item.descricao_xml || "Item sem descrição",
      quantidade: Number(item.quantidade || 0),
      valor_unitario: Number(item.valor_unitario || 0),
      categoria: null,
      bem_duravel: sugestao === "PATRIMONIO" || sugestao === "ANALISAR_PATRIMONIO",
      sugestao_patrimonio: sugestao === "PATRIMONIO" || sugestao === "ANALISAR_PATRIMONIO",
      destino,
      obra_destino_id: obraDestino || null,
      status: "CONCLUIDO",
      usuario_triagem: usuario?.nome || "Usuário não identificado",
      observacao: obs || (endereco ? "Endereço: " + endereco.codigo_curto : null)
    }]);

  if(error) throw error;
}

async function marcarItemTriado(itemId){
  const { error } = await db()
    .from("entradas_materiais_itens")
    .update({ status_triagem:"TRIADO" })
    .eq("id", itemId);

  if(error) throw error;
}

async function verificarEntradaFinalizada(entradaId){
  const { data, error } = await db()
    .from("entradas_materiais_itens")
    .select("id")
    .eq("entrada_id", entradaId)
    .eq("status_triagem", "PENDENTE");

  if(error){
    console.error(error);
    return;
  }

  if(!data || data.length === 0){
    await db()
      .from("entradas_materiais")
      .update({ status:"TRIADO" })
      .eq("id", entradaId);
  }
}