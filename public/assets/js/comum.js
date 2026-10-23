// Utilitários compartilhados e montagem do cabeçalho/rodapé no estilo do site.

export const CATEGORIAS = {
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

export const VINCULOS = {
  colaborador: "Colaborador(a)",
  voluntario: "Voluntário(a)",
  familia: "Família ou responsável de atendido",
  atendido: "Criança, adolescente ou jovem atendido",
  parceiro: "Parceiro, doador ou fornecedor",
  comunidade: "Comunidade",
  outro: "Outro",
  nao_informado: "Prefiro não informar",
};

export const STATUS = {
  recebida: "Recebida",
  em_analise: "Em análise",
  aguardando_informacoes: "Aguardando informações",
  concluida: "Concluída",
  arquivada: "Arquivada",
};

// Cria elementos sem innerHTML para evitar injeção de conteúdo das denúncias.
export function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) {
    if (f === null || f === undefined || f === false) continue;
    e.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return e;
}

export function dataHora(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function badgeStatus(status) {
  return el("span", { class: `status status-${status}` }, STATUS[status] || status);
}

export function mensagemErro(e) {
  // Erros de Cloud Functions chegam com código "functions/..." e mensagem em português.
  if (e?.code?.startsWith("functions/") && e.code !== "functions/internal") return e.message;
  console.error(e);
  return "Ocorreu um erro inesperado. Verifique sua conexão e tente novamente.";
}

export function mostrarAlerta(container, tipo, texto) {
  container.replaceChildren(el("div", { class: `alerta alerta-${tipo}`, role: "alert" }, texto));
  container.scrollIntoView({ behavior: "smooth", block: "center" });
}

const SITE = "https://www.estrelanova.org.br";

function montarCabecalho() {
  const atual = location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  const link = (href, texto) =>
    el("li", {}, el("a", { href, "aria-current": atual === href ? "page" : null }, texto));
  const header = el(
    "header",
    {},
    el(
      "div",
      { class: "emergencia" },
      el("strong", {}, "Criança ou adolescente em risco agora? "),
      "Ligue ",
      el("a", { href: "tel:190" }, "190"),
      " (Polícia) ou ",
      el("a", { href: "tel:100" }, "Disque 100"),
      " (Direitos Humanos) e procure o Conselho Tutelar. Este canal não é um serviço de emergência."
    ),
    el(
      "nav",
      { class: "navbar", "aria-label": "Principal" },
      el(
        "div",
        { class: "container" },
        el(
          "a",
          { class: "navbar-brand", href: "/" },
          el("img", { src: "/assets/img/logo.svg", alt: "Estrela Nova — Movimento Comunitário" })
        ),
        el(
          "ul",
          { class: "navbar-nav" },
          link("/", "Início"),
          link("/denunciar", "Fazer denúncia"),
          link("/acompanhar", "Acompanhar denúncia"),
          el("li", {}, el("a", { class: "site-link", href: SITE, rel: "noopener" }, "estrelanova.org.br"))
        )
      )
    )
  );
  document.body.prepend(header);
}

function montarRodape() {
  const footer = el(
    "footer",
    { class: "footer" },
    el(
      "div",
      { class: "container" },
      el("img", { class: "footer__logo", src: "/assets/img/logo-branco.svg", alt: "Estrela Nova" }),
      el(
        "p",
        { class: "footer__descricao" },
        "Missão: promover ações socioeducativas e de cidadania com a comunidade."
      ),
      el(
        "div",
        { class: "footer__infos" },
        el(
          "div",
          {},
          el("h4", {}, "Canal de Denúncias"),
          el("p", {}, el("a", { href: "/denunciar" }, "Fazer uma denúncia")),
          el("p", {}, el("a", { href: "/acompanhar" }, "Acompanhar com protocolo"))
        ),
        el(
          "div",
          {},
          el("h4", {}, "Estrela Nova"),
          el("p", {}, "Rua João Bernardo Vieira, 267 — Jardim Paris"),
          el("p", {}, "CEP 05794-310 — São Paulo/SP")
        ),
        el(
          "div",
          {},
          el("h4", {}, "Emergências"),
          el("p", {}, "Polícia: 190 · Disque Direitos Humanos: 100"),
          el("p", {}, "Central de Atendimento à Mulher: 180")
        )
      ),
      el(
        "p",
        { class: "footer__copy" },
        `© ${new Date().getFullYear()} Estrela Nova Movimento Comunitário · CNPJ 53.817.169/0001-03 · `,
        el("a", { href: `${SITE}/politica-de-privacidade/`, rel: "noopener" }, "Política de Privacidade")
      )
    )
  );
  document.body.append(footer);
}

montarCabecalho();
montarRodape();
