(function (root) {
  'use strict';

  const TEAM_TYPES = new Set(['70', '71', '72', '73', '74', '76', '-', '']);

  function latestCompetencies(lists, limit) {
    if (![1, 6, 12].includes(limit) || !lists.length) throw new Error('Quantidade de competências inválida.');
    const valid = value => /^\d{4}(0[1-9]|1[0-2])$/.test(value);
    const available = new Set(lists[0].filter(valid));
    for (const list of lists.slice(1)) {
      const other = new Set(list.filter(valid));
      for (const value of available) if (!other.has(value)) available.delete(value);
    }
    return [...available].sort().reverse().slice(0, limit);
  }

  function csvAction(onclick) {
    const match = /\{'([^']+)':'\1'\}/.exec(onclick || '');
    if (!match) throw new Error('Não foi possível identificar o botão CSV do SISAB.');
    return match[1];
  }

  function reportVariants(selected) {
    return [
      ...(selected.includes('atendimentos') ? [
        { name: 'atendimentos_enfermeiro', production: '4', professional: '10' },
        { name: 'atendimentos_dentista', production: '5', professional: '8' },
        { name: 'atendimentos_medico', production: '4', professional: '14' }
      ] : []),
      ...(selected.includes('procedimentos') ? [{ name: 'procedimentos', production: '7' }] : []),
      ...(selected.includes('visitas') ? [{ name: 'visitas_domiciliares', production: '8', outcome: '1' }] : []),
      ...(selected.includes('coletiva') ? [{ name: 'atividade_coletiva', type: 'coletiva' }] : [])
    ];
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], value = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { value += '"'; i++; }
        else quoted = !quoted;
      } else if (char === ';' && !quoted) {
        row.push(value); value = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[i + 1] === '\n') i++;
        row.push(value); rows.push(row); row = []; value = '';
      } else {
        value += char;
      }
    }
    if (quoted) throw new Error('CSV do SISAB com aspas incompletas.');
    if (value || row.length) { row.push(value); rows.push(row); }
    return rows;
  }

  function cleanCsv(raw) {
    const start = raw.search(/(?:^|\r?\n)Uf;Ibge;/);
    if (start < 0) {
      if (/consulta n(?:ã|&atilde;)o retornou nenhum dado/i.test(raw)) {
        throw new Error('O SISAB não retornou dados para os filtros selecionados.');
      }
      throw new Error('A resposta não é um CSV do SISAB por Equipe - INE; confira a sessão.');
    }
    const rows = parseCsv(raw.slice(raw[start] === 'U' ? start : raw.indexOf('Uf;Ibge;', start)));
    const header = rows.shift();
    if (header.at(-1) === '') header.pop();
    const typeIndex = header.indexOf('Tipo Equipe');
    if (typeIndex < 0 || !header.includes('Equipe - INE')) throw new Error('O relatório não veio por Equipe - INE.');
    const escape = value => /[;"\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
    const output = [header.map(escape).join(';')];
    let count = 0;
    for (const row of rows) {
      if (!row[0]) break;
      if (row.length === header.length + 1 && row.at(-1) === '') row.pop();
      if (row.length !== header.length) throw new Error('O CSV do SISAB mudou de formato.');
      if (TEAM_TYPES.has(row[typeIndex])) { output.push(row.map(escape).join(';')); count++; }
    }
    return { text: output.join('\n') + '\n', rows: count };
  }

  const crcTable = Array.from({ length: 256 }, (_, n) => {
    for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });

  function makeZip(files) {
    if (!files.length || files.length > 65535) throw new Error('Quantidade inválida de arquivos para ZIP.');
    const encoder = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const put16 = (view, pos, value) => view.setUint16(pos, value, true);
    const put32 = (view, pos, value) => view.setUint32(pos, value >>> 0, true);
    for (const file of files) {
      if (!/^[\w.-]+\.csv$/.test(file.name)) throw new Error('Nome de arquivo CSV inválido.');
      const name = encoder.encode(file.name), data = encoder.encode(file.text);
      if (data.length > 0xffffffff) throw new Error('CSV excede o tamanho do ZIP.');
      let crc = 0xffffffff;
      for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
      crc = (crc ^ 0xffffffff) >>> 0;

      const local = new Uint8Array(30 + name.length);
      let v = new DataView(local.buffer);
      put32(v, 0, 0x04034b50); put16(v, 4, 20); put16(v, 6, 0x0800);
      put32(v, 14, crc); put32(v, 18, data.length); put32(v, 22, data.length);
      put16(v, 26, name.length); local.set(name, 30);
      parts.push(local, data);

      const entry = new Uint8Array(46 + name.length);
      v = new DataView(entry.buffer);
      put32(v, 0, 0x02014b50); put16(v, 4, 20); put16(v, 6, 20); put16(v, 8, 0x0800);
      put32(v, 16, crc); put32(v, 20, data.length); put32(v, 24, data.length);
      put16(v, 28, name.length); put32(v, 42, offset); entry.set(name, 46);
      central.push(entry);
      offset += local.length + data.length;
    }
    const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
    if (offset + centralSize > 0xffffffff) throw new Error('ZIP excede 4 GB.');
    const end = new Uint8Array(22), v = new DataView(end.buffer);
    put32(v, 0, 0x06054b50); put16(v, 8, files.length); put16(v, 10, files.length);
    put32(v, 12, centralSize); put32(v, 16, offset);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }

  const api = { latestCompetencies, csvAction, reportVariants, cleanCsv, makeZip };
  root.SisabCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
