const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const core = require('../core.js');

test('seleciona seis competências comuns mais recentes', () => {
  assert.deepEqual(core.latestCompetencies([
    ['202601', '202610', '202609', '202608', '202607', '202606', '202605', '202604'],
    ['202610', '202609', '202608', '202607', '202606', '202605', '202604', '202603']
  ], 6), ['202610', '202609', '202608', '202607', '202606', '202605']);
});

test('seleciona 1, 6 ou 12 competências disponíveis nos módulos escolhidos', () => {
  const production = Array.from({ length: 13 }, (_, index) => `2025${String(index + 1).padStart(2, '0')}`)
    .map(value => value === '202513' ? '202601' : value);
  const collective = production.filter(value => value !== '202512');
  assert.deepEqual(core.latestCompetencies([production], 1), ['202601']);
  assert.equal(core.latestCompetencies([production], 12).length, 12);
  assert.deepEqual(core.latestCompetencies([production, collective], 6).slice(0, 2), ['202601', '202511']);
});

test('limpa preâmbulo e rodapé, filtra tipos de equipe e preserva aspas', () => {
  const raw = 'Relatório SISAB\nUf;Ibge;Equipe - INE;Tipo Equipe;OUT/2026;\nRJ;330455;"Equipe; A";70;3;\nRJ;330455;B;75;4;\nRJ;330455;C;-;5;\n\nTotal: 8';
  const result = core.cleanCsv(raw);
  assert.equal(result.rows, 2);
  assert.equal(result.text, 'Uf;Ibge;Equipe - INE;Tipo Equipe;OUT/2026\nRJ;330455;"Equipe; A";70;3\nRJ;330455;C;-;5\n');
});

test('rejeita HTML de sessão expirada', () => {
  assert.throws(() => core.cleanCsv('<html>Entrar</html>'), /CSV do SISAB/);
});

test('identifica resposta sem dados do SISAB', () => {
  assert.throws(() => core.cleanCsv('<li>Prezado(a), A consulta não retornou nenhum dado com o(s) filtro(s) selecionado(s).</li>'), /não retornou dados/);
});

test('extrai ação CSV do JavaServer Faces', () => {
  assert.equal(core.csvAction("mojarra.jsfcljs(document.getElementById('j_idt44'),{'j_idt171':'j_idt171'},'');return false"), 'j_idt171');
});

test('consulta dentista em atendimento odontológico', () => {
  const variants = core.reportVariants(['atendimentos']);
  assert.deepEqual(variants.find(report => report.name === 'atendimentos_dentista'), {
    name: 'atendimentos_dentista', production: '5', professional: '8'
  });
});

test('gera ZIP válido com UTF-8 e múltiplos arquivos', async () => {
  const zip = core.makeZip([{ name: '202610_atendimentos_enfermeiro.csv', text: '\ufeffá;1\n' }, { name: '202609_procedimentos.csv', text: 'a;b\n' }]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sisab-zip-'));
  try {
    const file = path.join(dir, 'out.zip');
    fs.writeFileSync(file, Buffer.from(await zip.arrayBuffer()));
    const output = execFileSync('python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print("|".join(z.namelist())); assert z.read(z.namelist()[0]).decode("utf-8-sig") == "á;1\\n"', file], { encoding: 'utf8' });
    assert.match(output, /202610_atendimentos_enfermeiro.csv\|202609_procedimentos.csv/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
