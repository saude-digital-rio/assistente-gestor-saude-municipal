(function (root) {
  'use strict';

  const FORM_URL = 'https://tabnet.rio.rj.gov.br/cgi-bin/dh?tabpni/definicoes/tabpni.def';
  const FIRST_COLUMN = 'Estabelecimento de saúde';
  let formHtmlPromise;

  function periods(options) {
    return options.filter(({ value }) => /^tabpni\d{2}(0[1-9]|1[0-2])\.dbf$/i.test(value))
      .map(option => option.value);
  }

  function requestEntries(months) {
    return [
      ['Linha', 'Estabelecimento_de_saúde'],
      ['Coluna', 'Mes_da_Vacinação'],
      ['Incremento', 'Total_de_registros_consultados'],
      ...months.map(month => ['Arquivos', month]),
      ['formato', 'prn'],
      ['mostre', 'Mostra']
    ];
  }

  async function extract(limit, onProgress = () => {}) {
    formHtmlPromise ||= (async () => {
      const response = await fetch(FORM_URL, { credentials: 'include', signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`SI-PNI retornou HTTP ${response.status} ao abrir o formulário.`);
      return new TextDecoder('windows-1252').decode(await response.arrayBuffer());
    })();
    const doc = new DOMParser().parseFromString(await formHtmlPromise, 'text/html');
    const form = doc.querySelector('select[name="Linha"]')?.form;
    if (!form) throw new Error('Formulário do SI-PNI indisponível.');
    const options = name => [...(form.elements.namedItem(name)?.options || [])]
      .map(option => ({ value: option.value, text: option.textContent.trim() }));
    const available = options('Arquivos');
    const eligible = periods(available).map(value => available.find(option => option.value === value));
    for (const [name, value] of requestEntries(eligible.map(option => option.value))) {
      if (name === 'mostre' || name === 'formato') continue;
      if (!options(name).some(option => option.value === value)) {
        throw new Error(`Filtro ${name} não encontrado no SI-PNI.`);
      }
    }
    if (!form.querySelector('input[name="formato"][value="prn"]')) {
      throw new Error('Opção CSV não encontrada no SI-PNI.');
    }
    const action = new URL(form.getAttribute('action') || FORM_URL, FORM_URL);
    if (action.origin !== new URL(FORM_URL).origin) throw new Error('Endereço de consulta inesperado no SI-PNI.');
    const { months, parts } = await root.Tabnet.collectRecentMonths(eligible, limit, async batch => {
      const response = await fetch(action, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=ISO-8859-1' },
        body: root.Tabnet.encodeForm(requestEntries(batch.map(option => option.value))),
        signal: AbortSignal.timeout(180_000)
      });
      if (!response.ok) throw new Error(`SI-PNI retornou HTTP ${response.status} ao gerar o relatório.`);
      const html = new TextDecoder('windows-1252').decode(await response.arrayBuffer());
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const csv = parsed.querySelector('pre')?.textContent;
      if (!csv && !/Nenhum registro selecionado/i.test(parsed.body?.textContent || '')) {
        throw new Error('O SI-PNI não retornou CSV; confira a disponibilidade do serviço.');
      }
      return csv || null;
    }, { onProgress, firstColumn: FIRST_COLUMN, batchSize: limit });
    if (months.length < limit) throw new Error(`O SI-PNI oferece somente ${months.length} competências com dados.`);
    const labels = months.map(option => option.text).reverse();
    const { text, rows } = root.Tabnet.mergeCsv(parts, labels, FIRST_COLUMN);
    const code = option => `20${option.value.slice(6, 10)}`;
    return { name: `sipni_covid_${code(months.at(-1))}-${code(months[0])}.csv`, text: '\ufeff' + text, rows };
  }

  const api = { periods, requestEntries, extract };
  root.Sipni = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
