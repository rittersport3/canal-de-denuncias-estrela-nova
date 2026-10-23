import { auth, db, storage, ADMIN_EMAILS } from "./firebase.js";
import { CATEGORIAS, VINCULOS, STATUS, el, dataHora, badgeStatus, mostrarAlerta } from "./comum.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const telas = {
  login: document.getElementById("tela-login"),
  carregando: document.getElementById("tela-carregando"),
  painel: document.getElementById("tela-painel"),
};
function mostrar(nome) {
  for (const [k, t] of Object.entries(telas)) t.classList.toggle("oculto", k !== nome);
}

const lista = document.getElementById("lista");
const detalhe = document.getElementById("detalhe");
const filtroStatus = document.getElementById("filtro-status");
const filtroCategoria = document.getElementById("filtro-categoria");
const filtroBusca = document.getElementById("filtro-busca");

for (const [v, t] of Object.entries(STATUS)) filtroStatus.append(el("option", { value: v }, t));
for (const [v, t] of Object.entries(CATEGORIAS)) filtroCategoria.append(el("option", { value: v }, t));

let denuncias = [];
let selecionada = null;
let pararLista = null;
let pararDetalhe = [];

function ehAdmin(user) {
  return (
    user &&
    ADMIN_EMAILS.includes(user.email) &&
    user.emailVerified &&
    user.providerData.some((p) => p.providerId === "google.com")
  );
}

const ms = (ts) => (ts?.toMillis ? ts.toMillis() : null);

// ---------- Autenticação ----------
document.getElementById("btn-login").addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      mostrarAlerta(document.getElementById("alertas-login"), "erro", "Não foi possível entrar. Tente novamente.");
      console.error(e);
    }
  }
});
document.getElementById("btn-logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  pararTudo();
  if (!user || user.isAnonymous) {
    mostrar("login");
    return;
  }
  if (!ehAdmin(user)) {
    await signOut(auth);
    mostrar("login");
    mostrarAlerta(
      document.getElementById("alertas-login"),
      "erro",
      `A conta ${user.email || ""} não tem permissão para acessar este painel.`
    );
    return;
  }
  document.getElementById("usuario-email").textContent = user.email;
  mostrar("painel");
  iniciarLista();
});

function pararTudo() {
  if (pararLista) pararLista();
  pararLista = null;
  pararDetalhe.forEach((f) => f());
  pararDetalhe = [];
  denuncias = [];
  selecionada = null;
}

// ---------- Lista ----------
function iniciarLista() {
  const q = query(collection(db, "denuncias"), orderBy("criadaEm", "desc"), limit(1000));
  pararLista = onSnapshot(
    q,
    (snap) => {
      denuncias = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderKpis();
      renderLista();
      if (selecionada) {
        const atual = denuncias.find((d) => d.id === selecionada);
        if (atual) renderCabecalhoDetalhe(atual);
      }
    },
    (e) => {
      console.error(e);
      lista.replaceChildren(el("li", { class: "carregando" }, "Erro ao carregar denúncias (permissão negada?)."));
    }
  );
}

function renderKpis() {
  const conta = (f) => denuncias.filter(f).length;
  const kpi = (n, t) => el("div", { class: "kpi" }, el("b", {}, String(n)), el("span", {}, t));
  document.getElementById("kpis").replaceChildren(
    kpi(denuncias.length, "Total"),
    kpi(conta((d) => d.status === "recebida"), "Novas"),
    kpi(conta((d) => ["em_analise", "aguardando_informacoes"].includes(d.status)), "Em andamento"),
    kpi(conta((d) => d.aguardandoResposta), "Mensagens sem resposta")
  );
}

function filtradas() {
  const s = filtroStatus.value;
  const c = filtroCategoria.value;
  const b = filtroBusca.value.trim().toLowerCase();
  return denuncias.filter(
    (d) =>
      (!s || d.status === s) &&
      (!c || d.categoria === c) &&
      (!b ||
        d.id.toLowerCase().includes(b) ||
        [d.descricao, d.envolvidos, d.onde, d.identificacao?.nome].some((t) => t?.toLowerCase().includes(b)))
  );
}

