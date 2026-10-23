// Regras de quem recebe os avisos por e-mail de cada denúncia.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DESTINATARIOS = 20;

// Remove espaços, duplicados e entradas inválidas de uma lista de e-mails.
function normalizarEmails(lista) {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set();
  for (const item of lista) {
    if (typeof item !== "string") continue;
    const email = item.trim().toLowerCase();
    if (EMAIL.test(email)) vistos.add(email);
  }
  return [...vistos].slice(0, MAX_DESTINATARIOS);
}

// Quando a denúncia pode envolver a diretoria ("sim" ou "não sei"), o aviso vai
// SOMENTE para a lista "diretoria", para que nenhum membro da diretoria seja
// avisado de uma denúncia que pode ser contra ele. Sem fallback para a lista
// padrão: se a lista estiver vazia, ninguém é avisado e o caso aparece no painel.
function destinatariosPara(denuncia, config) {
  const envolve = ["sim", "nao_sei"].includes(denuncia?.envolveDiretoria);
  const lista = envolve ? config?.diretoria : config?.padrao;
  return { envolveDiretoria: envolve, emails: normalizarEmails(lista) };
}

module.exports = { normalizarEmails, destinatariosPara, MAX_DESTINATARIOS };
