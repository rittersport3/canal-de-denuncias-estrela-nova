const test = require("node:test");
const assert = require("node:assert");
const v = require("../validacao");

const base = {
  categoria: "assedio_moral",
  anonimo: true,
  descricao: "Descrição detalhada do ocorrido com mais de trinta caracteres.",
  senha: "senhaforte123",
};

test("gera protocolos válidos e únicos", () => {
  const vistos = new Set();
  for (let i = 0; i < 1000; i++) {
    const p = v.gerarProtocolo();
    assert.match(p, /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    assert.strictEqual(v.normalizarProtocolo(p), p);
    vistos.add(p);
  }
  assert.strictEqual(vistos.size, 1000);
});

test("normaliza protocolo digitado de várias formas", () => {
  assert.strictEqual(v.normalizarProtocolo(" abcd efgh jkmn "), "ABCD-EFGH-JKMN");
  assert.strictEqual(v.normalizarProtocolo("ABCD-EFGH-JKM"), null);
  assert.strictEqual(v.normalizarProtocolo("ABCD-EFGH-JKM0"), null);
  assert.strictEqual(v.normalizarProtocolo(undefined), null);
});

test("hash de senha confere apenas com a senha correta", () => {
  const { salt, hash } = v.hashSenha("minhasenha");
  assert.ok(v.senhaConfere("minhasenha", salt, hash));
  assert.ok(!v.senhaConfere("outrasenha", salt, hash));
});

test("denúncia anônima válida descarta identificação", () => {
  const d = v.validarDenuncia({ ...base, identificacao: { nome: "Fulano" } });
  assert.strictEqual(d.anonimo, true);
  assert.strictEqual(d.identificacao, null);
  assert.strictEqual(d.vinculo, "nao_informado");
});

test("denúncia identificada exige contato", () => {
  assert.throws(
    () => v.validarDenuncia({ ...base, anonimo: false, identificacao: { nome: "Ana" } }),
    /e-mail ou telefone/
  );
  const d = v.validarDenuncia({
    ...base,
    anonimo: false,
    identificacao: { nome: "Ana", email: "ana@exemplo.org" },
  });
  assert.strictEqual(d.identificacao.email, "ana@exemplo.org");
});

test("rejeita categoria, descrição curta e senha fraca", () => {
  assert.throws(() => v.validarDenuncia({ ...base, categoria: "x" }), /categoria/);
  assert.throws(() => v.validarDenuncia({ ...base, descricao: "curta" }), /Descrição/);
  assert.throws(() => v.validarDenuncia({ ...base, senha: "123" }), /senha/);
});
