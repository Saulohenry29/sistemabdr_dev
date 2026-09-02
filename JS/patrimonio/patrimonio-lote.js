(function(global){
"use strict";

/* =========================================================
   ATLAS PATRIMÔNIO — CADASTRO EM LOTE DEFINITIVO
   ---------------------------------------------------------
   Regras:
   - O botão fica fora do campo Número de Série.
   - O editor substitui somente o campo individual.
   - Ao fechar, o campo individual volta vazio.
   - O lote usa somente atlasLoteSeries.
   - Este arquivo contém toda a lógica do componente.
========================================================= */
const MAX_LOTE = 200;
const TIPOS_COM_LOTE = new Set([
  "FERRAMENTA","EQUIPAMENTO","MAQUINA","MAQUINA_PESADA",
  "INFORMATICA","ELETRONICO","ELETRODOMESTICO","MOBILIARIO",
  "MATERIAL_APOIO","COMUNICACAO","ELETRICO","SEGURANCA","OFICINA","OUTRO"
]);

const el = id => document.getElementById(id);
const valorCampo = id => String(el(id)?.value || "").trim();
let errosAtuais = [];
const ALTURA_LINHA = 24;

function normalizar(valor){
  return String(valor || "").toUpperCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
}

function renderizarCampo(placeholder="Número de série"){
  return `
    <div class="atlas-serie-lote" id="atlasSerieLote">
      <div class="atlas-serie-area" id="atlasSerieArea">
        <input id="numero_serie" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${placeholder}">
      </div>
      <button type="button" class="atlas-lote-botao" id="btnAlternarCadastroLote"
        aria-expanded="false" aria-label="Iniciar cadastro em lote"
        title="Iniciar cadastro em lote">+ Lote</button>
    </div>
  `;
}

function conectar(){
  const botao = el("btnAlternarCadastroLote");
  if(!botao || botao.dataset.atlasLoteConectado === "1") return;
  botao.dataset.atlasLoteConectado = "1";
  botao.addEventListener("click", alternar);
}

function ativo(){
  return el("atlasSerieLote")?.dataset.modo === "lote";
}

function tipoPermiteLote(){
  const tipo = String(valorCampo("tipo_item") || "").toUpperCase();
  return Boolean(tipo && tipo !== "VEICULO" && TIPOS_COM_LOTE.has(tipo) && el("numero_serie"));
}

function criarEditor(){
  const template = el("atlasLoteEditorTemplate");
  if(!template) throw new Error("Template do cadastro em lote não encontrado.");
  return template.content.firstElementChild.cloneNode(true);
}

function confirmarTroca(){
  return new Promise(resolve => {
    const fundo = document.createElement("div");
    fundo.className = "atlas-lote-confirmacao-bg";
    fundo.innerHTML = `
      <div class="atlas-lote-confirmacao" role="dialog" aria-modal="true">
        <div class="atlas-lote-confirmacao-corpo">
          <h3>Número de série preenchido</h3>
          <p>Este campo possui um número de série preenchido.<br><br>Ao iniciar um cadastro em lote este valor será removido. Deseja continuar?</p>
        </div>
        <div class="atlas-lote-confirmacao-acoes">
          <button type="button" class="atlas-lote-confirmacao-cancelar">Cancelar</button>
          <button type="button" class="atlas-lote-confirmacao-confirmar">Iniciar cadastro em lote</button>
        </div>
      </div>`;

    let terminou = false;
    const concluir = resposta => {
      if(terminou) return;
      terminou = true;
      fundo.remove();
      resolve(resposta);
    };

    fundo.querySelector(".atlas-lote-confirmacao-cancelar").addEventListener("click",()=>concluir(false));
    fundo.querySelector(".atlas-lote-confirmacao-confirmar").addEventListener("click",()=>concluir(true));
    fundo.addEventListener("click",evento=>{if(evento.target===fundo) concluir(false)});
    fundo.addEventListener("keydown",evento=>{if(evento.key==="Escape") concluir(false)});
    document.body.appendChild(fundo);
    fundo.querySelector(".atlas-lote-confirmacao-cancelar").focus();
  });
}

async function abrir(){
  if(!tipoPermiteLote()) return;
  const serie = el("numero_serie");
  if(String(serie?.value || "").trim() && !(await confirmarTroca())) return;

  const area = el("atlasSerieArea");
  const host = el("atlasSerieLote");
  const botao = el("btnAlternarCadastroLote");
  if(!area || !host || !botao) return;

  area.replaceChildren(criarEditor());
  host.dataset.modo = "lote";
  botao.textContent = "×";
  botao.classList.add("ativo");
  botao.setAttribute("aria-expanded","true");
  botao.setAttribute("aria-label","Fechar cadastro em lote");
  botao.setAttribute("title","Fechar cadastro em lote");

  ligarEditor();
  atualizarModo();
  setTimeout(()=> (el("atlasLoteSemSerie")?.checked ? el("atlasLoteQuantidade") : el("atlasLoteSeries"))?.focus(),80);
}

function fechar(opcoes={}){
  const host = el("atlasSerieLote");
  const area = el("atlasSerieArea");
  const botao = el("btnAlternarCadastroLote");
  if(!host || !area || !botao) return;

  const placeholder = host.dataset.placeholder || "Número de série";
  area.innerHTML = `<input id="numero_serie" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${placeholder}">`;
  host.dataset.modo = "individual";
  botao.textContent = "+ Lote";
  botao.classList.remove("ativo");
  botao.setAttribute("aria-expanded","false");
  botao.setAttribute("aria-label","Iniciar cadastro em lote");
  botao.setAttribute("title","Iniciar cadastro em lote");

  if(opcoes.limparSerie !== false) el("numero_serie").value = "";
  const principal = el("btnGerarPatrimonio");
  if(principal) principal.textContent = "Gerar Patrimônio";
}

async function alternar(){
  if(ativo()) fechar(); else await abrir();
}

function ligarEditor(){
  el('atlasLoteSemSerie')?.addEventListener('change',()=>{if(el('atlasLoteSemSerie')?.checked&&el('atlasLoteMesmoNumero'))el('atlasLoteMesmoNumero').checked=false;atualizarModo();});
  el('atlasLoteMesmoNumero')?.addEventListener('change',()=>{if(el('atlasLoteMesmoNumero')?.checked&&el('atlasLoteSemSerie'))el('atlasLoteSemSerie').checked=false;atualizarModo();});
  el("atlasLoteSeries")?.addEventListener("input",analisar);
  el("atlasLoteSeries")?.addEventListener("scroll",sincronizarRolagem);
  el("atlasLoteQuantidade")?.addEventListener("input",analisar);
  el("atlasLoteLimpar")?.addEventListener("click",limparSeries);
}

function linhasEditor(){return String(el("atlasLoteSeries")?.value || "").split(/\r?\n/)}
function seriesDigitadas(){return linhasEditor().map(v=>v.trim()).filter(Boolean)}
function modoMesmoNumero(){return el('atlasLoteMesmoNumero')?.checked===true;}
function quantidade(){
  if(el('atlasLoteSemSerie')?.checked||modoMesmoNumero()) return Math.max(0,Math.min(MAX_LOTE,Number(el('atlasLoteQuantidade')?.value||0)));
  return seriesDigitadas().length;
}

function repetidasNaLista(series){
  const mapa = new Map();
  series.forEach((serie,indice)=>{
    const chave=normalizar(serie); if(!chave)return;
    const linhas=mapa.get(chave)||[]; linhas.push(indice+1); mapa.set(chave,linhas);
  });
  return [...mapa.entries()].filter(([,linhas])=>linhas.length>1).map(([chave,linhas])=>({chave,linhas}));
}

function atualizarNumeracao(){
  const gutter=el("atlasLoteNumeracao"); if(!gutter)return;
  const total=Math.max(1,linhasEditor().length);
  const porLinha=new Map(errosAtuais.map(item=>[item.linha,item]));
  gutter.innerHTML=Array.from({length:total},(_,i)=>{
    const linha=i+1, erro=porLinha.get(linha), classe=erro?(erro.tipo==="BANCO"?"tem-aviso":"tem-erro"):"";
    return `<div class="atlas-editor-numero ${classe}" data-linha="${linha}">${linha}</div>`;
  }).join("");
  gutter.querySelectorAll("[data-linha]").forEach(item=>item.addEventListener("click",()=>irParaLinha(Number(item.dataset.linha))));
  sincronizarRolagem();
}

function sincronizarRolagem(){const campo=el("atlasLoteSeries"),gutter=el("atlasLoteNumeracao");if(campo&&gutter)gutter.scrollTop=campo.scrollTop}
function irParaLinha(numeroLinha){
  const campo=el("atlasLoteSeries");if(!campo)return;
  const linhas=linhasEditor();let inicio=0;for(let i=0;i<numeroLinha-1;i++)inicio+=(linhas[i]||"").length+1;
  campo.focus();campo.setSelectionRange(inicio,inicio+(linhas[numeroLinha-1]||"").length);
  campo.scrollTop=Math.max(0,(numeroLinha-1)*ALTURA_LINHA-campo.clientHeight/2+ALTURA_LINHA);sincronizarRolagem();
}

function renderizarErros(){
  const container=el("atlasLoteErros");if(!container)return;
  container.hidden=!errosAtuais.length;
  container.innerHTML=errosAtuais.slice(0,8).map(erro=>`<button type="button" class="atlas-lote-erro-item" data-linha="${erro.linha}"><span>⚠ ${erro.mensagem}</span><span class="atlas-lote-erro-linha">Linha ${erro.linha}</span></button>`).join("");
  container.querySelectorAll("[data-linha]").forEach(item=>item.addEventListener("click",()=>irParaLinha(Number(item.dataset.linha))));
}

function analisar(){
  const semSerie=el('atlasLoteSemSerie')?.checked===true,mesmaSerie=modoMesmoNumero(),total=quantidade(),contador=el('atlasLoteContador'),btn=el('btnGerarPatrimonio');
  errosAtuais=[];
  if(!semSerie && !mesmaSerie){
    const primeira=new Map();linhasEditor().forEach((conteudo,indice)=>{
      const serie=String(conteudo||"").trim(),chave=normalizar(serie),linha=indice+1;if(!serie||!chave)return;
      if(primeira.has(chave))errosAtuais.push({tipo:"REPETIDA",linha,mensagem:`${serie} está repetida. Também aparece na linha ${primeira.get(chave)}.`});else primeira.set(chave,linha);
    });
  }
  atualizarNumeracao();renderizarErros();
  if(contador){
    contador.className="atlas-lote-contador";
    if(semSerie){contador.textContent=total?`${total} patrimônios serão criados sem série`:'Informe a quantidade';if(total>=2)contador.classList.add('ok')}
    else if(mesmaSerie){contador.textContent=total?`${total} patrimônios usarão a mesma série`:'Informe a quantidade';if(total>=2)contador.classList.add('ok')}
    else if(errosAtuais.length){contador.textContent=`${total} série(s) • ${errosAtuais.length} repetida(s)`;contador.classList.add("erro")}
    else if(total){contador.textContent=`✓ ${total} número${total===1?"":"s"} de série detectado${total===1?"":"s"}`;contador.classList.add("ok")}
    else contador.textContent="Nenhum número de série informado";
  }
  if(btn&&ativo())btn.textContent=total>1?`Criar ${total} patrimônios`:"Gerar Patrimônio";
}

function atualizarModo(){
  const semSerie=el('atlasLoteSemSerie')?.checked===true;
  const mesmaSerie=modoMesmoNumero();
  if(el('atlasLoteComSerie')) el('atlasLoteComSerie').hidden=semSerie||mesmaSerie;
  if(el('atlasLoteSemSerieCampos')) el('atlasLoteSemSerieCampos').hidden=!(semSerie||mesmaSerie);
  const rotulo=el('atlasLoteQuantidadeRotulo');
  const ajuda=el('atlasLoteQuantidadeAjuda');
  if(rotulo) rotulo.textContent='Quantidade';
  if(ajuda) ajuda.textContent=mesmaSerie?'Todos os patrimônios receberão o mesmo número de série.':'Os números de série poderão ser adicionados depois.';
  analisar();
}

function limparSeries(){const campo=el("atlasLoteSeries");if(campo){campo.value="";campo.focus()}errosAtuais=[];analisar()}
function resetar(){if(ativo())fechar();}

function usuarioAtual(){
  try{
    return JSON.parse(localStorage.getItem("usuario_logado") || "null");
  }catch{
    return null;
  }
}

function montarBase(contexto){
  const usuario = usuarioAtual();
  const obra = contexto.obra;

  return {
    nome_bem: contexto.nome_bem,
    tipo_item: contexto.tipo_item,
    tipo_outro: valorCampo("tipo_outro") || null,

    empresa_id: obra.empresa_id ? Number(obra.empresa_id) : 17,
    obra_id: obra.id ? Number(obra.id) : null,
    localizacao: obra.nome || null,
    status: contexto.status_inicial,

    marca: valorCampo("marca") || null,
    modelo: valorCampo("modelo") || null,
    descricao: valorCampo("descricao") || null,
    fornecedor: valorCampo("fornecedor") || null,
    data_compra: valorCampo("data_compra") || null,

    // Responsável não é solicitado no lote. O sistema registra automaticamente quem cadastrou.
    responsavel: null,
    departamento: valorCampo("departamento") || null,
    endereco_estoque: valorCampo("endereco_estoque") || null,

    placa: null,
    renavam: null,
    chassi: null,
    cor: valorCampo("cor") || null,
    combustivel: valorCampo("combustivel") || null,
    potencia: valorCampo("potencia") || null,

    horimetro: typeof moedaParaNumero === "function" ? moedaParaNumero(valorCampo("horimetro")) : null,
    quilometragem: typeof moedaParaNumero === "function" ? moedaParaNumero(valorCampo("quilometragem")) : null,

    ano_fabricacao: valorCampo("ano_fabricacao") ? parseInt(valorCampo("ano_fabricacao"), 10) : null,
    ano_modelo: valorCampo("ano_modelo") ? parseInt(valorCampo("ano_modelo"), 10) : null,

    valor_bem: typeof moedaParaNumero === "function" ? moedaParaNumero(valorCampo("valor_bem")) : null,
    codigo_antigo: null,
    ncm: valorCampo("ncm") || null,
    numero_nfe: valorCampo("numero_nfe") || null,
    estado_conservacao: valorCampo("estado_conservacao") || "BOM",
    observacao: [
      valorCampo("patrimonioObservacao"),
      valorCampo("especificacoes") ? "Especificações: " + valorCampo("especificacoes") : ""
    ].filter(Boolean).join(" | ") || null,

    origem_cadastro: el("checkLegado")?.checked ? "LEGADO" : "NOVO",
    usuario_cadastro: usuario?.nome || "Usuário não identificado"
  };
}

async function validarBanco(base, series){
  const dadosBase = await bdrBaseDuplicidadePatrimonio();
  const conflitos = [];

  for(const serie of series){
    const serieN = normalizar(serie);
    if(!serieN) continue;

    const encontrado = (dadosBase || []).find(p =>
      p &&
      p.ativo !== false &&
      normalizar(p.nome_bem) === normalizar(base.nome_bem) &&
      normalizar(p.marca) === normalizar(base.marca) &&
      normalizar(p.modelo) === normalizar(base.modelo) &&
      normalizar(p.numero_serie) === serieN
    );

    if(encontrado){
      conflitos.push({
        serie,
        codigo: encontrado.codigo_qr || encontrado.codigo_bem || "sem código"
      });
    }
  }

  return conflitos;
}

async function salvar(contexto){
  if(global.__BDR_PATRIMONIO_SALVANDO__){
    alert("Já existe um cadastro sendo salvo. Aguarde finalizar.");
    return;
  }

  if(String(contexto.tipo_item || "").toUpperCase() === "VEICULO"){
    alert("Cadastro em lote não está disponível para veículos.");
    return;
  }

  const semSerie=el('atlasLoteSemSerie')?.checked===true;
  const mesmaSerie=modoMesmoNumero();
  const serieUnica=valorCampo('numero_serie');
  if(mesmaSerie && !serieUnica){alert('Informe o número de série que será usado em todos os patrimônios.');return;}
  const series=semSerie?Array.from({length:quantidade()},()=>null):mesmaSerie?Array.from({length:quantidade()},()=>serieUnica):seriesDigitadas();

  if(series.length < 2){
    alert("Para usar o cadastro em lote, informe pelo menos 2 patrimônios.");
    return;
  }

  if(series.length > MAX_LOTE){
    alert(`O limite por lançamento é de ${MAX_LOTE} patrimônios.`);
    return;
  }

  const repetidas=(semSerie||mesmaSerie)?[]:repetidasNaLista(series);
  if(repetidas.length){
    analisar();
    const primeiraLinha = atlasLoteErrosAtuais[0]?.linha;
    if(primeiraLinha) irParaLinha(primeiraLinha);
    return;
  }

  const base = montarBase(contexto);

  // O cadastro em lote nunca utiliza o campo individual.
  delete base.numero_serie;

  if(!semSerie){
    const conflitos=await validarBanco(base,[...new Set(series.filter(Boolean))]);
    if(conflitos.length){
      const continuar=typeof bdrConfirmarAtlas==='function'
        ? await bdrConfirmarAtlas('⚠️ Encontramos série(s) já usadas com o mesmo nome, marca e modelo:\n\n'+conflitos.slice(0,10).map(c=>`• ${c.serie} → ${c.codigo}`).join('\n')+'\n\nIsso é apenas um aviso. Deseja criar o lote mesmo assim?')
        : confirm('Existem séries repetidas no banco. Criar mesmo assim?');
      if(!continuar) return;
    }
  }

  const confirmar = typeof bdrConfirmarAtlas === "function"
    ? await bdrConfirmarAtlas(
        `Serão criados ${series.length} patrimônios.\n\n` +
        `Produto: ${base.nome_bem}\n` +
        `Marca: ${base.marca || "-"}\n` +
        `Modelo: ${base.modelo || "-"}\n` +
        `Séries: ${semSerie?'serão preenchidas depois':mesmaSerie?'o mesmo número em todos':'uma por patrimônio'}\n\n` +
        "Deseja continuar?"
      )
    : confirm(`Criar ${series.length} patrimônios?`);

  if(!confirmar) return;

  global.__BDR_PATRIMONIO_SALVANDO__ = true;
  if(typeof bdrSetGerandoPatrimonio === "function") bdrSetGerandoPatrimonio(true);

  const btn = el("btnGerarPatrimonio");
  let criados = 0;
  const erros = [];

  try{
    let proximoSequencial = await bdrProximoSequencialObra(contexto.obra);

    for(let indice = 0; indice < series.length; indice++){
      const numeroSerie = series[indice];
      const sequencial = proximoSequencial + indice;
      const codigo_qr = bdrMontarCodigoPatrimonio(contexto.obra.codigo_obra, sequencial);

      if(btn){
        btn.textContent = `Salvando ${indice + 1} de ${series.length}...`;
      }

      const patrimonio = {
        ...base,
        sequencial: Number(sequencial),
        codigo_qr,
        numero_serie: numeroSerie || null
      };

      const resp = await bdrSalvarPrimeiroNoTablet("patrimonio", patrimonio, {
        acao:"CADASTRO_PATRIMONIO_LOTE",
        codigo_qr
      });

      if(resp?.error){
        erros.push(`${codigo_qr}: ${resp.error.message || "erro ao salvar"}`);
        continue;
      }

      const registroSalvo = Array.isArray(resp.data) && resp.data[0]
        ? resp.data[0]
        : {
            ...patrimonio,
            id: resp.offlineFirst
              ? `LOCAL-LOTE-${Date.now()}-${indice}`
              : Date.now() + indice
          };

      patrimonioItens.unshift({
        ...registroSalvo,
        __offline_pendente: !!resp.offlineFirst
      });

      criados++;
    }

    if(criados){
      window.AtlasAudio?.concluido?.();
      if(typeof atlasAvisoPatrimonio === "function"){
        atlasAvisoPatrimonio(
          "✅ Cadastro em lote concluído",
          `${criados} patrimônios foram criados com códigos automáticos.`
        );
      }else{
        alert(`${criados} patrimônios criados com sucesso.`);
      }

      if(typeof limparFormularioCadastro === "function"){
        limparFormularioCadastro();
      }
      if(typeof renderizarPatrimonios === "function"){
        renderizarPatrimonios();
      }
    }

    if(erros.length){
      alert(
        `O lote terminou com ${erros.length} erro(s).\n\n` +
        erros.slice(0,10).join("\n")
      );
    }
  }catch(e){
    console.error("Cadastro em lote:", e);
    alert(e?.message || "Não foi possível concluir o cadastro em lote.");
  }finally{
    global.__BDR_PATRIMONIO_SALVANDO__ = false;
    if(typeof bdrSetGerandoPatrimonio === "function") bdrSetGerandoPatrimonio(false);
    if(btn) btn.textContent = "Gerar Patrimônio";
  }
}


global.AtlasPatrimonioLote={renderizarCampo,conectar,alternar,abrir,fechar,resetar,atualizarModo,analisar,sincronizarRolagem,irParaLinha,limparSeries,ativo,salvar};
})(window);
console.log("✅ ATLAS PATRIMÔNIO LOTE V2.0 carregado - mesma série por quantidade e repetição permitida com aviso");
