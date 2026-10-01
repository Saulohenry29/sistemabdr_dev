/* =========================================================
   ATLAS MODAL V1.2 - COMPONENTE OFICIAL DE MODAIS
   Sprint 3.0: Interface profissional do Atlas
   - Recebimento seguro em etapas
   - Divergência sem confirm/prompt do navegador
   - Base para futuros modais do Atlas
========================================================= */
(function(){
  "use strict";

  if(window.AtlasModal && window.AtlasModal.__loaded) return;

  const AtlasModal = { __loaded:true, versao:"1.4-feedback-e-confirmacoes" };

  function esc(v){
    return String(v ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function ensureCss(){
    if(document.getElementById("atlasModalCss")) return;
    const css = document.createElement("style");
    css.id = "atlasModalCss";
    css.textContent = `
      .atlas-modal-bg{
        position:fixed; inset:0; background:rgba(15,23,42,.72);
        z-index:9999999; display:flex; align-items:center; justify-content:center;
        padding:16px;
      }
      .atlas-modal-card{
        width:min(660px,94vw); max-height:86vh; overflow:hidden; background:#fff;
        border-radius:16px; box-shadow:0 24px 70px rgba(0,0,0,.34);
        border:1px solid #e5e7eb;
      }
      .atlas-modal-head{
        display:flex; align-items:center; justify-content:space-between; gap:10px;
        padding:10px 14px; background:#fff5f5; border-bottom:1px solid #fecaca;
        color:#991b1b; font-weight:900;
      }
      .atlas-modal-x{
        border:0; background:#fff; color:#991b1b; width:34px; height:34px;
        border-radius:10px; font-weight:900; cursor:pointer;
      }
      .atlas-modal-body{padding:12px 14px 14px; color:#111827; overflow:auto; max-height:calc(86vh - 56px);}
      .atlas-modal-sub{font-size:12px; color:#6b7280; font-weight:800; margin-top:3px;}
      .atlas-recebimento-grid{
        display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; margin:8px 0 10px;
      }
      .atlas-info-box{
        background:#f8fafc; border:1px solid #e5e7eb; border-radius:11px; padding:7px 9px;
        font-size:11px; color:#64748b; font-weight:800;
      }
      .atlas-info-box b{display:block; color:#0f172a; font-size:12px; margin-top:2px;}
      .atlas-choice-row{display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:9px;}
      .atlas-choice{
        border:2px solid #e5e7eb; background:#fff; border-radius:12px; padding:10px 11px;
        cursor:pointer; text-align:left; transition:.16s ease; min-height:78px; color:#111827!important;
      }
      .atlas-choice:hover{transform:translateY(-2px); box-shadow:0 10px 24px rgba(15,23,42,.12);}
      .atlas-choice strong{display:block; font-size:13px; margin-bottom:4px; color:#111827!important;}
      .atlas-choice span{display:block; font-size:11px; color:#64748b; font-weight:700; line-height:1.25;}
      .atlas-choice.ok{border-color:#86efac; background:#f0fdf4; color:#14532d!important;}
      .atlas-choice.div{border-color:#fdba74; background:#fff7ed; color:#7c2d12!important;}
      .atlas-step-title{font-weight:900; color:#0f172a; font-size:15px; margin-bottom:6px;}
      .atlas-textarea{
        width:100%; min-height:78px; resize:vertical; border:1px solid #d1d5db; border-radius:14px;
        padding:9px 10px; font-size:13px; outline:none;
      }
      .atlas-textarea:focus{border-color:#f97316; box-shadow:0 0 0 3px rgba(249,115,22,.12);}
      .atlas-modal-actions{
        display:flex; gap:8px; justify-content:flex-end; align-items:center; margin-top:10px;
      }
      .atlas-btn{
        border:0; border-radius:10px; padding:9px 12px; font-weight:900; cursor:pointer;
      }
      .atlas-btn.secondary{background:#f3f4f6; color:#374151;}
      .atlas-btn.success{background:#15803d!important; color:#fff!important;}
      .atlas-btn.success:hover{background:#166534!important;}
      .atlas-status-row{display:grid; grid-template-columns:1fr 1fr 1fr; gap:7px; margin-top:8px;}
      .atlas-status-choice{border:2px solid #e5e7eb; background:#fff; border-radius:11px; padding:9px; cursor:pointer; text-align:left; font-weight:900; color:#111827!important;}
      .atlas-status-choice span{display:block;font-size:11px;color:#475569!important;font-weight:700;margin-top:4px;}
      .atlas-status-choice.active{border-color:#2563eb; background:#eff6ff; color:#1e3a8a!important; box-shadow:0 0 0 3px rgba(37,99,235,.10);}
      .atlas-btn.warning{background:#f97316; color:#fff;}
      .atlas-btn.danger{background:#dc2626; color:#fff;}
      .atlas-processing{background:#f8fafc; border-radius:15px; padding:10px; margin-top:8px; font-size:12px; color:#334155;}
      .atlas-bar{height:8px; background:#e5e7eb; border-radius:999px; overflow:hidden; margin-top:12px;}
      .atlas-bar span{display:block; height:100%; width:45%; background:#16a34a; border-radius:999px; animation:atlasBar 1.1s ease-in-out infinite alternate;}
      @keyframes atlasBar{from{transform:translateX(-80%)}to{transform:translateX(160%)}}
      @media(max-width:640px){
        .atlas-modal-bg{
          align-items:flex-start!important;
          justify-content:center!important;
          padding:10px 10px calc(96px + env(safe-area-inset-bottom))!important;
          overflow-y:auto!important;
          -webkit-overflow-scrolling:touch!important;
        }
        .atlas-modal-card{
          width:100%!important;
          max-width:100%!important;
          max-height:none!important;
          margin:0 auto calc(92px + env(safe-area-inset-bottom))!important;
          border-radius:18px!important;
          overflow:visible!important;
        }
        .atlas-modal-head{
          position:sticky!important;
          top:0!important;
          z-index:3!important;
          border-radius:18px 18px 0 0!important;
        }
        .atlas-modal-body{
          padding:14px!important;
          overflow:visible!important;
        }
        .atlas-recebimento-grid,.atlas-choice-row,.atlas-status-row{
          grid-template-columns:1fr!important;
        }
        .atlas-modal-actions{
          display:grid!important;
          grid-template-columns:1fr 1fr!important;
          gap:10px!important;
          justify-content:stretch!important;
          padding-bottom:calc(18px + env(safe-area-inset-bottom))!important;
        }
        .atlas-btn{
          flex:1;
          min-height:48px!important;
          border-radius:14px!important;
          white-space:normal!important;
          line-height:1.2!important;
        }
        .atlas-choice{min-height:auto!important;}
        .atlas-textarea,input,textarea,select{font-size:16px!important;}
      }
      @media(max-width:380px){
        .atlas-modal-actions{grid-template-columns:1fr!important;}
      }
    `;
    document.head.appendChild(css);
  }

  function criarBase(titulo, subtitulo){
    ensureCss();
    const bg = document.createElement("div");
    bg.className = "atlas-modal-bg";
    bg.innerHTML = `
      <div class="atlas-modal-card" role="dialog" aria-modal="true">
        <div class="atlas-modal-head">
          <div><div>${esc(titulo)}</div>${subtitulo ? `<div class="atlas-modal-sub">${esc(subtitulo)}</div>` : ""}</div>
          <button class="atlas-modal-x" type="button" data-atlas-close>×</button>
        </div>
        <div class="atlas-modal-body"></div>
      </div>`;
    document.body.appendChild(bg);
    return { bg, body:bg.querySelector(".atlas-modal-body") };
  }

  function fechar(bg){ try{ bg?.remove(); }catch(e){} }

  function nomeObraSeguro(id){
    try{
      if(typeof window.nomeObra === "function") return window.nomeObra(id);
    }catch(e){}
    return id ? "Obra " + id : "-";
  }

  function pedidoCurto(p){ return "PED-" + (p?.id || "-"); }

  AtlasModal.recebimento = function(pedido){
    return new Promise(resolve => {
      const p = pedido || {};
      const { bg, body } = criarBase("📦 Recebimento", pedidoCurto(p));
      let encerrado = false;
      function sair(ret){ if(encerrado) return; encerrado=true; fechar(bg); resolve(ret); }

      bg.querySelector("[data-atlas-close]").onclick = () => sair(null);
      bg.addEventListener("click", e => { if(e.target === bg) sair(null); });

      const origem = nomeObraSeguro(p.obra_origem_id);
      const destino = nomeObraSeguro(p.obra_destino_id || p.obra_id);
      const motorista = p.motorista_nome || p.usuario_saida_cd || "-";
      const veiculo = p.transportadora || p.veiculo_descricao || "-";
      const placa = p.veiculo_placa || "-";

      function telaEscolha(){
        body.innerHTML = `
          <div class="atlas-recebimento-grid">
            <div class="atlas-info-box">Origem<b>${esc(origem)}</b></div>
            <div class="atlas-info-box">Destino<b>${esc(destino)}</b></div>
            <div class="atlas-info-box">Solicitante<b>${esc(p.solicitante || "-")}</b></div>
            <div class="atlas-info-box">Motorista<b>${esc(motorista)}</b></div>
            <div class="atlas-info-box">Veículo<b>${esc(veiculo)}</b></div>
            <div class="atlas-info-box">Placa<b>${esc(placa)}</b></div>
          </div>
          <div class="atlas-step-title">Como foi o recebimento?</div>
          <div class="atlas-choice-row">
            <button type="button" class="atlas-choice ok" data-ok>
              <strong>🟢 Recebido normalmente</strong>
              <span>Tudo conferido. O Atlas vai finalizar o recebimento e atualizar os itens da remessa.</span>
            </button>
            <button type="button" class="atlas-choice div" data-div>
              <strong>🟠 Recebido com divergência</strong>
              <span>Use somente se faltou item, veio errado, danificado ou com alguma ocorrência.</span>
            </button>
          </div>`;
        body.querySelector("[data-ok]").onclick = telaConfirmarNormal;
        body.querySelector("[data-div]").onclick = telaDivergencia;
      }

      function telaConfirmarNormal(){
        let statusFinal = "ESTOQUE";
        body.innerHTML = `
          <div class="atlas-step-title">✔ Recebido normalmente</div>
          <div class="atlas-info-box">Confirme o recebimento. Para patrimônios, informe também como o bem ficará no destino.</div>

          <div class="atlas-step-title" style="margin-top:14px;font-size:14px">Como ficará no destino?</div>
          <div class="atlas-status-row">
            <button type="button" class="atlas-status-choice active" data-status="ESTOQUE">🟢 Em estoque<span>Guardado no setor/obra destino.</span></button>
            <button type="button" class="atlas-status-choice" data-status="EM_USO">🔵 Em uso<span>Já ficará em utilização.</span></button>
            <button type="button" class="atlas-status-choice" data-status="MANUTENCAO">🟠 Manutenção<span>Recebido, mas precisa de manutenção.</span></button>
          </div>

          <div class="atlas-modal-actions">
            <button type="button" class="atlas-btn secondary" data-voltar>Voltar</button>
            <button type="button" class="atlas-btn success" data-confirmar>Confirmar recebimento</button>
          </div>`;

        body.querySelectorAll("[data-status]").forEach(btn => {
          btn.onclick = () => {
            statusFinal = btn.getAttribute("data-status") || "ESTOQUE";
            body.querySelectorAll("[data-status]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
          };
        });

        body.querySelector("[data-voltar]").onclick = telaEscolha;
        body.querySelector("[data-confirmar]").onclick = () => {
          body.innerHTML = `<div class="atlas-step-title">✔ Processando recebimento</div><div class="atlas-processing">Não feche esta tela. Atualizando a remessa, registrando o histórico e enviando notificações.<div class="atlas-bar"><span></span></div></div>`;
          setTimeout(() => sair({ divergencia:false, status_final:statusFinal, observacao:"Recebido sem divergência." }), 250);
        };
      }

      function telaDivergencia(){
        body.innerHTML = `
          <div class="atlas-step-title">⚠ Divergência encontrada</div>
          <div class="atlas-info-box">Descreva o ocorrido. A remessa não será concluída automaticamente até a conferência.</div>
          <br>
          <label style="font-size:12px;font-weight:900;color:#374151">Descreva o ocorrido</label>
          <textarea class="atlas-textarea" id="atlasObsDivergencia" placeholder="Ex.: item danificado, faltando acessório, equipamento diferente..."></textarea>
          <div class="atlas-info-box" style="margin-top:10px">📷 Foto opcional será adicionada em uma próxima etapa.</div>
          <div class="atlas-modal-actions">
            <button type="button" class="atlas-btn secondary" data-voltar>Voltar</button>
            <button type="button" class="atlas-btn warning" data-registrar>Registrar divergência</button>
          </div>`;
        body.querySelector("[data-voltar]").onclick = telaEscolha;
        body.querySelector("[data-registrar]").onclick = () => {
          const obs = String(body.querySelector("#atlasObsDivergencia")?.value || "").trim();
          if(!obs){
            body.querySelector("#atlasObsDivergencia")?.focus();
            return;
          }
          body.innerHTML = `<div class="atlas-step-title">⚠ Registrando divergência</div><div class="atlas-processing">Não feche esta tela. Registrando ocorrência e notificando a origem.<div class="atlas-bar"><span></span></div></div>`;
          setTimeout(() => sair({ divergencia:true, observacao:obs }), 250);
        };
      }

      telaEscolha();
    });
  };

  function feedback(tipo, mensagem){
    const texto = String(mensagem || "").trim();
    try{
      const alvo = window.parent && window.parent !== window ? window.parent : window;
      if(alvo.AtlasFeedback?.[tipo]) return alvo.AtlasFeedback[tipo](texto);
      if(typeof alvo.bdrAvisoAtlas === "function") return alvo.bdrAvisoAtlas(texto, "Atlas", tipo === "aviso" ? "warning" : tipo);
    }catch(e){}
    if(window.AtlasFeedback?.[tipo]) return window.AtlasFeedback[tipo](texto);
    if(typeof window.bdrAvisoAtlas === "function") return window.bdrAvisoAtlas(texto, "Atlas", tipo === "aviso" ? "warning" : tipo);
    return null;
  }

  // Feedback informativo não exige clique extra do usuário.
  AtlasModal.sucesso = function(titulo, mensagem){
    return feedback("sucesso", mensagem || titulo || "Operação concluída com sucesso.");
  };

  AtlasModal.aviso = function(titulo, mensagem){
    return feedback("aviso", mensagem || titulo || "Confira as informações antes de continuar.");
  };

  AtlasModal.erro = function(mensagem){
    return feedback("erro", mensagem || "Não foi possível concluir a operação.");
  };

  // Modal é reservado para decisões reais do fluxo.
  AtlasModal.confirmar = function({ titulo="Confirmar ação", subtitulo="Atlas", mensagem="Deseja continuar?", textoConfirmar="Confirmar", tipo="success" } = {}){
    return new Promise(resolve => {
      const { bg, body } = criarBase(titulo, subtitulo);
      let encerrado = false;
      const sair = resposta => { if(encerrado) return; encerrado=true; fechar(bg); resolve(resposta); };
      bg.querySelector("[data-atlas-close]").onclick = () => sair(false);
      bg.addEventListener("click", e => { if(e.target === bg) sair(false); });
      body.innerHTML = `
        <div class="atlas-info-box">${esc(mensagem)}</div>
        <div class="atlas-modal-actions">
          <button type="button" class="atlas-btn secondary" data-cancelar>Cancelar</button>
          <button type="button" class="atlas-btn ${tipo === "danger" ? "danger" : "success"}" data-confirmar>${esc(textoConfirmar)}</button>
        </div>`;
      body.querySelector("[data-cancelar]").onclick = () => sair(false);
      body.querySelector("[data-confirmar]").onclick = () => sair(true);
    });
  };

  AtlasModal.solicitarTexto = function({ titulo="Informar motivo", subtitulo="Atlas", mensagem="Descreva o motivo.", placeholder="Digite aqui...", textoConfirmar="Continuar", valorInicial="" } = {}){
    return new Promise(resolve => {
      const { bg, body } = criarBase(titulo, subtitulo);
      let encerrado = false;
      const sair = resposta => { if(encerrado) return; encerrado=true; fechar(bg); resolve(resposta); };
      bg.querySelector("[data-atlas-close]").onclick = () => sair(null);
      bg.addEventListener("click", e => { if(e.target === bg) sair(null); });
      body.innerHTML = `
        <div class="atlas-info-box">${esc(mensagem)}</div>
        <textarea class="atlas-textarea" data-texto placeholder="${esc(placeholder)}">${esc(valorInicial)}</textarea>
        <div class="atlas-modal-actions">
          <button type="button" class="atlas-btn secondary" data-cancelar>Cancelar</button>
          <button type="button" class="atlas-btn success" data-confirmar>${esc(textoConfirmar)}</button>
        </div>`;
      const campo = body.querySelector("[data-texto]");
      body.querySelector("[data-cancelar]").onclick = () => sair(null);
      body.querySelector("[data-confirmar]").onclick = () => {
        const valor = String(campo.value || "").trim();
        if(!valor){ campo.focus(); return; }
        sair(valor);
      };
      setTimeout(() => campo.focus(), 30);
    });
  };

  window.AtlasModal = AtlasModal;
  void 0;
})();
