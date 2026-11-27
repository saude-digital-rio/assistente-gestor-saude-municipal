(function (root) {
  'use strict';

  const FORM_URL = 'https://tabnet.rio.rj.gov.br/cgi-bin/dh?sia/definicoes/producao_2008.def';
  let formHtmlPromise;

  function periods(options) {
    return options.filter(({ value }) => {
      const match = /^parj(\d{2})(0[1-9]|1[0-2])\.dbf$/i.exec(value);
      return match && Number(match[1]) >= 25;
    }).map(option => option.value);
  }

  function units(options, report) {
    const pattern = report === 'aps'
      ? /^\d{7} SMS (?:CF|CMS|CSE)\b/i
      : /^\d{7} SMS (?:POLIC\w*|CAPSI?|CE(?:CO|CCO)|DEAMB)\b/i;
    return options.filter(({ text }) => pattern.test(text.trim()) ||
      (report === 'especializada' && /^8148023\b/.test(text.trim())))
      .map(option => option.value);
  }

  function cleanCsv(raw, firstColumn = 'Estabel-CNES-RJ') {
    const lines = raw.trim().split(/\r?\n/).filter(line => line.trim() && line.trim() !== '&');
    const isRow = line => firstColumn === 'Estabel-CNES-RJ'
      ? /^"\d{7}\b/.test(line)
      : /^"[^";]+";/.test(line) && !line.startsWith('"Total";');
    if (!lines[0]?.startsWith(`"${firstColumn}";"`) || !lines[0].endsWith(';"Total"') ||
      !lines.slice(1).some(isRow)) {
      throw new Error('A resposta não é um CSV do TabNet com estabelecimentos e meses.');
    }
    return { text: lines.join('\n') + '\n', rows: lines.slice(1).filter(isRow).length };
  }

  function encodeForm(entries) {
    const encode = value => [...String(value)].map(char => {
      const code = char.charCodeAt(0);
      if (code > 255) throw new Error('O formulário do TabNet contém um caractere fora de ISO-8859-1.');
      return /[A-Za-z0-9*_.-]/.test(char) ? char : char === ' ' ? '+' : `%${code.toString(16).toUpperCase().padStart(2, '0')}`;
    }).join('');
    return [...entries].map(([name, value]) => `${encode(name)}=${encode(value)}`).join('&');
  }

  async function collectRecentMonths(available, limit, query, { onProgress = () => {}, firstColumn = 'Estabel-CNES-RJ', batchSize = 3 } = {}) {
    if (![1, 6, 12].includes(limit)) throw new Error('Quantidade de competências inválida.');
    const months = [], parts = [];
    let checked = 0;
    while (months.length < limit && checked < available.length) {
      const batch = available.slice(checked, checked + Math.min(batchSize, limit - months.length));
      checked += batch.length;
      const csv = await query(batch);
      if (csv) {
        const header = cleanCsv(csv, firstColumn).text.split('\n', 1)[0].split(';').slice(1, -1).map(value => value.slice(1, -1));
        if (header.some(value => !batch.some(option => option.text.trim() === value))) {
          throw new Error('O TabNet retornou competências inesperadas.');
        }
        months.push(...batch.filter(option => header.includes(option.text.trim())));
        parts.push(csv);
      }
      onProgress(checked, available.length, months.length, limit);
    }
    return { months, parts };
  }

  function mergeCsv(parts, labels, firstColumn = 'Estabel-CNES-RJ') {
    const establishments = new Map();
    const totals = new Map();
    const number = value => {
      const parsed = Number(value.replaceAll('.', ''));
      if (!Number.isFinite(parsed)) throw new Error('O TabNet retornou um total inválido.');
      return parsed;
    };
    for (const part of parts) {
      if (!part) continue;
      const lines = cleanCsv(part, firstColumn).text.trim().split('\n');
      const columns = lines.shift().split(';').slice(1, -1).map(value => value.slice(1, -1));
      if (columns.some(column => !labels.includes(column) || totals.has(column))) {
        throw new Error('O TabNet retornou meses inesperados ou repetidos.');
      }
      for (const line of lines) {
        const match = /^"((?:[^"]|"")*)";(.*)$/.exec(line);
        const values = match?.[2].split(';');
        if (!values || values.length !== columns.length + 1) throw new Error('O CSV do TabNet mudou de formato.');
        const name = match[1].replaceAll('""', '"');
        if (name === 'Total') {
          columns.forEach((column, index) => totals.set(column, values[index]));
        } else {
          const row = establishments.get(name) || { cells: new Map(), total: 0 };
          columns.forEach((column, index) => row.cells.set(column, values[index]));
          row.total += number(values.at(-1));
          establishments.set(name, row);
        }
      }
    }
    if (!establishments.size) throw new Error('O TabNet não retornou dados para os filtros selecionados.');
    const header = [`"${firstColumn}"`, ...labels.map(label => `"${label}"`), '"Total"'].join(';');
    const rows = [...establishments].sort(([a], [b]) => a.localeCompare(b)).map(([name, row]) =>
      [`"${name.replaceAll('"', '""')}"`, ...labels.map(label => row.cells.get(label) || ''), row.total].join(';'));
    const total = ['"Total"', ...labels.map(label => totals.get(label) || ''),
      [...establishments.values()].reduce((sum, row) => sum + row.total, 0)].join(';');
    return { text: [header, ...rows, total].join('\n') + '\n', rows: rows.length };
  }

  async function extract(report, limit, onProgress = () => {}) {
    if (!['aps', 'especializada'].includes(report)) throw new Error('Relatório TabNet inválido.');
    formHtmlPromise ||= (async () => {
      const response = await fetch(FORM_URL, { credentials: 'include', signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`TabNet retornou HTTP ${response.status} ao abrir o formulário.`);
      return new TextDecoder('windows-1252').decode(await response.arrayBuffer());
    })();
    const doc = new DOMParser().parseFromString(await formHtmlPromise, 'text/html');
    const form = doc.querySelector('select[name="Linha"]')?.form;
    if (!form) throw new Error('Formulário do TabNet indisponível.');
    const validate = (name, values) => {
      const field = form.elements.namedItem(name);
      if (!field || !values.length || values.some(value => ![...field.options].some(option => option.value === value))) {
        throw new Error(`Filtro ${name} não encontrado no TabNet.`);
      }
    };
    const options = name => [...form.elements.namedItem(name).options].map(option => ({ value: option.value, text: option.textContent }));
    const available = options('Arquivos');
    const eligible = periods(available).map(value => available.find(option => option.value === value));
    const establishments = units(options('SEstabel-CNES-RJ'), report);
    const complexity = report === 'aps' ? ['2', '3', '4'] : ['1', '2', '3', '4'];
    validate('Linha', ['Estabel-CNES-RJ']);
    validate('Coluna', ['Mês_Cobrança']);
    validate('Incremento', ['Qtd.Apresentada']);
    validate('Arquivos', eligible.map(option => option.value));
    validate('SEstabel-CNES-RJ', establishments);
    validate('SCOMPLEXIDADE', complexity);
    const format = form.querySelector('input[name="formato"][value="prn"]');
    if (!format) throw new Error('Opção CSV não encontrada no TabNet.');
    const action = new URL(form.getAttribute('action') || FORM_URL, FORM_URL);
    if (action.origin !== new URL(FORM_URL).origin) throw new Error('Endereço de consulta inesperado no TabNet.');
    const { months, parts } = await collectRecentMonths(eligible, limit, async batch => {
      const body = encodeForm([
        ['Linha', 'Estabel-CNES-RJ'], ['Coluna', 'Mês_Cobrança'], ['Incremento', 'Qtd.Apresentada'],
        ...batch.map(option => ['Arquivos', option.value]),
        ...establishments.map(value => ['SEstabel-CNES-RJ', value]),
        ...complexity.map(value => ['SCOMPLEXIDADE', value]),
        ['formato', 'prn'], ['mostre', 'Mostra']
      ]);
      const result = await fetch(action, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=ISO-8859-1' },
        body, signal: AbortSignal.timeout(180_000)
      });
      if (!result.ok) throw new Error(`TabNet retornou HTTP ${result.status} ao gerar o relatório.`);
      const html = new TextDecoder('windows-1252').decode(await result.arrayBuffer());
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const csv = parsed.querySelector('pre')?.textContent;
      if (!csv && !/Nenhum registro selecionado/i.test(parsed.body?.textContent || '')) {
        throw new Error('O TabNet não retornou CSV; confira a disponibilidade do serviço.');
      }
      return csv || null;
    }, { onProgress });
    if (months.length < limit) throw new Error(`O TabNet oferece somente ${months.length} competências com dados desde janeiro de 2025.`);
    const labels = months.map(option => option.text.trim()).reverse();
    const { text, rows } = mergeCsv(parts, labels);
    return { name: `tabnet_${report}_20${months.at(-1).value.slice(4, 8)}-20${months[0].value.slice(4, 8)}.csv`, text: '\ufeff' + text, rows };
  }

  const api = { periods, units, cleanCsv, encodeForm, collectRecentMonths, mergeCsv, extract };
  root.Tabnet = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
