/* =========================================================
   ATLAS AUDIO V3.0 - PADRÃO OFICIAL
   ---------------------------------------------------------
   Sons oficiais:
   - AtlasAudio.notificacao()
   - AtlasAudio.scannerOK()
   - AtlasAudio.scannerErro()
   - AtlasAudio.concluido()

   Estrutura esperada:
   /assets/audio/notificacao.mp3
   /assets/audio/scanner-ok.mp3
   /assets/audio/scanner-erro.mp3
   /assets/audio/concluido.mp3
========================================================= */

(function () {
  'use strict';

  // Evita carregar o motor de áudio duas vezes.
  if (window.AtlasAudio && window.AtlasAudio.__loaded) {
    console.warn('Atlas Audio já carregado. Ignorando duplicado.');
    return;
  }

  const CONFIG = {
    volume: 0.85,

    arquivos: {
      notificacao: 'assets/audio/notificacao.mp3',
      scannerOK: 'assets/audio/scanner-ok.mp3',
      scannerErro: 'assets/audio/scanner-erro.mp3',
      concluido: 'assets/audio/concluido.mp3'
    },

    // Evita que o mesmo som reinicie enquanto ainda está tocando.
    impedirSobreposicao: true,

    // Pequena proteção contra chamadas duplicadas quase simultâneas.
    intervaloMinimoMs: 180,

    // Notificações recebidas quase juntas geram um único aviso sonoro, inclusive entre abas.
    intervaloNotificacaoGlobalMs: 1800
  };

  const audios = new Map();
  const tocando = new Set();
  const ultimoToque = new Map();

  let liberado = false;
  let inicializado = false;

  function criarAudio(nome) {
    const caminho = CONFIG.arquivos[nome];

    if (!caminho) {
      console.warn(`Atlas Audio: arquivo não configurado para "${nome}".`);
      return null;
    }

    const audio = new Audio(caminho);
    audio.preload = 'auto';
    audio.volume = CONFIG.volume;

    audio.addEventListener('ended', () => {
      tocando.delete(nome);
      audio.currentTime = 0;
    });

    audio.addEventListener('pause', () => {
      if (audio.ended || audio.currentTime === 0) {
        tocando.delete(nome);
      }
    });

    audio.addEventListener('error', () => {
      tocando.delete(nome);
      console.warn(`Atlas Audio: não foi possível carregar "${caminho}".`);
    });

    audios.set(nome, audio);
    return audio;
  }

  function obterAudio(nome) {
    return audios.get(nome) || criarAudio(nome);
  }

  function inicializar() {
    if (inicializado) return;

    Object.keys(CONFIG.arquivos).forEach(obterAudio);
    inicializado = true;
  }

  async function liberar() {
    inicializar();

    if (liberado) return true;

    /*
     * Navegadores, principalmente iPhone/Safari, exigem uma interação
     * real do usuário antes de permitir reprodução automática.
     */
    try {
      const audio = obterAudio('scannerOK');

      if (audio) {
        audio.muted = true;
        audio.currentTime = 0;

        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      }

      liberado = true;
      void 0;
      return true;
    } catch (erro) {
      return false;
    }
  }

  async function tocar(nome) {
    inicializar();

    const audio = obterAudio(nome);
    if (!audio) return false;

    const agora = Date.now();

    if (nome === 'notificacao') {
      const chaveGlobal = 'atlas_audio_notificacao_ultimo_toque';
      try {
        const ultimoGlobal = Number(localStorage.getItem(chaveGlobal) || 0);
        if (agora - ultimoGlobal < CONFIG.intervaloNotificacaoGlobalMs) return false;
        localStorage.setItem(chaveGlobal, String(agora));
      } catch (_e) {
        // Se o storage estiver indisponível, permanece a proteção local abaixo.
      }
    }
    const ultimo = ultimoToque.get(nome) || 0;

    if (agora - ultimo < CONFIG.intervaloMinimoMs) {
      return false;
    }

    if (CONFIG.impedirSobreposicao && tocando.has(nome)) {
      return false;
    }

    ultimoToque.set(nome, agora);

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = CONFIG.volume;

      tocando.add(nome);
      await audio.play();

      liberado = true;
      return true;
    } catch (erro) {
      tocando.delete(nome);

      console.warn(
        `Atlas Audio: o navegador bloqueou "${nome}". ` +
        'Interaja com a página uma vez e tente novamente.'
      );

      return false;
    }
  }

  function parar(nome) {
    const audio = audios.get(nome);
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
    tocando.delete(nome);
  }

  function pararTodos() {
    audios.forEach((audio, nome) => {
      audio.pause();
      audio.currentTime = 0;
      tocando.delete(nome);
    });
  }

  function definirVolume(valor) {
    const volume = Number(valor);

    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      console.warn('Atlas Audio: o volume deve estar entre 0 e 1.');
      return false;
    }

    CONFIG.volume = volume;
    audios.forEach(audio => {
      audio.volume = volume;
    });

    return true;
  }

  /*
   * Libera os sons após a primeira interação real do usuário.
   * Isso ajuda no Chrome, Safari, iPhone e PWA.
   */
  ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(evento => {
    document.addEventListener(
      evento,
      () => {
        liberar();
      },
      { once: true, passive: true }
    );
  });

  const AtlasAudio = {
    __loaded: true,
    versao: '3.0-padrao-atlas',

    notificacao() {
      return tocar('notificacao');
    },

    scannerOK() {
      return tocar('scannerOK');
    },

    scannerErro() {
      return tocar('scannerErro');
    },

    concluido() {
      return tocar('concluido');
    },

    liberar,
    parar,
    pararTodos,
    definirVolume,

    get liberado() {
      return liberado;
    },

    get volume() {
      return CONFIG.volume;
    }
  };

  window.AtlasAudio = AtlasAudio;

  void 0;
})();
