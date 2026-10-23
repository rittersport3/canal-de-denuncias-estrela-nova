// Cadastro, no painel, dos e-mails que recebem os avisos de novas denúncias.
import { db } from "./firebase.js";
import { el, dataHora, mostrarAlerta } from "./comum.js";
import { doc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const MAX = 20;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const secao = document.getElementById("config-avisos");
const botao = document.getElementById("btn-avisos");
const form = document.getElementById("form-avisos");
const campoPadrao = document.getElementById("avisos-padrao");
const campoDiretoria = document.getElementById("avisos-diretoria");
const alertas = document.getElementById("alertas-avisos");
const pendencias = document.getElementById("pendencias-avisos");
const atualizacao = document.getElementById("avisos-atualizacao");
const ref = doc(db, "config", "notificacoes");

let emailAdmin = "";
let editando = false;

botao.addEventListener("click", () => {
  const abrir = secao.classList.contains("oculto");
  secao.classList.toggle("oculto", !abrir);
  botao.setAttribute("aria-expanded", String(abrir));
});
[campoPadrao, campoDiretoria].forEach((c) => c.addEventListener("input", () => (editando = true)));

// Lê o texto (um e-mail por linha, vírgula ou ponto e vírgula) e separa válidos de inválidos.
function lerLista(texto) {
  const itens = texto.split(/[\n,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const validos = [...new Set(itens.filter((x) => EMAIL.test(x)))];
  const invalidos = itens.filter((x) => !EMAIL.test(x));
  return { validos, invalidos };
}

function render(dados) {
  if (!editando) {
    campoPadrao.value = (dados?.padrao || []).join("\n");
    campoDiretoria.value = (dados?.diretoria || []).join("\n");
  }
  atualizacao.textContent = dados?.atualizadaEm
    ? `Última alteração: ${dataHora(dados.atualizadaEm.toMillis())} por ${dados.atualizadaPor}`
    : "Nenhum destinatário cadastrado ainda.";
  const avisos = [];
  if (!dados?.padrao?.length) avisos.push("Ninguém recebe avisos de denúncias comuns.");
  if (!dados?.diretoria?.length) avisos.push("Ninguém recebe avisos de denúncias que podem envolver a diretoria.");
  pendencias.replaceChildren(...(avisos.length ? [el("div", { class: "alerta alerta-aviso" }, avisos.join(" "))] : []));
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const padrao = lerLista(campoPadrao.value);
  const diretoria = lerLista(campoDiretoria.value);
  const invalidos = [...padrao.invalidos, ...diretoria.invalidos];
  if (invalidos.length) {
    mostrarAlerta(alertas, "erro", `E-mails inválidos: ${invalidos.join(", ")}`);
    return;
  }
  if (padrao.validos.length > MAX || diretoria.validos.length > MAX) {
    mostrarAlerta(alertas, "erro", `Cada lista aceita no máximo ${MAX} e-mails.`);
    return;
  }
  const repetidos = padrao.validos.filter((x) => diretoria.validos.includes(x));
  if (repetidos.length && !confirm(`Estes e-mails estão nas duas listas: ${repetidos.join(", ")}.\nSe forem da diretoria, eles serão avisados de denúncias que podem envolvê-los. Salvar mesmo assim?`)) {
    return;
  }
  try {
    await setDoc(ref, {
      padrao: padrao.validos,
      diretoria: diretoria.validos,
      atualizadaEm: serverTimestamp(),
      atualizadaPor: emailAdmin,
    });
    editando = false;
    mostrarAlerta(alertas, "sucesso", "Destinatários salvos.");
  } catch (err) {
    console.error(err);
    mostrarAlerta(alertas, "erro", "Não foi possível salvar. Tente novamente.");
  }
});

// Começa a acompanhar a configuração; retorna a função que para a escuta.
export function iniciarConfigAvisos(email) {
  emailAdmin = email;
  editando = false;
  return onSnapshot(ref, (snap) => render(snap.data()), (e) => {
    console.error(e);
    mostrarAlerta(alertas, "erro", "Não foi possível carregar os destinatários.");
  });
}
