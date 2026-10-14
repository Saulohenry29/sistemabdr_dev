/* Rasterização direta da etiqueta oficial em Canvas 2D (sem SVG foreignObject).
   Preserva medidas/posições calculadas do DOM; não modifica impressão convencional. */
(function(global){
  "use strict";
  const W=384,H=240,MARGIN=4;
  function imagem(elemento){
    return new Promise((resolve,reject)=>{
      if(elemento.complete && elemento.naturalWidth>0)return resolve();
      if(elemento.complete && !elemento.naturalWidth)return reject(new Error("Imagem da etiqueta indisponível."));
      elemento.addEventListener("load",resolve,{once:true});
      elemento.addEventListener("error",()=>reject(new Error("Imagem da etiqueta indisponível.")),{once:true});
    });
  }
  function tamanhoTexto(ctx,texto,maxWidth){
    if(ctx.measureText(texto).width<=maxWidth)return texto;
    const reticencias="…";
    let inicio=0,fim=texto.length;
    while(inicio<fim){const meio=Math.ceil((inicio+fim)/2);if(ctx.measureText(texto.slice(0,meio)+reticencias).width<=maxWidth)inicio=meio;else fim=meio-1;}
    return texto.slice(0,inicio)+reticencias;
  }
  function fonte(style){return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;}
  function texto(ctx,elemento,base,escala){
    const style=getComputedStyle(elemento),r=elemento.getBoundingClientRect();
    let value=elemento.textContent||"";
    if(style.textTransform==="uppercase")value=value.toLocaleUpperCase("pt-BR");
    if(style.textTransform==="lowercase")value=value.toLocaleLowerCase("pt-BR");
    ctx.save();ctx.fillStyle=style.color;ctx.font=fonte(style);ctx.textBaseline="top";
    const x=r.left-base.left,y=r.top-base.top;
    const width=r.width;
    if(style.textOverflow==="ellipsis")value=tamanhoTexto(ctx,value,width);
    const measured=ctx.measureText(value).width;
    const align=style.textAlign;
    let tx=x;if(align==="right"||align==="end")tx+=width-measured;else if(align==="center")tx+=(width-measured)/2;
    // CSS letter-spacing is reproduced through canvas text rendering where supported.
    if("letterSpacing" in ctx)ctx.letterSpacing=style.letterSpacing;
    // Vertical centering approximates CSS line box while preserving font and original DOM geometry.
    const fs=parseFloat(style.fontSize)||12;
    const line=parseFloat(style.lineHeight)||fs;
    ctx.fillText(value,tx,y+Math.max(0,(r.height-fs)/2),width);
    ctx.restore();
  }
  function borda(ctx,width,height,style){
    const after=getComputedStyle(document.getElementById("label"),"::after");
    const stroke=parseFloat(after.borderTopWidth)||1;
    const radius=parseFloat(style.borderTopLeftRadius)||0;
    const offset=stroke/2;
    ctx.strokeStyle=after.borderTopColor||"#111";ctx.lineWidth=stroke;
    ctx.beginPath();ctx.roundRect(offset,offset,width-stroke,height-stroke,Math.max(0,radius-stroke/2));ctx.stroke();
  }
  async function gerar(){
    const label=document.getElementById("label");
    if(!label||!document.body.classList.contains("ready"))throw new Error("Etiqueta ainda não está pronta.");
    await document.fonts.ready;
    const gear=label.querySelector(".gear"),qr=label.querySelector(".qr");
    await Promise.all([imagem(gear),imagem(qr)]);
    const base=label.getBoundingClientRect();
    if(!base.width||!base.height)throw new Error("Etiqueta sem dimensões.");
    const canvas=document.createElement("canvas");canvas.width=W;canvas.height=H;
    const ctx=canvas.getContext("2d",{willReadFrequently:false});
    if(!ctx)throw new Error("Canvas não disponível.");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
    const scale=Math.min((W-MARGIN*2)/base.width,(H-MARGIN*2)/base.height);
    const dx=(W-base.width*scale)/2,dy=(H-base.height*scale)/2;
    ctx.translate(dx,dy);ctx.scale(scale,scale);
    ctx.fillStyle="#fff";ctx.fillRect(0,0,base.width,base.height);
    for(const element of [gear,qr]){
      const r=element.getBoundingClientRect();
      ctx.drawImage(element,r.left-base.left,r.top-base.top,r.width,r.height);
    }
    for(const selector of [".bdr",".sub",".local",".item",".codigo"]){
      const element=label.querySelector(selector);if(element)texto(ctx,element,base,scale);
    }
    borda(ctx,base.width,base.height,getComputedStyle(label));
    try{return canvas.toDataURL("image/png");}
    catch(e){throw new Error("Falha ao exportar etiqueta: "+e.message);}
  }
  global.AtlasEtiquetaImagemB1={gerar};
})(window);
