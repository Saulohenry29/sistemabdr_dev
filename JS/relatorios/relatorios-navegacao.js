/* Navegação de relatórios. Não altera consultas nem permissões do Atlas. */
function atlasRelTab(nome){
  document.querySelectorAll('[data-atlas-painel]').forEach(el=>{el.hidden=el.dataset.atlasPainel!==nome;});
  document.querySelectorAll('[data-atlas-tab]').forEach(el=>{
    const ativo=el.dataset.atlasTab===nome;el.classList.toggle('ativo',ativo);
    el.setAttribute('aria-current',ativo?'page':'false');
  });
  document.body.classList.toggle('atlas-rel-mov-ativo',nome==='movimentacoes');
  const instrucoes={movimentacoes:'Histórico de envios, recebimentos e situação de patrimônios, incluindo remessas diretas.',patrimonios:'Consulta de patrimônios, filtros, conferência, assinatura e exportação Excel.',sienge:'Exportação e seleção de obras para o Sienge.'};
  const aviso=document.getElementById('atlasRelInstrucao');if(aviso)aviso.textContent=instrucoes[nome]||'';
}
document.addEventListener('DOMContentLoaded',()=>atlasRelTab('movimentacoes'));
