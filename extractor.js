(() => {
  const BASE = 'https://sisab.saude.gov.br/paginas/acessoRestrito/relatorio/municipio/saude/';
  const PRODUCTION = BASE + 'RelSauProducao.xhtml';
  const COLLECTIVE = BASE + 'RelSauAtivColetiva.xhtml';

  async function page(url) {
    const response = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`SISAB retornou HTTP ${response.status} ao abrir o relatório.`);
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc.getElementById('selectLinha')) throw new Error('Sessão expirada ou formulário SISAB indisponível. Entre novamente no e-Gestor.');
    return html;
  }

  function formFor(html, url, competency, report) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const line = doc.getElementById('selectLinha');
    const form = line?.form;
    if (!form) throw new Error('Formulário SISAB não encontrado.');
    const choose = (select, values) => {
      if (!select || values.some(value => ![...select.options].some(option => option.value === value))) {
        throw new Error('O SISAB alterou as opções de um filtro do relatório.');
      }
      for (const option of select.options) option.selected = values.includes(option.value);
    };
    const month = [...form.querySelectorAll('select')]
      .find(select => [...select.options].some(option => option.value === competency));
    choose(month, [competency]);
    choose(line, ['CO_EQUIPE']);
    choose(doc.getElementById('selectcoluna'), ['NU_COMPETENCIA']);

    if (report.type === 'coletiva') {
      const activity = [...form.querySelectorAll('input[type="radio"]')].find(input => input.value === 'qtac');
      if (!activity) throw new Error('Opção “Quantidade de Atividade Coletiva” não encontrada.');
      activity.checked = true;
    } else {
      choose(doc.getElementById('tpProducao'), [report.production]);
      if (report.professional) choose(doc.getElementById('categoriaProfissional'), [report.professional]);
      if (report.outcome) choose(doc.getElementById('desfechoVisita'), [report.outcome]);
    }

    const csv = [...form.querySelectorAll('a')].find(link => link.textContent.trim().toLowerCase() === 'csv');
    const action = SisabCore.csvAction(csv?.getAttribute('onclick'));
    const data = new URLSearchParams(new FormData(form));
    if (!data.get('javax.faces.ViewState')) throw new Error('O SISAB não forneceu ViewState válido.');
    data.set(action, action);
    return { url: new URL(form.getAttribute('action') || url, url).href, data };
  }

  async function exportCsv(html, url, competency, report) {
    const request = formFor(html, url, competency, report);
    const response = await fetch(request.url, {
      method: 'POST',
      credentials: 'include',
      referrer: url,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: request.data,
      signal: AbortSignal.timeout(120_000)
    });
    if (!response.ok) throw new Error(`SISAB retornou HTTP ${response.status} em ${competency}_${report.name}.`);
    const raw = new TextDecoder('windows-1252').decode(await response.arrayBuffer());
    return SisabCore.cleanCsv(raw);
  }

  async function send(message) {
    const reply = await chrome.runtime.sendMessage(message);
    if (!reply?.ok) throw new Error('A página de progresso foi fechada.');
  }

  async function run(jobId, selected, competencyCount) {
    const variants = SisabCore.reportVariants(selected);
    const needsProduction = variants.some(report => report.type !== 'coletiva');
    const needsCollective = variants.some(report => report.type === 'coletiva');
    const [productionHtml, collectiveHtml] = await Promise.all([
      needsProduction ? page(PRODUCTION) : null,
      needsCollective ? page(COLLECTIVE) : null
    ]);
    const months = html => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return [...doc.querySelectorAll('select option')].map(option => option.value);
    };
    const available = [productionHtml, collectiveHtml].filter(Boolean).map(months);
    const competencies = SisabCore.latestCompetencies(available, competencyCount);
    if (competencies.length < competencyCount) throw new Error(`O SISAB não oferece ${competencyCount} competências para os relatórios selecionados.`);
    for (const competency of competencies) {
      for (const variant of variants) {
        const url = variant.type === 'coletiva' ? COLLECTIVE : PRODUCTION;
        const html = variant.type === 'coletiva' ? collectiveHtml : productionHtml;
        const result = await exportCsv(html, url, competency, variant);
        await send({ jobId, type: 'file', name: `${competency}_${variant.name}.csv`, text: '\ufeff' + result.text, rows: result.rows });
      }
    }
    await send({ jobId, type: 'done', competencies });
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type !== 'extract') return;
    if (location.hostname !== 'sisab.saude.gov.br' || location.pathname !== '/paginas/acessoRestrito/indexMunicipio.xhtml') {
      respond({ ok: false });
      return;
    }
    respond({ ok: true });
    run(message.jobId, message.reports, message.competencyCount).catch(error => {
      chrome.runtime.sendMessage({ jobId: message.jobId, type: 'error', message: error.message }).catch(() => {});
    });
  });
})();
