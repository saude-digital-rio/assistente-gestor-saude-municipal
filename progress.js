const params = new URLSearchParams(location.search);
const sourceTabId = Number(params.get('tab'));
const competencyCount = Number(params.get('competencies'));
const selected = (params.get('reports') || '').split(',');
const reports = selected.filter(value => ['atendimentos', 'procedimentos', 'visitas', 'coletiva'].includes(value));
const tabnetReports = selected.filter(value => ['tabnet_aps', 'tabnet_especializada'].includes(value));
const sipniReports = selected.filter(value => value === 'sipni_covid');
const sisabExpected = competencyCount * reports.reduce((total, report) => total + (report === 'atendimentos' ? 3 : 1), 0);
const tabnetExpected = tabnetReports.length;
const sipniExpected = sipniReports.length;
const expected = sisabExpected + tabnetExpected + sipniExpected;
const jobId = crypto.randomUUID();
const files = [];
let started = false;
let finished = false;
let sisabDone = !reports.length;
let publicDone = !tabnetReports.length && !sipniReports.length;
let publicStarted = false;
let activeModule;
let competencies = [];
let timer;

const eyebrow = document.querySelector('.eyebrow');
const status = document.getElementById('status');
const detail = document.getElementById('detail');
const count = document.getElementById('count');
const filesCount = document.getElementById('files-count');
const filesEmpty = document.getElementById('files-empty');
const fileList = document.getElementById('files');
const fileScroll = document.querySelector('.files-scroll');
const meter = document.querySelector('.meter');
const bar = document.getElementById('bar');
const back = document.getElementById('back');
const stageNames = { sisab: 'SISAB', tabnet: 'SIA @ TabNet Municipal', sipni: 'SI-PNI @ TabNet Municipal' };
const stages = Object.fromEntries(['sisab', 'tabnet', 'sipni'].map(name => [name, {
  element: document.getElementById(`stage-${name}`),
  number: document.querySelector(`#stage-${name} .stage-number`),
  badge: document.getElementById(`${name}-state`),
  progress: document.getElementById(`${name}-progress`),
  expected: { sisab: sisabExpected, tabnet: tabnetExpected, sipni: sipniExpected }[name],
  received: 0
}]));

function setStageState(name, state) {
  const stage = stages[name];
  stage.element.dataset.state = state;
  stage.badge.textContent = { pending: 'Pendente', active: 'Em curso', done: 'Concluído', error: 'Interrompido' }[state];
  if (state === 'active') activeModule = name;
  if (state === 'done' && activeModule === name) activeModule = undefined;
}

function completeStage(name) {
  if (stages[name].received !== stages[name].expected) throw new Error(`A etapa ${stageNames[name]} terminou sem todos os CSVs.`);
  setStageState(name, 'done');
}

function setupStages() {
  const order = [reports.length && 'sisab', tabnetReports.length && 'tabnet', sipniReports.length && 'sipni'].filter(Boolean);
  order.forEach((name, index) => {
    const stage = stages[name];
    stage.element.hidden = false;
    stage.number.textContent = index + 1;
    stage.element.setAttribute('aria-label', `Etapa ${index + 1}: ${stageNames[name]}`);
    stage.progress.textContent = `0 de ${stage.expected} CSVs`;
  });
}

function fail(message) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  if (activeModule) setStageState(activeModule, 'error');
  eyebrow.textContent = 'EXTRAÇÃO INTERROMPIDA';
  status.textContent = 'Extração interrompida';
  detail.textContent = `${message} Nenhum ZIP parcial foi salvo.`;
  detail.classList.add('error');
  back.hidden = false;
}

function resetTimer() {
  if (!reports.length || sisabDone) return;
  clearTimeout(timer);
  timer = setTimeout(() => fail('O SISAB não respondeu dentro do tempo esperado. Confira a sessão e tente novamente.'), started ? 180_000 : 120_000);
}