function renderLista() {
  const itens = filtradas();
  if (!itens.length) {
    lista.replaceChildren(el("li", { class: "carregando" }, "Nenhuma denúncia encontrada."));
    return;
  }
  lista.replaceChildren(
    ...itens.map((d) =>
      el(
        "li",
        {},
        el(
          "button",
          { type: "button", class: d.id === selecionada ? "ativo" : "", onclick: () => abrir(d.id) },
          el(
            "div",
            { class: "linha1" },
            el("span", { class: "prot" }, d.id),
            el("span", {}, d.aguardandoResposta ? el("span", { class: "badge-nova" }, "nova mensagem") : null, " ", badgeStatus(d.status))
          ),
          el("span", { class: "cat" }, CATEGORIAS[d.categoria] || d.categoria),
          el("span", { class: "meta" }, `${dataHora(ms(d.criadaEm))} · ${d.anonimo ? "Anônima" : "Identificada"}${d.prioridade === "alta" ? " · Prioridade alta" : ""}`)
        )
      )
    )
  );
}

[filtroStatus, filtroCategoria].forEach((f) => f.addEventListener("change", renderLista));
filtroBusca.addEventListener("input", renderLista);

// ---------- Detalhe ----------
const areas = {};

function abrir(id) {
  pararDetalhe.forEach((f) => f());
  pararDetalhe = [];
  selecionada = id;
  renderLista();
  const d = denuncias.find((x) => x.id === id);
  if (!d) return;

  areas.cabecalho = el("div");
  areas.mensagens = el("div", { class: "mensagens" });
  areas.notas = el("ul", { class: "notas" });
  const textoResposta = el("textarea", { class: "form-control", rows: "4", maxlength: "5000", placeholder: "Esta mensagem será visível para o denunciante." });
  const textoNota = el("textarea", { class: "form-control", rows: "3", maxlength: "5000", placeholder: "Anotação interna (não visível ao denunciante)." });
  const alertaDetalhe = el("div");

  detalhe.replaceChildren(
    areas.cabecalho,
    alertaDetalhe,
    el("h3", { class: "mt-20" }, "Conversa com o denunciante"),
    areas.mensagens,
    el(
      "form",
      {
        onsubmit: async (e) => {
          e.preventDefault();
          const texto = textoResposta.value.trim();
          if (!texto) return;
          try {
            await addDoc(collection(db, "denuncias", id, "mensagens"), { autor: "comite", texto, criadaEm: serverTimestamp() });
            await updateDoc(doc(db, "denuncias", id), { aguardandoResposta: false, atualizadaEm: serverTimestamp() });
            textoResposta.value = "";
          } catch (err) {
            console.error(err);
            mostrarAlerta(alertaDetalhe, "erro", "Não foi possível enviar a resposta.");
          }
        },
      },
      el("div", { class: "campo" }, textoResposta),
      el("button", { class: "btn btn-pink btn-sm", type: "submit" }, "Responder ao denunciante")
    ),
    el("h3", { class: "mt-20" }, "Anotações internas"),
    areas.notas,
    el(
      "form",
      {
        onsubmit: async (e) => {
          e.preventDefault();
          const texto = textoNota.value.trim();
          if (!texto) return;
          try {
            await addDoc(collection(db, "denuncias", id, "notas"), { texto, criadaEm: serverTimestamp() });
            textoNota.value = "";
          } catch (err) {
            console.error(err);
            mostrarAlerta(alertaDetalhe, "erro", "Não foi possível salvar a anotação.");
          }
        },
      },
      el("div", { class: "campo" }, textoNota),
      el("button", { class: "btn btn-outline btn-sm", type: "submit" }, "Salvar anotação")
    )
  );

  renderCabecalhoDetalhe(d);

  pararDetalhe.push(
    onSnapshot(query(collection(db, "denuncias", id, "mensagens"), orderBy("criadaEm")), (snap) => {
      areas.mensagens.replaceChildren(
        ...(snap.empty
          ? [el("p", { class: "msg-vazia" }, "Nenhuma mensagem ainda.")]
          : snap.docs.map((m) => {
              const x = m.data();
              return el(
                "div",
                { class: `msg msg-${x.autor === "comite" ? "denunciante" : "comite"}` },
                x.texto,
                el("small", {}, `${x.autor === "comite" ? "Você (equipe)" : "Denunciante"} · ${dataHora(ms(x.criadaEm))}`)
              );
            }))
      );
    }),
    onSnapshot(query(collection(db, "denuncias", id, "notas"), orderBy("criadaEm")), (snap) => {
      areas.notas.replaceChildren(
        ...snap.docs.map((n) =>
          el(
            "li",
            {},
            n.get("texto"),
            el(
              "small",
              {},
              el("span", {}, dataHora(ms(n.get("criadaEm")))),
              el("button", { type: "button", onclick: () => confirm("Excluir esta anotação?") && deleteDoc(n.ref) }, "excluir")
            )
          )
        )
      );
    })
  );
}

