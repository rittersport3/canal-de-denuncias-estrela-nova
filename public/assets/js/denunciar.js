import { auth, storage, functions } from "./firebase.js";
import { CATEGORIAS, VINCULOS, el, mensagemErro, mostrarAlerta } from "./comum.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { ref, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

const MAX_ARQUIVOS = 5;
const MAX_BYTES = 15 * 1024 * 1024;
const TIPOS_OK = /^(image\/|audio\/|video\/|application\/pdf$)/;

const form = document.getElementById("form-denuncia");
const alertas = document.getElementById("alertas");
const progresso = document.getElementById("progresso");
const btnEnviar = document.getElementById("btn-enviar");
const listaArquivos = document.getElementById("lista-arquivos");
const inputArquivos = document.getElementById("arquivos");
const areaUpload = document.getElementById("area-upload");
let arquivos = [];

for (const [valor, texto] of Object.entries(CATEGORIAS)) {
  document.getElementById("categoria").append(el("option", { value: valor }, texto));
}
for (const [valor, texto] of Object.entries(VINCULOS)) {
  document.getElementById("vinculo").append(el("option", { value: valor, selected: valor === "nao_informado" }, texto));
}

// Anônimo x identificado
function atualizarIdentificacao() {
  const anonimo = form.anonimo.value === "sim";
  document.getElementById("campos-identificacao").classList.toggle("oculto", anonimo);
  document.getElementById("aviso-anonimo").classList.toggle("oculto", !anonimo);
}
form.querySelectorAll('input[name="anonimo"]').forEach((r) => r.addEventListener("change", atualizarIdentificacao));
atualizarIdentificacao();

const descricao = document.getElementById("descricao");
descricao.addEventListener("input", () => {
  document.getElementById("contador").textContent = descricao.value.length;
});

// Anexos
function renderArquivos() {
  listaArquivos.replaceChildren(
    ...arquivos.map((f, i) =>
      el(
        "li",
        {},
        `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`,
        el("button", { type: "button", "aria-label": `Remover ${f.name}`, onclick: () => { arquivos.splice(i, 1); renderArquivos(); } }, "×")
      )
    )
  );
}

function adicionarArquivos(lista) {
  for (const f of lista) {
    if (arquivos.length >= MAX_ARQUIVOS) {
      mostrarAlerta(alertas, "aviso", `Você pode anexar no máximo ${MAX_ARQUIVOS} arquivos.`);
      break;
    }
    if (!TIPOS_OK.test(f.type)) {
      mostrarAlerta(alertas, "aviso", `"${f.name}" não é um tipo de arquivo aceito (fotos, PDF, áudio ou vídeo).`);
      continue;
    }
    if (f.size > MAX_BYTES) {
      mostrarAlerta(alertas, "aviso", `"${f.name}" ultrapassa 15 MB.`);
      continue;
    }
    arquivos.push(f);
  }
  renderArquivos();
}

inputArquivos.addEventListener("change", () => {
  adicionarArquivos(inputArquivos.files);
  inputArquivos.value = "";
});
areaUpload.addEventListener("dragover", (e) => { e.preventDefault(); areaUpload.classList.add("arrastando"); });
areaUpload.addEventListener("dragleave", () => areaUpload.classList.remove("arrastando"));
areaUpload.addEventListener("drop", (e) => {
  e.preventDefault();
  areaUpload.classList.remove("arrastando");
  adicionarArquivos(e.dataTransfer.files);
});

function validar() {
  const erros = [];
  if (!form.categoria.value) erros.push("Selecione o tipo de situação.");
  if (form.descricao.value.trim().length < 30) erros.push("Descreva o ocorrido com pelo menos 30 caracteres.");
  if (form.anonimo.value === "nao") {
    if (form.nome.value.trim().length < 2) erros.push("Informe seu nome ou escolha a opção anônima.");
    if (!form.email.value.trim() && !form.telefone.value.trim()) erros.push("Informe um e-mail ou telefone para contato.");
  }
  if (form.senha.value.length < 8) erros.push("A senha deve ter pelo menos 8 caracteres.");
  else if (form.senha.value !== form.senha2.value) erros.push("As senhas não conferem.");
  if (!document.getElementById("aceite").checked) erros.push("Confirme a declaração de boa-fé.");
  return erros;
}