function appendFile(file, module) {
  if (!/^[\w.-]+\.csv$/.test(file.name) || files.some(existing => existing.name === file.name) ||
      !Number.isInteger(file.rows) || file.rows < 0 || typeof file.text !== 'string' ||
      stages[module].received >= stages[module].expected) {
    throw new Error('A extração retornou um arquivo duplicado ou inválido.');
  }
  files.push({ name: file.name, text: file.text });
  const item = document.createElement('li');
  item.className = 'file-item';
  const type = document.createElement('span');
  type.className = 'file-type';
  type.textContent = 'CSV';
  const copy = document.createElement('span');
  copy.className = 'file-copy';
  const title = document.createElement('strong');
  const key = module === 'sisab' ? file.name.replace(/^\d{6}_|\.csv$/g, '')
    : module === 'sipni' ? 'sipni_covid' : file.name.match(/^tabnet_(aps|especializada)_/)?.[1];
  title.textContent = ({
    atendimentos_enfermeiro: 'Atendimentos · Enfermeiro',
    atendimentos_dentista: 'Atendimentos · Dentista',
    atendimentos_medico: 'Atendimentos · Médico',
    procedimentos: 'Procedimentos',
    visitas_domiciliares: 'Visitas domiciliares',
    atividade_coletiva: 'Atividade coletiva',
    aps: 'Procedimentos na APS',
    especializada: 'Procedimentos especializados',
    sipni_covid: 'Vacinação contra COVID-19'
  })[key] || 'Relatório CSV';
  const filename = document.createElement('small');
  filename.textContent = file.name;
  copy.append(title, filename);
  const rows = document.createElement('span');
  rows.className = 'file-rows';
  rows.textContent = `${new Intl.NumberFormat('pt-BR').format(file.rows)} linhas`;
  item.append(type, copy, rows);
  const follow = fileScroll.scrollTop + fileScroll.clientHeight >= fileScroll.scrollHeight - 24;
  filesEmpty.hidden = true;
  fileList.append(item);
  if (follow) fileScroll.scrollTop = fileScroll.scrollHeight;
  count.textContent = `${files.length} de ${expected} CSVs extraídos`;
  filesCount.textContent = `${files.length} ${files.length === 1 ? 'arquivo' : 'arquivos'}`;
  const progress = Math.min(100, Math.round(files.length / expected * 100));
  bar.style.width = `${progress}%`;
  meter.setAttribute('aria-valuenow', String(progress));
  const stage = stages[module];
  stage.received++;
  stage.progress.textContent = `${stage.received} de ${stage.expected} CSVs`;
}

function maybeFinish() {
  if (sisabDone && publicDone && !finished) finish().catch(error => fail(error.message));
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!reports.length || message.jobId !== jobId || sender.tab?.id !== sourceTabId || finished) return;
  resetTimer();
  if (message.type === 'file') {
    try { appendFile(message, 'sisab'); } catch (error) { fail(error.message); }
    respond({ ok: !finished });
  } else if (message.type === 'error') {
    fail(message.message);
    respond({ ok: true });
  } else if (message.type === 'done') {
    respond({ ok: true });
    competencies = message.competencies;
    sisabDone = true;
    clearTimeout(timer);
    try {
      completeStage('sisab');
      if (!publicDone) runPublicStages().catch(error => fail(error.message));
      else maybeFinish();
    } catch (error) { fail(error.message); }
  }
});

async function finish() {
  if (finished) return;
  if (files.length !== expected || (reports.length && (!Array.isArray(competencies) || competencies.length !== competencyCount))) {
    throw new Error('A extração terminou sem todos os CSVs esperados.');
  }
  eyebrow.textContent = 'FINALIZANDO';
  status.textContent = 'Organizando seu ZIP…';
  detail.textContent = 'Todos os CSVs foram extraídos. Salvando o arquivo em Downloads.';
  const blob = SisabCore.makeZip(files);
  const url = URL.createObjectURL(blob);
  const filename = reports.length && publicDone && !tabnetReports.length && !sipniReports.length
    ? `sisab_${competencies.at(-1)}-${competencies[0]}.zip`
    : `${reports.length ? 'gestor' : 'tabnet'}_${competencyCount}_competencias.zip`;
  try {
    const downloadId = await chrome.downloads.download({ url, filename, saveAs: false, conflictAction: 'uniquify' });
    await new Promise((resolve, reject) => {
      const settle = (error) => {
        chrome.downloads.onChanged.removeListener(listener);
        if (error) reject(error); else resolve();
      };
      const listener = change => {
        if (change.id !== downloadId || !change.state) return;
        settle(change.state.current === 'complete' ? null : new Error(change.error?.current || 'Download interrompido.'));
      };
      chrome.downloads.onChanged.addListener(listener);
      chrome.downloads.search({ id: downloadId }).then(([item]) => {
        if (item?.state === 'complete') settle(null);
        else if (item?.state === 'interrupted') settle(new Error(item.error || 'Download interrompido.'));
      }).catch(settle);
    });
    finished = true;
    clearTimeout(timer);
    eyebrow.textContent = 'EXTRAÇÃO CONCLUÍDA';
    status.textContent = 'ZIP salvo em Downloads';
    detail.textContent = `${files.length} CSVs extraídos.`;
    count.textContent = filename;
    back.hidden = false;
  } catch (error) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.textContent = 'Clique para salvar o ZIP';
    detail.replaceChildren(link);
    eyebrow.textContent = 'ZIP PRONTO';
    status.textContent = 'ZIP pronto para salvar';
    finished = true;
    back.hidden = false;
    return;
  }
  URL.revokeObjectURL(url);
}

