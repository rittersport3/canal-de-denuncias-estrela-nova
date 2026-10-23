import { functions } from "./firebase.js";
import { CATEGORIAS, STATUS, el, dataHora, badgeStatus, mensagemErro, mostrarAlerta } from "./comum.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

const consultar = httpsCallable(functions, "consultarDenuncia");
const enviarMensagem = httpsCallable(functions, "enviarMensagemDenunciante");

const formAcesso = document.getElementById("form-acesso");
const formMensagem = document.getElementById("form-mensagem");
const painel = document.getElementById("painel");
const alertas = document.getElementById("alertas");

// As credenciais ficam apenas em memória enquanto a página estiver aberta.
let credenciais = null;

const ETAPAS = ["recebida", "em_analise", "concluida"];

function render(d) {
  document.getElementById("p-protocolo").textContent = d.protocolo;
  document.getElementById("p-status").replaceChildren(badgeStatus(d.status));

  const atual = d.status === "aguardando_informacoes" ? 1 : d.status === "arquivada" ? 2 : ETAPAS.indexOf(d.status);
  document.getElementById("p-linha").replaceChildren(
    ...ETAPAS.map((s, i) =>
      el("span", { class: i <= atual ? "feito" : "" }, i === 2 && d.status === "arquivada" ? STATUS.arquivada : STATUS[s])
    )
  );

  const item = (rotulo, valor) => [el("dt", {}, rotulo), el("dd", {}, valor)];
  document.getElementById("p-resumo").replaceChildren(
    ...item("Registrada em", dataHora(d.criadaEm)),
    ...item("Última atualização", dataHora(d.atualizadaEm)),
    ...item("Categoria", CATEGORIAS[d.categoria] || d.categoria),
    ...item("Identificação", d.anonimo ? "Anônima" : "Identificada"),
    ...item("Anexos enviados", String(d.totalAnexos)),
    ...item("Relato", d.descricao)
  );

  const msgs = document.getElementById("p-mensagens");
  msgs.replaceChildren(
    ...(d.mensagens.length
      ? d.mensagens.map((m) =>
          el(
            "div",
            { class: `msg msg-${m.autor}` },
            m.texto,
            el("small", {}, `${m.autor === "comite" ? "Equipe de apuração" : "Você"} · ${dataHora(m.criadaEm)}`)
          )
        )
      : [el("p", { class: "msg-vazia" }, "Ainda não há mensagens. Se a equipe precisar de mais informações, a pergunta aparecerá aqui.")])
  );

  if (d.status === "aguardando_informacoes") {
    mostrarAlerta(alertas, "aviso", "A equipe de apuração precisa de mais informações. Veja as mensagens abaixo e responda.");
  }
}

async function carregar() {
  const { data } = await consultar(credenciais);
  render(data);
  formAcesso.classList.add("oculto");
  painel.classList.remove("oculto");
}

formAcesso.addEventListener("submit", async (e) => {
  e.preventDefault();
  alertas.replaceChildren();
  const protocolo = formAcesso.protocolo.value.trim();
  const senha = formAcesso.senha.value;
  if (!protocolo || !senha) {
    mostrarAlerta(alertas, "erro", "Informe o protocolo e a senha.");
    return;
  }
  const btn = document.getElementById("btn-acessar");
  btn.disabled = true;
  try {
    credenciais = { protocolo, senha };
    await carregar();
    formAcesso.senha.value = "";
  } catch (err) {
    credenciais = null;
    mostrarAlerta(alertas, "erro", mensagemErro(err));
  } finally {
    btn.disabled = false;
  }
});

formMensagem.addEventListener("submit", async (e) => {
  e.preventDefault();
  const texto = formMensagem.texto.value.trim();
  if (!texto) return;
  const btn = document.getElementById("btn-mensagem");
  btn.disabled = true;
  try {
    await enviarMensagem({ ...credenciais, texto });
    formMensagem.reset();
    alertas.replaceChildren();
    await carregar();
    mostrarAlerta(alertas, "sucesso", "Mensagem enviada. A equipe de apuração foi avisada.");
  } catch (err) {
    mostrarAlerta(alertas, "erro", mensagemErro(err));
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("btn-sair").addEventListener("click", () => {
  credenciais = null;
  painel.classList.add("oculto");
  formAcesso.reset();
  formAcesso.classList.remove("oculto");
  alertas.replaceChildren();
});