async function enviarArquivo(uid, arquivo, indice) {
  const ext = (arquivo.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const path = `uploads/${uid}/${crypto.randomUUID()}${ext ? "." + ext : ""}`;
  const tarefa = uploadBytesResumable(ref(storage, path), arquivo, { contentType: arquivo.type });
  await new Promise((ok, falha) => {
    tarefa.on(
      "state_changed",
      (s) => {
        const pct = Math.round((s.bytesTransferred / s.totalBytes) * 100);
        progresso.textContent = `Enviando anexo ${indice + 1} de ${arquivos.length}: ${pct}%`;
      },
      falha,
      ok
    );
  });
  return { path, nome: arquivo.name.slice(0, 200) };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  alertas.replaceChildren();
  const erros = validar();
  if (erros.length) {
    alertas.replaceChildren(
      el("div", { class: "alerta alerta-erro", role: "alert" }, el("p", {}, "Verifique os campos:"), el("ul", {}, erros.map((x) => el("li", {}, x))))
    );
    alertas.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  btnEnviar.disabled = true;
  btnEnviar.textContent = "Enviando…";
  try {
    // Sessão anônima apenas para autorizar o envio de anexos; não identifica o denunciante.
    const { user } = auth.currentUser ? { user: auth.currentUser } : await signInAnonymously(auth);
    const anexos = [];
    for (let i = 0; i < arquivos.length; i++) anexos.push(await enviarArquivo(user.uid, arquivos[i], i));

    progresso.textContent = "Registrando denúncia…";
    const anonimo = form.anonimo.value === "sim";
    const registrar = httpsCallable(functions, "registrarDenuncia");
    const { data } = await registrar({
      anonimo,
      identificacao: anonimo
        ? null
        : { nome: form.nome.value, email: form.email.value, telefone: form.telefone.value },
      vinculo: form.vinculo.value,
      categoria: form.categoria.value,
      descricao: form.descricao.value,
      quando: form.quando.value,
      onde: form.onde.value,
      envolvidos: form.envolvidos.value,
      testemunhas: form.testemunhas.value,
      emAndamento: form.emAndamento.value,
      jaComunicou: form.jaComunicou.value,
      senha: form.senha.value,
      anexos,
    });

    await auth.signOut();
    mostrarSucesso(data.protocolo);
  } catch (err) {
    mostrarAlerta(alertas, "erro", mensagemErro(err));
    btnEnviar.disabled = false;
    btnEnviar.textContent = "Enviar denúncia";
    progresso.textContent = "";
  }
});

function mostrarSucesso(protocolo) {
  form.reset();
  form.classList.add("oculto");
  alertas.replaceChildren();
  document.getElementById("protocolo").textContent = protocolo;
  document.getElementById("sucesso").classList.remove("oculto");
  window.scrollTo({ top: 0, behavior: "smooth" });

  document.getElementById("btn-copiar").addEventListener("click", async (ev) => {
    try {
      await navigator.clipboard.writeText(protocolo);
      ev.target.textContent = "Copiado!";
    } catch {
      ev.target.textContent = "Selecione e copie manualmente";
    }
  });
  document.getElementById("btn-baixar").addEventListener("click", () => {
    const texto = [
      "CANAL DE DENÚNCIAS — ESTRELA NOVA",
      "",
      `Protocolo: ${protocolo}`,
      `Registrada em: ${new Date().toLocaleString("pt-BR")}`,
      "",
      `Acompanhe em: ${location.origin}/acompanhar`,
      "Use o protocolo acima e a senha que você criou.",
      "A senha não pode ser recuperada.",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
    el("a", { href: url, download: `protocolo-${protocolo}.txt` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

document.getElementById("btn-imprimir").addEventListener("click", () => window.print());
