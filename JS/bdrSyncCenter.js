/* =========================================================
   BDR SYNC CENTER V2.1
   Painel visual de sincronização offline-first

   COMPORTAMENTO:
   - Online e sem pendências: não mostra nada.
   - Offline: mostra aviso pequeno "Modo offline".
   - Pendentes: mostra quantidade pendente.
   - Erros/conflitos: mostra aviso pequeno.
========================================================= */

(function(){
  "use strict";

  /* =========================================================
     1. CRIA A INTERFACE
  ========================================================= */
  function criarUI(){
    if(document.getElementById("bdrSyncMini")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <div id="bdrSyncMini" class="bdr-sync-mini" onclick="BDRSyncCenter.abrir()">
        <span id="bdrSyncIcon">📡</span>
        <b id="bdrSyncTexto">Sync</b>
        <small id="bdrSyncQtd">0</small>
      </div>

      <div id="bdrSyncModal" class="bdr-sync-bg">
        <div class="bdr-sync-modal">

          <div class="bdr-sync-top">
            <div>
              <h2>BDR Sync Center</h2>
              <p>Controle de dados offline, pendentes e sincronizados.</p>
            </div>

            <button onclick="BDRSyncCenter.fechar()">X</button>
          </div>

          <div class="bdr-sync-cards">
            <div class="bdr-sync-card pendente">
              <strong id="syncPendentes">0</strong>
              <span>Pendentes</span>
            </div>

            <div class="bdr-sync-card ok">
              <strong id="syncOk">0</strong>
              <span>Sincronizados</span>
            </div>

            <div class="bdr-sync-card conflito">
              <strong id="syncConflitos">0</strong>
              <span>Conflitos</span>
            </div>

            <div class="bdr-sync-card erro">
              <strong id="syncErros">0</strong>
              <span>Erros</span>
            </div>
          </div>

          <div class="bdr-sync-actions">
            <button onclick="BDRSyncCenter.sincronizarAgora()">🔁 Sincronizar agora</button>
            <button onclick="BDRSyncCenter.atualizar()">↻ Atualizar lista</button>
          </div>

          <div id="bdrSyncLista" class="bdr-sync-lista"></div>

        </div>
      </div>
    `);

    criarCSS();
  }

  /* =========================================================
     2. CSS
  ========================================================= */
  function criarCSS(){
    if(document.getElementById("bdrSyncStyle")) return;

    document.head.insertAdjacentHTML("beforeend", `
      <style id="bdrSyncStyle">
        .bdr-sync-mini{
          position:fixed;
          right:12px;
          bottom:12px;
          z-index:999999;
          background:#111827;
          color:#fff;
          border-radius:999px;
          padding:5px 8px;
          display:none;
          align-items:center;
          gap:5px;
          box-shadow:0 8px 20px rgba(0,0,0,.18);
          cursor:pointer;
          font-size:10px;
          font-weight:800;
          opacity:.82;
        }

        .bdr-sync-mini:hover{
          opacity:1;
        }

        .bdr-sync-mini b{
          display:none;
        }

        .bdr-sync-mini small{
          background:transparent;
          padding:0;
          color:#e5e7eb;
          font-size:10px;
        }

        .bdr-sync-mini.ok{background:#166534;}
        .bdr-sync-mini.pendente{background:#92400e;}
        .bdr-sync-mini.erro{background:#991b1b;}
        .bdr-sync-mini.conflito{background:#5b21b6;}

        .bdr-sync-bg{
          display:none;
          position:fixed;
          inset:0;
          background:rgba(15,23,42,.65);
          z-index:1000000;
          align-items:center;
          justify-content:center;
          padding:18px;
        }

        .bdr-sync-bg.ativo{
          display:flex;
        }

        .bdr-sync-modal{
          width:min(900px,96vw);
          max-height:90vh;
          overflow:auto;
          background:#fff;
          border-radius:18px;
          padding:18px;
          box-shadow:0 26px 80px rgba(0,0,0,.35);
          border-left:5px solid #d71920;
        }

        .bdr-sync-top{
          display:flex;
          justify-content:space-between;
          gap:12px;
          align-items:flex-start;
          margin-bottom:14px;
        }

        .bdr-sync-top h2{
          margin:0;
          color:#d71920;
        }

        .bdr-sync-top p{
          margin:4px 0 0;
          color:#6b7280;
          font-size:12px;
        }

        .bdr-sync-top button{
          border:none;
          background:#dc2626;
          color:white;
          border-radius:10px;
          width:34px;
          height:34px;
          font-weight:900;
          cursor:pointer;
        }

        .bdr-sync-cards{
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
          gap:10px;
          margin-bottom:12px;
        }

        .bdr-sync-card{
          border-radius:14px;
          padding:12px;
          background:#f8fafc;
          border-left:5px solid #64748b;
        }

        .bdr-sync-card strong{
          display:block;
          font-size:24px;
          color:#111827;
        }

        .bdr-sync-card span{
          font-size:12px;
          font-weight:900;
          color:#6b7280;
        }

        .bdr-sync-card.ok{border-left-color:#16a34a;}
        .bdr-sync-card.pendente{border-left-color:#f59e0b;}
        .bdr-sync-card.conflito{border-left-color:#7c3aed;}
        .bdr-sync-card.erro{border-left-color:#dc2626;}

        .bdr-sync-actions{
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-bottom:12px;
        }

        .bdr-sync-actions button{
          border:none;
          background:#111827;
          color:white;
          border-radius:10px;
          padding:9px 12px;
          font-weight:900;
          cursor:pointer;
        }

        .bdr-sync-item{
          background:#f9fafb;
          border:1px solid #e5e7eb;
          border-left:4px solid #64748b;
          border-radius:12px;
          padding:10px;
          margin-bottom:8px;
          font-size:12px;
        }

        .bdr-sync-item b{
          color:#111827;
        }

        .bdr-sync-item pre{
          white-space:pre-wrap;
          background:#0f172a;
          color:#e5e7eb;
          border-radius:10px;
          padding:8px;
          max-height:130px;
          overflow:auto;
        }

        .bdr-sync-status-pendente{border-left-color:#f59e0b;}
        .bdr-sync-status-sincronizado{border-left-color:#16a34a;}
        .bdr-sync-status-erro{border-left-color:#dc2626;}
        .bdr-sync-status-conflito{border-left-color:#7c3aed;}
      </style>
    `);
  }

  /* =========================================================
     3. ATUALIZA TUDO
  ========================================================= */
  async function atualizar(){
    criarUI();

    if(!window.BDRSync){
      const mini = document.getElementById("bdrSyncMini");
      const qtd = document.getElementById("bdrSyncQtd");

      if(mini && qtd){
        mini.className = "bdr-sync-mini erro";
        qtd.innerText = "Sync indisponível";
        mini.style.display = "flex";
      }

      return;
    }

    const c = await window.BDRSync.contadores();

    document.getElementById("syncPendentes").innerText = c.pendentes;
    document.getElementById("syncOk").innerText = c.sincronizados;
    document.getElementById("syncConflitos").innerText = c.conflitos;
    document.getElementById("syncErros").innerText = c.erros;

    atualizarBotaoMini(c);
    await atualizarLista();
  }

  /* =========================================================
     4. BOTÃO PEQUENO
  ========================================================= */
  function atualizarBotaoMini(c){
    const mini = document.getElementById("bdrSyncMini");
    const texto = document.getElementById("bdrSyncTexto");
    const qtd = document.getElementById("bdrSyncQtd");

    if(!mini || !texto || !qtd) return;

    mini.className = "bdr-sync-mini";

    const offlineReal =
      window.BDR_PATRIMONIO_ONLINE_REAL === false ||
      navigator.onLine === false;

    const temProblema =
      c.pendentes > 0 ||
      c.erros > 0 ||
      c.conflitos > 0 ||
      offlineReal;

    if(!temProblema){
      mini.style.display = "none";
      return;
    }

    if(c.erros > 0){
      mini.classList.add("erro");
      texto.innerText = "Erro";
      qtd.innerText = `${c.erros} erro(s)`;
    }
    else if(c.conflitos > 0){
      mini.classList.add("conflito");
      texto.innerText = "Conflito";
      qtd.innerText = `${c.conflitos} conflito(s)`;
    }
    else if(c.pendentes > 0){
      mini.classList.add("pendente");
      texto.innerText = "Pendente";
      qtd.innerText = `${c.pendentes} pendente(s)`;
    }
    else if(offlineReal){
      mini.classList.add("pendente");
      texto.innerText = "Offline";
      qtd.innerText = "Modo offline";
    }

    mini.style.display = "flex";
  }

  /* =========================================================
     5. LISTA DO MODAL
  ========================================================= */
  async function atualizarLista(){
    const lista = document.getElementById("bdrSyncLista");
    if(!lista || !window.BDRSync) return;

    const todos = await window.BDRSync.listarTudo();

    const ultimos = todos
      .sort((a,b) => String(b.criado_em).localeCompare(String(a.criado_em)))
      .slice(0,50);

    if(ultimos.length === 0){
      lista.innerHTML = `<div class="bdr-sync-item">Nenhum registro na fila ainda.</div>`;
      return;
    }

    lista.innerHTML = ultimos.map(item => `
      <div class="bdr-sync-item bdr-sync-status-${item.status}">
        <b>${String(item.status || "").toUpperCase()}</b>
        • ${item.acao || "-"} em <b>${item.tabela || "-"}</b><br>

        <span>
          Criado: ${item.criado_em || "-"}
          • Tentativas: ${item.tentativas || 0}
        </span>

        ${item.erro ? `
          <p style="color:#991b1b;font-weight:900;">
            Erro: ${escapeHtml(item.erro)}
          </p>
        ` : ""}

        <pre>${escapeHtml(JSON.stringify(item.payload || {}, null, 2))}</pre>
      </div>
    `).join("");
  }

  /* =========================================================
     6. ABRIR / FECHAR
  ========================================================= */
  function abrir(){
    criarUI();
    document.getElementById("bdrSyncModal").classList.add("ativo");
    atualizar();
  }

  function fechar(){
    document.getElementById("bdrSyncModal")?.classList.remove("ativo");
  }

  /* =========================================================
     7. SINCRONIZAR MANUALMENTE
  ========================================================= */
  async function sincronizarAgora(){
    if(window.BDRSync){
      await window.BDRSync.sincronizarPendentes();
      await atualizar();
    }
  }

  /* =========================================================
     8. ESCAPE HTML
  ========================================================= */
  function escapeHtml(str){
    return String(str).replace(/[&<>'"]/g, c => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      "'":"&#39;",
      '"':"&quot;"
    }[c]));
  }

  /* =========================================================
     9. FUNÇÕES GLOBAIS
  ========================================================= */
  window.BDRSyncCenter = {
    criarUI,
    atualizar,
    abrir,
    fechar,
    sincronizarAgora
  };

  /* =========================================================
     10. EVENTOS
  ========================================================= */
  document.addEventListener("DOMContentLoaded", () => {
    criarUI();
    setTimeout(atualizar, 600);
    setInterval(atualizar, 10000);
  });

  window.addEventListener("bdr-sync-status", atualizar);
  window.addEventListener("online", atualizar);
  window.addEventListener("offline", atualizar);

  console.log("✅ BDR Sync Center V2.1 carregado");
})();
