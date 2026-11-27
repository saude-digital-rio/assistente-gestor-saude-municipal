const test = require('node:test');
const assert = require('node:assert/strict');
const tabnet = require('../tabnet.js');

test('seleciona todos os meses disponíveis desde janeiro de 2025', () => {
  const options = [
    { value: 'parj2608.dbf', text: 'Ago/2026' },
    { value: 'parj2501.dbf', text: 'Jan/2025' },
    { value: 'parj2412.dbf', text: 'Dez/2024' },
    { value: 'outro', text: 'Total' }
  ];
  assert.deepEqual(tabnet.periods(options), ['parj2608.dbf', 'parj2501.dbf']);
});

test('separa unidades APS e especializadas, incluindo Super Centro ZO', () => {
  const options = [
    { value: '1', text: '1234567 SMS CF EXEMPLO' },
    { value: '2', text: '1234568 SMS CMS EXEMPLO' },
    { value: '3', text: '1234569 SMS CSE EXEMPLO' },
    { value: '4', text: '1234570 SMS POLICLINICA EXEMPLO' },
    { value: '5', text: '1234571 SMS CAPS EXEMPLO' },
    { value: '6', text: '1234572 SMS CECO EXEMPLO' },
    { value: '7', text: '1234573 SMS DEAMB EXEMPLO' },
    { value: '8', text: '8148023 SMS CENTRO CARIOCA DE ESPECIALIDADE DA ZON' },
    { value: '9', text: '0134570 SMS SUPER CENTRO CARIOCA DE VACINACAO AP 2' }
  ];
  assert.deepEqual(tabnet.units(options, 'aps'), ['1', '2', '3']);
  assert.deepEqual(tabnet.units(options, 'especializada'), ['4', '5', '6', '7', '8']);
});

test('valida CSV do TabNet e remove marcador de fim', () => {
  const raw = '"Estabel-CNES-RJ";"Jan/2025";"Total"\n"1234567 SMS CF";5;5\n"Total";5;5\n&\n';
  assert.deepEqual(tabnet.cleanCsv(raw), {
    text: '"Estabel-CNES-RJ";"Jan/2025";"Total"\n"1234567 SMS CF";5;5\n"Total";5;5\n',
    rows: 1
  });
  assert.throws(() => tabnet.cleanCsv('Consulta não retornou dados'), /CSV do TabNet/);
});

test('codifica o formulário legado em ISO-8859-1', () => {
  assert.equal(tabnet.encodeForm([['Coluna', 'Mês_Cobrança'], ['mostre', 'Mostra']]), 'Coluna=M%EAs_Cobran%E7a&mostre=Mostra');
});

test('reúne blocos de meses pelo estabelecimento e soma os totais', () => {
  const jan = '"Estabel-CNES-RJ";"Jan/2025";"Total"\n"1234567 SMS CF A";2;2\n"Total";2;2\n';
  const fev = '"Estabel-CNES-RJ";"Fev/2025";"Total"\n"1234568 SMS CMS B";3;3\n"1234567 SMS CF A";4;4\n"Total";7;7\n';
  assert.deepEqual(tabnet.mergeCsv([jan, fev], ['Jan/2025', 'Fev/2025']), {
    text: '"Estabel-CNES-RJ";"Jan/2025";"Fev/2025";"Total"\n"1234567 SMS CF A";2;4;6\n"1234568 SMS CMS B";;3;3\n"Total";2;7;9\n',
    rows: 2
  });
});

test('ignora competência sem dados e para após encontrar a quantidade pedida', async () => {
  const available = [
    { value: 'parj2608.dbf', text: 'Ago/2026' },
    { value: 'parj2607.dbf', text: 'Jul/2026' },
    { value: 'parj2606.dbf', text: 'Jun/2026' }
  ];
  const queried = [];
  const result = await tabnet.collectRecentMonths(available, 1, async batch => {
    queried.push(batch.map(option => option.value));
    if (batch[0].value === 'parj2608.dbf') return null;
    return '"Estabel-CNES-RJ";"Jul/2026";"Total"\n"1234567 SMS CF";8;8\n"Total";8;8\n';
  });
  assert.deepEqual(queried, [['parj2608.dbf'], ['parj2607.dbf']]);
  assert.deepEqual(result.months, [available[1]]);
  assert.equal(result.parts.length, 1);
});

test('aceita CSV do SI-PNI por estabelecimento de saúde', () => {
  const raw = '"Estabelecimento de saúde";"Nov/2026";"Total"\n"2269295 SMS CMS CLEMENTINO FRAGA";634;634\n"Total";634;634\n&\n';
  assert.deepEqual(tabnet.cleanCsv(raw, 'Estabelecimento de saúde'), {
    text: '"Estabelecimento de saúde";"Nov/2026";"Total"\n"2269295 SMS CMS CLEMENTINO FRAGA";634;634\n"Total";634;634\n',
    rows: 1
  });
  assert.match(tabnet.mergeCsv([raw], ['Nov/2026'], 'Estabelecimento de saúde').text, /^"Estabelecimento de saúde";"Nov\/2026";"Total"/);
});

test('consulta doze meses do SI-PNI de uma vez e substitui mês sem dados', async () => {
  const available = Array.from({ length: 13 }, (_, index) => ({ value: `mes${index}`, text: `Mês ${index}` }));
  const batches = [];
  const { months } = await tabnet.collectRecentMonths(available, 12, async batch => {
    batches.push(batch.length);
    const returned = batch.filter(option => option.value !== 'mes0');
    return ['"Estabelecimento de saúde";' + returned.map(option => `"${option.text}"`).join(';') + ';"Total"',
      '"2269295 SMS CMS EXEMPLO";' + returned.map(() => '1').join(';') + `;${returned.length}`,
      '"Total";' + returned.map(() => '1').join(';') + `;${returned.length}`].join('\n');
  }, { firstColumn: 'Estabelecimento de saúde', batchSize: 12 });
  assert.deepEqual(batches, [12, 1]);
  assert.deepEqual(months.map(option => option.value), available.slice(1).map(option => option.value));
});
