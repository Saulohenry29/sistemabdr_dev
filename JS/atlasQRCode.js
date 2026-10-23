/* =========================================================
   ARQUIVO: atlasQRCode.js
   MÓDULO: Atlas QR Code Local
   VERSÃO: 1.0.0

   OBJETIVO:
   - gerar QR Code localmente, sem API externa;
   - manter cache em memória para reaproveitar QR já criado;
   - oferecer o mesmo motor para impressão individual e em lote;
   - permitir pré-geração logo após o cadastro do patrimônio.
========================================================= */
(function(global){
"use strict";

const CACHE = new Map();
const URL_BASE_PADRAO = "https://www.bdrgestao.com.br/etiqueta.html?id=";

function texto(v){ return String(v ?? "").trim(); }
function normalizarTamanho(v, padrao=220){
  const n=Number(v);
  return Number.isFinite(n) ? Math.max(96,Math.min(1024,Math.round(n))) : padrao;
}
function linkPatrimonio(codigo){
  return URL_BASE_PADRAO + encodeURIComponent(texto(codigo));
}
function chaveCache(conteudo,tamanho,nivel){
  return `${nivel}|${tamanho}|${conteudo}`;
}
function nivelCorrecao(nivel="M"){
  const L=global.AtlasQRErrorCorrectLevel;
  if(!L) throw new Error("Atlas QR Core ainda não carregou.");
  return L[String(nivel||"M").toUpperCase()] ?? L.M;
}
function gerarDataURL(conteudo, opcoes={}){
  const valor=texto(conteudo);
  if(!valor) throw new Error("Conteúdo vazio para gerar QR Code.");

  const Core=global.AtlasQRCodeCore;
  if(typeof Core!=="function"){
    throw new Error("JS/atlasQRCode/qrcode.min.js não foi carregado.");
  }

  const tamanho=normalizarTamanho(opcoes.tamanho,220);
  const nivel=String(opcoes.nivel||"M").toUpperCase();
  const chave=chaveCache(valor,tamanho,nivel);
  if(CACHE.has(chave)) return CACHE.get(chave);

  const qr=new Core(0,nivelCorrecao(nivel));
  qr.addData(valor);
  qr.make();

  const modulos=qr.getModuleCount();
  const margem=4;
  const total=modulos+(margem*2);
  const escala=Math.max(1,Math.floor(tamanho/total));
  const desenho=total*escala;

  const canvas=document.createElement("canvas");
  canvas.width=desenho;
  canvas.height=desenho;
  const ctx=canvas.getContext("2d",{alpha:false});
  ctx.fillStyle="#ffffff";
  ctx.fillRect(0,0,desenho,desenho);
  ctx.fillStyle="#000000";

  for(let linha=0;linha<modulos;linha++){
    for(let coluna=0;coluna<modulos;coluna++){
      if(qr.isDark(linha,coluna)){
        ctx.fillRect((coluna+margem)*escala,(linha+margem)*escala,escala,escala);
      }
    }
  }

  const dataURL=canvas.toDataURL("image/png");
  CACHE.set(chave,dataURL);
  return dataURL;
}
function gerarPatrimonio(codigo,opcoes={}){
  return gerarDataURL(linkPatrimonio(codigo),opcoes);
}
async function aplicarEmImagem(imagem,codigoOuConteudo,opcoes={}){
  if(!imagem) throw new Error("Elemento de imagem do QR não encontrado.");
  const dataURL=opcoes.conteudoDireto
    ? gerarDataURL(codigoOuConteudo,opcoes)
    : gerarPatrimonio(codigoOuConteudo,opcoes);
  imagem.src=dataURL;
  imagem.dataset.atlasQrLocal="1";
  if(typeof imagem.decode==="function"){
    try{ await imagem.decode(); }catch(e){}
  }
  return dataURL;
}
function preGerar(codigo,opcoes={}){
  return Promise.resolve(gerarPatrimonio(codigo,opcoes));
}
async function preGerarLista(codigos=[],opcoes={}){
  const unicos=[...new Set((codigos||[]).map(texto).filter(Boolean))];
  const mapa=new Map();
  for(const codigo of unicos){ mapa.set(codigo,gerarPatrimonio(codigo,opcoes)); }
  return mapa;
}
function limparCache(){ CACHE.clear(); }
function quantidadeCache(){ return CACHE.size; }

global.AtlasQRCode={
  versao:"1.0.0",
  linkPatrimonio,
  gerarDataURL,
  gerarPatrimonio,
  aplicarEmImagem,
  preGerar,
  preGerarLista,
  limparCache,
  quantidadeCache
};
})(window);