async function onTabUpdated(tabId, info, tab) {
  if (finished || !reports.length || tabId !== sourceTabId || started || info.status !== 'complete') return;
  if (tab.url?.startsWith('https://sisab.saude.gov.br/paginas/acessoRestrito/indexMunicipio.xhtml')) {
    started = true;
    resetTimer();
    status.textContent = 'Extraindo SISAB…';
    detail.textContent = 'Consultando os formulários do SISAB pela sessão desta aba.';
    try {
      await chrome.scripting.executeScript({ target: { tabId: sourceTabId }, files: ['core.js', 'extractor.js'] });
      await chrome.tabs.sendMessage(sourceTabId, { type: 'extract', jobId, reports, competencyCount });
    } catch (error) { fail(`Não foi possível iniciar a extração: ${error.message}`); }
  }
}

chrome.tabs.onUpdated.addListener(onTabUpdated);
chrome.tabs.onRemoved.addListener(tabId => {
  if (reports.length && tabId === sourceTabId && !sisabDone) fail('A aba do e-Gestor/SISAB foi fechada.');
});

async function runPublicStages() {
  if (publicStarted || finished) return;
  publicStarted = true;
  if (tabnetReports.length) {
    setStageState('tabnet', 'active');
    for (const name of tabnetReports) {
      if (finished) return;
      status.textContent = 'Consultando o SIA no TabNet municipal…';
      const report = name === 'tabnet_aps' ? 'APS' : 'especializados';
      const file = await Tabnet.extract(name.slice('tabnet_'.length), competencyCount, (checked, _available, found, target) => {
        detail.textContent = `Procedimentos ${report}: ${found} de ${target} competências encontradas (${checked} verificadas).`;
      });
      appendFile(file, 'tabnet');
    }
    completeStage('tabnet');
  }
  if (sipniReports.length) {
    if (finished) return;
    setStageState('sipni', 'active');
    status.textContent = 'Consultando o SI-PNI no TabNet municipal…';
    detail.textContent = 'Buscando os registros da vacinação contra COVID-19.';
    const file = await Sipni.extract(competencyCount, (checked, _available, found, target) => {
      detail.textContent = `Vacinação contra COVID-19: ${found} de ${target} competências encontradas (${checked} verificadas).`;
    });
    if (finished) return;
    appendFile(file, 'sipni');
    completeStage('sipni');
  }
  publicDone = true;
  maybeFinish();
}

(async () => {
  if (![1, 6, 12].includes(competencyCount) || !expected || (reports.length && (!Number.isInteger(sourceTabId) || sourceTabId <= 0))) {
    fail('Seleção de relatórios inválida. Inicie novamente pelo painel da extensão.');
    return;
  }
  setupStages();
  count.textContent = `0 de ${expected} CSVs extraídos`;
  if (!reports.length) {
    runPublicStages().catch(error => fail(error.message));
    return;
  }
  setStageState('sisab', 'active');
  status.textContent = 'Acessando o SISAB…';
  detail.textContent = 'Usando a sessão aberta na aba do e-Gestor.';
  resetTimer();
  try {
    const tab = await chrome.tabs.get(sourceTabId);
    if (tab.url?.split(/[?#]/, 1)[0] !== 'https://egestorab.saude.gov.br/paginas/acessoRestrito/perfilAcesso.xhtml') {
      throw new Error('A aba de origem saiu da página Perfil de Acesso do e-Gestor.');
    }
    await chrome.scripting.executeScript({ target: { tabId: sourceTabId }, files: ['start.js'] });
  } catch (error) {
    const tab = await chrome.tabs.get(sourceTabId).catch(() => null);
    if (!tab?.url?.startsWith('https://sisab.saude.gov.br/')) fail(error.message);
  }
})();
