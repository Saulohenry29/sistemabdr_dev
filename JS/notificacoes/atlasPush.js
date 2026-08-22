(()=>{
  "use strict";

  if(window.AtlasPush?.__loaded) return;

  const FIREBASE_CONFIG={
    apiKey:"AIzaSyBAbdbhbP5lTbQ7tXcw4kbU8mubUbarIGk",
    authDomain:"atlas-notificacoes.firebaseapp.com",
    projectId:"atlas-notificacoes",
    storageBucket:"atlas-notificacoes.firebasestorage.app",
    messagingSenderId:"662809427343",
    appId:"1:662809427343:web:eaed25d81533172bbd1ffa"
  };

  const VAPID_PUBLIC_KEY="BAM2gwuLuA9p4Sqizo-BBVfXVPsVopwWAYUnDlB0ghLzmqMovMRs2dtQOmzjsloi5OYmdDvPy-JB6iQXkg_21jQ";
  const FIREBASE_VERSION="12.17.1";
  const TOKEN_KEY="atlas_fcm_token";
  const TOKEN_USER_KEY="atlas_fcm_token_usuario";

  let carregando=false;
  let sdkPromise=null;

  function usuarioAtual(){
    try{
      const raw=localStorage.getItem("usuario_logado") || localStorage.getItem("usuarioLogado");
      return raw ? JSON.parse(raw) : null;
    }catch(_){ return null; }
  }

  function suportadoBasico(){
    return !!(
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "Notification" in window &&
      "PushManager" in window
    );
  }

  async function sdk(){
    if(sdkPromise) return sdkPromise;
    sdkPromise=(async()=>{
      const appMod=await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`);
      const msgMod=await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-messaging.js`);
      const app=appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);
      const ok=await msgMod.isSupported().catch(()=>false);
      if(!ok) throw new Error("FCM não suportado neste navegador.");
      return {app,msgMod,messaging:msgMod.getMessaging(app)};
    })();
    return sdkPromise;
  }

  async function obterRegistroSW(){
    const ready=await navigator.serviceWorker.ready;
    if(!ready) throw new Error("Service Worker do Atlas não está pronto.");
    return ready;
  }

  async function obterToken({solicitarPermissao=false}={}){
    if(carregando) return null;
    carregando=true;
    try{
      if(!suportadoBasico()) throw new Error("Push não suportado neste dispositivo.");
      const u=usuarioAtual();
      if(!u?.id) throw new Error("Usuário do Atlas não identificado.");

      let permissao=Notification.permission;
      if(permissao==="default" && solicitarPermissao){
        permissao=await Notification.requestPermission();
      }
      if(permissao!=="granted"){
        if(permissao==="denied") console.warn("ATLAS PUSH: notificações bloqueadas pelo navegador.");
        return null;
      }

      const {msgMod,messaging}=await sdk();
      const registration=await obterRegistroSW();
      const token=await msgMod.getToken(messaging,{
        vapidKey:VAPID_PUBLIC_KEY,
        serviceWorkerRegistration:registration
      });
      if(!token) throw new Error("Firebase não retornou token FCM.");

      localStorage.setItem(TOKEN_KEY,token);
      localStorage.setItem(TOKEN_USER_KEY,String(u.id));
      localStorage.setItem("atlas_fcm_token_atualizado_em",new Date().toISOString());

      console.log("✅ ATLAS PUSH: dispositivo preparado para FCM — usuário",u.id);
      console.log("🔑 ATLAS PUSH TOKEN (teste):",token);
      window.dispatchEvent(new CustomEvent("atlas:push-token",{detail:{usuario_id:Number(u.id),token}}));
      return token;
    }finally{
      carregando=false;
    }
  }

  async function inicializarSilencioso(){
    if(!suportadoBasico()) return;
    if(Notification.permission==="granted"){
      try{ await obterToken({solicitarPermissao:false}); }
      catch(e){ console.warn("ATLAS PUSH:",e?.message||e); }
    }
  }

  function ligarAoSininho(){
    const seletor=".notif-btn,[data-bdr-btn-notificacoes],#btnNotificacoes,#notificacoesBtn";
    document.addEventListener("click",async ev=>{
      const alvo=ev.target?.closest?.(seletor);
      if(!alvo || Notification.permission!=="default") return;
      try{
        await obterToken({solicitarPermissao:true});
      }catch(e){
        console.warn("ATLAS PUSH:",e?.message||e);
      }
    },{capture:false});
  }

  window.AtlasPush={
    __loaded:true,
    obterToken:()=>obterToken({solicitarPermissao:true}),
    tokenLocal:()=>localStorage.getItem(TOKEN_KEY),
    limparTokenLocal:()=>{
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_USER_KEY);
      localStorage.removeItem("atlas_fcm_token_atualizado_em");
    }
  };

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",()=>{
      ligarAoSininho();
      setTimeout(inicializarSilencioso,1000);
    },{once:true});
  }else{
    ligarAoSininho();
    setTimeout(inicializarSilencioso,1000);
  }

  console.log("✅ ATLAS PUSH FCM carregado");
})();