// A URL é obtida antes do clique para não ser bloqueada como pop-up.
function linkAnexo(path) {
  const a = el("a", { class: "btn btn-blue btn-sm", target: "_blank", rel: "noopener noreferrer", "aria-disabled": "true" }, "Carregando…");
  getDownloadURL(ref(storage, path))
    .then((url) => {
      a.href = url;
      a.textContent = "Abrir";
      a.removeAttribute("aria-disabled");
    })
    .catch((e) => {
      console.error(e);
      a.textContent = "Indisponível";
    });
  return a;
}

function renderCabecalhoDetalhe(d) {
  const selStatus = el("select", { class: "form-control", id: "sel-status" });
  for (const [v, t] of Object.entries(STATUS)) selStatus.append(el("option", { value: v, selected: v === d.status }, t));
  selStatus.addEventListener("change", () =>
    updateDoc(doc(db, "denuncias", d.id), { status: selStatus.value, atualizadaEm: serverTimestamp() })
  );
  const selPrioridade = el("select", { class: "form-control", id: "sel-prioridade" });
  for (const [v, t] of Object.entries({ baixa: "Baixa", normal: "Normal", alta: "Alta" }))
    selPrioridade.append(el("option", { value: v, selected: v === (d.prioridade || "normal") }, t));
  selPrioridade.addEventListener("change", () =>
    updateDoc(doc(db, "denuncias", d.id), { prioridade: selPrioridade.value })
  );

  const item = (rotulo, valor) => (valor ? [el("dt", {}, rotulo), el("dd", {}, valor)] : []);
  const andamento = { sim: "Sim", nao: "Não", nao_sei: "Não sabe" };
  const anexos = el("dd", {});
  if (d.anexos?.length) {
    anexos.append(
      el(
        "ul",
        { class: "lista-arquivos" },
        d.anexos.map((a) =>
          el(
            "li",
            {},
            `${a.nome} (${(a.tamanho / 1024 / 1024).toFixed(1)} MB)`,
            linkAnexo(a.path)
          )
        )
      )
    );
  } else anexos.textContent = "Nenhum";

  areas.cabecalho.replaceChildren(
    el("div", { class: "cabecalho" }, el("h2", {}, d.id), badgeStatus(d.status)),
    el(
      "div",
      { class: "controles" },
      el("div", { class: "campo" }, el("label", { for: "sel-status" }, "Status"), selStatus),
      el("div", { class: "campo" }, el("label", { for: "sel-prioridade" }, "Prioridade"), selPrioridade)
    ),
    el(
      "dl",
      { class: "mt-20" },
      ...item("Registrada em", dataHora(ms(d.criadaEm))),
      ...item("Atualizada em", dataHora(ms(d.atualizadaEm))),
      ...item("Categoria", CATEGORIAS[d.categoria] || d.categoria),
      ...item("Identificação", d.anonimo ? "Anônima" : "Identificada"),
      ...(d.identificacao
        ? [
            ...item("Nome", d.identificacao.nome),
            ...item("E-mail", d.identificacao.email),
            ...item("Telefone", d.identificacao.telefone),
          ]
        : []),
      ...item("Vínculo", VINCULOS[d.vinculo] || d.vinculo),
      ...item("Relato", d.descricao),
      ...item("Quando", d.quando),
      ...item("Onde", d.onde),
      ...item("Envolvidos", d.envolvidos),
      ...item("Testemunhas", d.testemunhas),
      ...item("Ainda acontece?", andamento[d.emAndamento]),
      ...item("Já comunicou", d.jaComunicou),
      el("dt", {}, "Anexos"),
      anexos
    )
  );
}
