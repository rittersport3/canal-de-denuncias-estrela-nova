const test = require("node:test");
const assert = require("node:assert");
const { normalizarEmails, destinatariosPara } = require("../avisos");

const config = {
  padrao: ["comite@estrelanova.org.br", "diretor@estrelanova.org.br"],
  diretoria: ["conselho@estrelanova.org.br"],
};

test("denúncia comum vai para a lista padrão", () => {
  const r = destinatariosPara({ envolveDiretoria: "nao" }, config);
  assert.deepStrictEqual(r, { envolveDiretoria: false, emails: config.padrao });
});

test("envolvimento da diretoria (sim ou não sei) vai só para a lista da diretoria", () => {
  for (const envolveDiretoria of ["sim", "nao_sei"]) {
    const r = destinatariosPara({ envolveDiretoria }, config);
    assert.deepStrictEqual(r, { envolveDiretoria: true, emails: ["conselho@estrelanova.org.br"] });
  }
});

test("lista da diretoria vazia não recorre à lista padrão", () => {
  const r = destinatariosPara({ envolveDiretoria: "sim" }, { padrao: config.padrao, diretoria: [] });
  assert.deepStrictEqual(r.emails, []);
});

test("denúncias antigas (sem o campo) usam a lista padrão; sem configuração, ninguém", () => {
  assert.deepStrictEqual(destinatariosPara({}, config).emails, config.padrao);
  assert.deepStrictEqual(destinatariosPara({ envolveDiretoria: "sim" }, undefined).emails, []);
});

test("normaliza e-mails: espaços, maiúsculas, duplicados e inválidos", () => {
  assert.deepStrictEqual(
    normalizarEmails([" Ana@Exemplo.org ", "ana@exemplo.org", "invalido", 42, "b@c.co"]),
    ["ana@exemplo.org", "b@c.co"]
  );
  assert.deepStrictEqual(normalizarEmails("nao-lista"), []);
});
