/* AtlasPaginacao v1.2 — componente reutilizável (sem acesso ao banco).
   AtlasPaginacao.criar({elemento,pagina,total,porPagina,aoMudar:(pagina)=>{}})
   Retorna {atualizar({pagina,total,porPagina}),destruir()}.
   O número sempre indica a página atual; as setas integradas são independentes
   das setas inconsistentes dos inputs nativos, com limites individuais. */
(function(global){
  'use strict';
  function numero(v,padrao){var n=Number(v);return Number.isSafeInteger(n)&&n>=0?n:padrao;}
  function criar(opcoes){
    var raiz=typeof opcoes.elemento==='string'?document.querySelector(opcoes.elemento):opcoes.elemento;
    if(!raiz||typeof opcoes.aoMudar!=='function')throw new Error('AtlasPaginacao: elemento e aoMudar são obrigatórios');
    var estado={pagina:1,total:0,porPagina:30};
    raiz.classList.add('atlas-paginacao');
    raiz.setAttribute('role','navigation');
    raiz.setAttribute('aria-label',opcoes.rotulo||'Paginação de resultados');
    raiz.innerHTML='<div class="atlas-paginacao__anteriores">'+
      '<button type="button" data-pg="primeira" aria-label="Primeira página" title="Primeira página">&laquo;</button>'+
      '<button type="button" data-pg="anterior" aria-label="Página anterior" title="Página anterior">&lsaquo;</button></div>'+
      '<strong class="atlas-paginacao__estado" aria-live="polite">1 de 1</strong>'+
      '<div class="atlas-paginacao__direita">'+
        '<div class="atlas-paginacao__proximas">'+
          '<button type="button" data-pg="proxima" aria-label="Próxima página" title="Próxima página">&rsaquo;</button>'+
          '<button type="button" data-pg="ultima" aria-label="Última página" title="Última página">&raquo;</button></div>'+
        '<form class="atlas-paginacao__ir" novalidate><span class="atlas-paginacao__rotulo">Ir para</span>'+
          '<span class="atlas-paginacao__campo">'+
            '<input type="number" min="1" step="1" inputmode="numeric" aria-label="Número da página" autocomplete="off">'+
            '<span class="atlas-paginacao__spin">'+
              '<button type="button" data-pg="incrementar" aria-label="Aumentar número da página" title="Página seguinte">&#9650;</button>'+
              '<button type="button" data-pg="decrementar" aria-label="Diminuir número da página" title="Página anterior">&#9660;</button>'+
            '</span></span><button type="submit">Ir</button></form>'+
        '<small class="atlas-paginacao__faixa"></small></div>';
    var input=raiz.querySelector('input');
    var form=raiz.querySelector('form');
    function paginas(){return Math.max(1,Math.ceil(estado.total/estado.porPagina));}
    function desenhar(){
      var limite=paginas();estado.pagina=Math.max(1,Math.min(limite,estado.pagina));
      raiz.querySelector('.atlas-paginacao__estado').textContent=estado.pagina+' de '+limite;
      raiz.querySelector('.atlas-paginacao__faixa').textContent=estado.total?'Exibindo '+((estado.pagina-1)*estado.porPagina+1).toLocaleString('pt-BR')+'–'+Math.min(estado.pagina*estado.porPagina,estado.total).toLocaleString('pt-BR')+' de '+estado.total.toLocaleString('pt-BR'):'Nenhum registro';
      ['primeira','anterior','decrementar'].forEach(function(k){raiz.querySelector('[data-pg="'+k+'"]').disabled=estado.pagina===1;});
      ['proxima','ultima','incrementar'].forEach(function(k){raiz.querySelector('[data-pg="'+k+'"]').disabled=estado.pagina===limite;});
      input.max=String(limite);
      var preservar=document.activeElement===input&&input.dataset.editando==='1'&&input.dataset.paginaRenderizada===String(estado.pagina);
      if(!preservar){input.value=String(estado.pagina);input.dataset.editando='0';input.setCustomValidity('');}
      input.dataset.paginaRenderizada=String(estado.pagina);
      raiz.dataset.paginaAtual=String(estado.pagina);raiz.dataset.totalPaginas=String(limite);
    }
    function navegar(valor){
      var n=Number(valor),limite=paginas();
      if(!Number.isSafeInteger(n)||n<1||n>limite){
        input.setCustomValidity('Digite um número de 1 a '+limite);input.reportValidity();return;
      }
      input.setCustomValidity('');input.dataset.editando='0';
      if(n!==estado.pagina)opcoes.aoMudar(n);
      else input.value=String(estado.pagina);
    }
    function clicar(e){
      var b=e.target.closest('[data-pg]');if(!b||!raiz.contains(b)||b.disabled)return;
      var acao=b.dataset.pg;
      var pagina=acao==='primeira'?1:acao==='ultima'?paginas():
        estado.pagina+(['proxima','incrementar'].includes(acao)?1:-1);
      navegar(pagina);
    }
    function enviar(e){e.preventDefault();navegar(input.value);}
    function digitando(){input.setCustomValidity('');input.dataset.editando='1';}
    function teclado(e){
      if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;
      e.preventDefault();
      var base=Number(input.value);
      if(!Number.isSafeInteger(base)||base<1||base>paginas())base=estado.pagina;
      navegar(Math.max(1,Math.min(paginas(),base+(e.key==='ArrowUp'?1:-1))));
    }
    function perdeuFoco(e){
      // O botão "Ir" ainda precisa ler o número digitado no evento submit.
      if(e.relatedTarget&&form.contains(e.relatedTarget))return;
      input.dataset.editando='0';input.setCustomValidity('');input.value=String(estado.pagina);
    }
    raiz.addEventListener('click',clicar);
    form.addEventListener('submit',enviar);
    input.addEventListener('input',digitando);
    input.addEventListener('keydown',teclado);
    input.addEventListener('blur',perdeuFoco);
    function atualizar(dados){
      dados=dados||{};
      if('total' in dados)estado.total=numero(dados.total,0);
      if('porPagina' in dados)estado.porPagina=Math.max(1,numero(dados.porPagina,30));
      if('pagina' in dados)estado.pagina=numero(dados.pagina,1);
      desenhar();
    }
    atualizar(opcoes);
    return {atualizar:atualizar,destruir:function(){raiz.removeEventListener('click',clicar);raiz.replaceChildren();raiz.classList.remove('atlas-paginacao');}};
  }
  global.AtlasPaginacao=Object.freeze({criar:criar});
})(window);
