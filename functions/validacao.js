const crypto = require("node:crypto");

const CATEGORIAS = {
  assedio_moral: "Assédio moral",
  assedio_sexual: "Assédio sexual",
  violencia_crianca: "Violência ou abuso contra criança ou adolescente",
  discriminacao: "Discriminação ou preconceito",
  fraude: "Fraude, desvio de recursos ou corrupção",
  conflito_interesses: "Conflito de interesses",
  conduta_antietica: "Conduta antiética ou violação do código de conduta",
  seguranca: "Segurança, saúde ou condições de trabalho",
  outros: "Outros",
};

const VINCULOS = {
  colaborador: "Colaborador(a)",
  voluntario: "Voluntário(a)",
  familia: "Família ou responsável de atendido",
  atendido: "Criança, adolescente ou jovem atendido",
  parceiro: "Parceiro, doador ou fornecedor",
  comunidade: "Comunidade",
  outro: "Outro",
  nao_informado: "Prefiro não informar",
};

const STATUS = ["recebida", "em_analise", "aguardando_informacoes", "concluida", "arquivada"];

// Sem caracteres ambíguos (0/O, 1/I/L) para facilitar a digitação.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function gerarProtocolo() {
  const bytes = crypto.randomBytes(12);
  let s = "";
  for (const b of bytes) s += ALFABETO[b % ALFABETO.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

function normalizarProtocolo(valor) {
  const limpo = String(valor || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (limpo.length !== 12) return null;
  for (const c of limpo) if (!ALFABETO.includes(c)) return null;
  return `${limpo.slice(0, 4)}-${limpo.slice(4, 8)}-${limpo.slice(8, 12)}`;
}

function hashSenha(senha, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(senha, salt, 64).toString("hex");
  return { salt, hash };
}

function senhaConfere(senha, salt, hashEsperado) {
  const { hash } = hashSenha(senha, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(hashEsperado, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function texto(valor, { max, min = 0, campo }) {
  if (valor === undefined || valor === null) valor = "";
  if (typeof valor !== "string") throw new Error(`Campo inválido: ${campo}`);
  const t = valor.trim();
  if (t.length < min) throw new Error(`Preencha o campo "${campo}" (mínimo de ${min} caracteres).`);
  if (t.length > max) throw new Error(`O campo "${campo}" excede ${max} caracteres.`);
  return t;
}

function validarSenha(senha) {
  if (typeof senha !== "string" || senha.length < 8 || senha.length > 128) {
    throw new Error("A senha deve ter entre 8 e 128 caracteres.");
  }
  return senha;
}

// Valida e normaliza o payload enviado pelo formulário de denúncia.
function validarDenuncia(d) {
  if (!d || typeof d !== "object") throw new Error("Dados inválidos.");
  if (!CATEGORIAS[d.categoria]) throw new Error("Selecione uma categoria válida.");

  const anonimo = d.anonimo !== false;
  let identificacao = null;
  if (!anonimo) {
    const i = d.identificacao || {};
    identificacao = {
      nome: texto(i.nome, { max: 200, min: 2, campo: "Nome" }),
      email: texto(i.email, { max: 200, campo: "E-mail" }),
      telefone: texto(i.telefone, { max: 40, campo: "Telefone" }),
    };
    if (!identificacao.email && !identificacao.telefone) {
      throw new Error("Informe um e-mail ou telefone para contato, ou escolha a denúncia anônima.");
    }
    if (identificacao.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identificacao.email)) {
      throw new Error("E-mail inválido.");
    }
  }

  const vinculo = VINCULOS[d.vinculo] ? d.vinculo : "nao_informado";
  const emAndamento = ["sim", "nao", "nao_sei"].includes(d.emAndamento) ? d.emAndamento : "nao_sei";

  return {
    categoria: d.categoria,
    anonimo,
    identificacao,
    vinculo,
    descricao: texto(d.descricao, { max: 10000, min: 30, campo: "Descrição" }),
    quando: texto(d.quando, { max: 200, campo: "Quando" }),
    onde: texto(d.onde, { max: 300, campo: "Onde" }),
    envolvidos: texto(d.envolvidos, { max: 2000, campo: "Pessoas envolvidas" }),
    testemunhas: texto(d.testemunhas, { max: 2000, campo: "Testemunhas" }),
    jaComunicou: texto(d.jaComunicou, { max: 2000, campo: "Já comunicou" }),
    emAndamento,
    senha: validarSenha(d.senha),
    anexos: Array.isArray(d.anexos) ? d.anexos : [],
  };
}

module.exports = {
  CATEGORIAS,
  VINCULOS,
  STATUS,
  gerarProtocolo,
  normalizarProtocolo,
  hashSenha,
  senhaConfere,
  texto,
  validarSenha,
  validarDenuncia,
};
