(async () => {
  const profile = '/paginas/acessoRestrito/perfilAcesso.xhtml';
  if (location.hostname !== 'egestorab.saude.gov.br' || location.pathname !== profile) {
    throw new Error('A aba de origem não está na página Perfil de Acesso do e-Gestor.');
  }
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const section = document.getElementById('73');
  const main = document.querySelector('a[href="#73"]');
  if (!section || !main) throw new Error('Não encontrei o módulo SISAB na página.');
  if (!section.getClientRects().length) { main.click(); await pause(300); }
  const access = () => [...section.querySelectorAll('input[type="submit"][value="Acessar Sistema"]')]
    .find(input => input.getClientRects().length && !input.disabled);
  if (!access()) {
    const state = [...section.querySelectorAll('a[href^="#73"]')].find(a => a.getClientRects().length);
    if (state) { state.click(); await pause(300); }
  }
  const button = access();
  if (!button) throw new Error('Não encontrei “Acessar Sistema” para o SISAB.');
  button.click();
})();
