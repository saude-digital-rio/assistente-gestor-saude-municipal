const PROFILE = 'https://egestorab.saude.gov.br/paginas/acessoRestrito/perfilAcesso.xhtml';
const button = document.getElementById('extract');
const locationText = document.getElementById('location');
const competencySelect = document.getElementById('competencies');
const modules = ['sisab', 'tabnet', 'sipni'].map(name => {
  const root = document.getElementById(`${name}-module`);
  return {
    name,
    heading: root.querySelector('.module-heading'),
    body: document.getElementById(`${name}-body`),
    helpButton: root.querySelector('.help-button'),
    help: document.getElementById(`${name}-help`),
    all: document.getElementById(`${name}-all`),
    fields: document.getElementById(`${name}-fields`)
  };
});
let sourceTab;
let initialized = false;

function reportInputs(module) {
  return [...module.fields.querySelectorAll('input[type="checkbox"]')];
}

function refresh() {
  button.disabled = !modules.some(module => !module.fields.disabled && reportInputs(module).some(input => input.checked));
}

function syncAll(module) {
  const inputs = reportInputs(module);
  const checked = inputs.filter(input => input.checked).length;
  module.all.checked = checked === inputs.length;
  module.all.indeterminate = checked > 0 && checked < inputs.length;
  refresh();
}

function setExpanded(module, expanded) {
  module.body.hidden = !expanded;
  module.heading.setAttribute('aria-expanded', String(expanded));
}

for (const module of modules) {
  module.heading.addEventListener('click', () => setExpanded(module, module.body.hidden));
  module.helpButton.addEventListener('click', () => {
    module.help.hidden = !module.help.hidden;
    module.helpButton.setAttribute('aria-expanded', String(!module.help.hidden));
  });
  module.all.addEventListener('change', () => {
    for (const input of reportInputs(module)) input.checked = module.all.checked;
    syncAll(module);
  });
  for (const input of reportInputs(module)) input.addEventListener('change', () => syncAll(module));
  syncAll(module);
}

async function updateSourceTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const wasAvailable = !!sourceTab;
  sourceTab = tab?.url?.split(/[?#]/, 1)[0] === PROFILE ? tab : undefined;
  const sisab = modules[0];
  sisab.fields.disabled = !sourceTab;
  sisab.all.disabled = !sourceTab;
  locationText.classList.toggle('ready', !!sourceTab);
  locationText.textContent = sourceTab
    ? 'SISAB disponível nesta página. SIA e SI-PNI disponíveis em qualquer página.'
    : 'SISAB disponível apenas no Perfil de Acesso do e-Gestor. SIA e SI-PNI disponíveis aqui.';
  if (!initialized || wasAvailable !== !!sourceTab) {
    setExpanded(sisab, !!sourceTab);
    setExpanded(modules[1], !sourceTab);
  }
  initialized = true;
  refresh();
}

updateSourceTab();
chrome.tabs.onActivated.addListener(updateSourceTab);
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (tab.active && (change.url || change.status === 'complete')) updateSourceTab();
});
chrome.windows.onFocusChanged.addListener(updateSourceTab);

button.addEventListener('click', () => {
  if (button.disabled) return;
  button.disabled = true;
  const reports = modules.flatMap(module => module.fields.disabled ? [] : reportInputs(module).filter(input => input.checked).map(input => input.value));
  const query = new URLSearchParams({ reports: reports.join(','), competencies: competencySelect.value });
  if (sourceTab) query.set('tab', sourceTab.id);
  location.href = chrome.runtime.getURL('progress.html') + '?' + query;
});
