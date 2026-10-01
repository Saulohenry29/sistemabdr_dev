/* =========================================================
   ATLAS EVENTS V1.1 - EVENT BUS OFICIAL
   Arquivo: JS/atlasEvents.js
   Sprint 2.5.1: suporte onAny para Atlas Event Store
========================================================= */
(function(){
  "use strict";

  const antigo = window.AtlasEvents;

  // Se já existe AtlasEvents carregado, apenas melhora ele sem quebrar listeners existentes.
  if(antigo && antigo.__loaded){
    if(!antigo.__anyListeners) antigo.__anyListeners = new Set();

    if(typeof antigo.onAny !== "function"){
      antigo.onAny = function(callback){
        if(typeof callback !== "function") return function(){};
        antigo.__anyListeners.add(callback);
        return function off(){
          try{ antigo.__anyListeners.delete(callback); }catch(e){}
        };
      };
    }

    if(!antigo.__emitComOnAny){
      const emitOriginal = antigo.emit;
      antigo.emit = function(evento, dados){
        let ok = true;
        try{
          if(typeof emitOriginal === "function"){
            ok = emitOriginal.call(antigo, evento, dados);
          }
        }catch(e){
          console.error("AtlasEvents: erro no emit original", e);
          ok = false;
        }

        try{
          antigo.__anyListeners.forEach(fn => {
            try{ fn(evento, dados || {}); }catch(err){ console.error("AtlasEvents onAny:", err); }
          });
        }catch(e){}

        try{
          window.dispatchEvent(new CustomEvent("atlas:evento", { detail:{ evento, dados:dados || {} } }));
        }catch(e){}

        return ok !== false;
      };
      antigo.__emitComOnAny = true;
    }

    antigo.versao = "1.1-onAny";
    void 0;
    return;
  }

  const listeners = new Map();
  const anyListeners = new Set();

  function on(evento, callback){
    if(!evento || typeof callback !== "function") return function(){};
    if(!listeners.has(evento)) listeners.set(evento, new Set());
    listeners.get(evento).add(callback);
    return function off(){
      try{ listeners.get(evento)?.delete(callback); }catch(e){}
    };
  }

  function once(evento, callback){
    if(!evento || typeof callback !== "function") return function(){};
    const off = on(evento, function(dados){
      try{ off(); }catch(e){}
      callback(dados);
    });
    return off;
  }

  function off(evento, callback){
    try{ listeners.get(evento)?.delete(callback); }catch(e){}
  }

  function onAny(callback){
    if(typeof callback !== "function") return function(){};
    anyListeners.add(callback);
    return function offAny(){
      try{ anyListeners.delete(callback); }catch(e){}
    };
  }

  function emit(evento, dados){
    if(!evento) return false;
    const payload = dados || {};

    try{
      const grupo = listeners.get(evento);
      if(grupo){
        grupo.forEach(fn => {
          try{ fn(payload); }catch(err){ console.error("AtlasEvents listener:", evento, err); }
        });
      }

      anyListeners.forEach(fn => {
        try{ fn(evento, payload); }catch(err){ console.error("AtlasEvents onAny:", evento, err); }
      });

      try{
        window.dispatchEvent(new CustomEvent("atlas:evento", { detail:{ evento, dados:payload } }));
      }catch(e){}

      return true;
    }catch(e){
      console.error("AtlasEvents.emit erro:", e);
      return false;
    }
  }

  window.AtlasEvents = {
    __loaded:true,
    versao:"1.1-onAny",
    __listeners:listeners,
    __anyListeners:anyListeners,
    on,
    once,
    off,
    onAny,
    emit
  };

  void 0;
})();
