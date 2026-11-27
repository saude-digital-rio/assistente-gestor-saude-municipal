const test = require('node:test');
const assert = require('node:assert/strict');
const sipni = require('../sipni.js');
const tabnet = require('../tabnet.js');

test('seleciona competências mensais do SI-PNI', () => {
  assert.deepEqual(sipni.periods([
    { value: 'tabpni2611.dbf' },
    { value: 'tabpni2600.dbf' },
    { value: 'tabpni2101.dbf' },
    { value: 'outro' }
  ]), ['tabpni2611.dbf', 'tabpni2101.dbf']);
});

test('monta os filtros oficiais de vacinação contra COVID-19', () => {
  const encoded = tabnet.encodeForm(sipni.requestEntries(['tabpni2611.dbf']));
  assert.match(encoded, /Linha=Estabelecimento_de_sa%FAde/);
  assert.match(encoded, /Coluna=Mes_da_Vacina%E7%E3o/);
  assert.match(encoded, /Incremento=Total_de_registros_consultados/);
  assert.match(encoded, /Arquivos=tabpni2611\.dbf/);
  assert.match(encoded, /formato=prn&mostre=Mostra$/);
});
