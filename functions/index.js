const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions, logger } = require("firebase-functions/v2");
const { defineSecret, defineString } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const v = require("./validacao");
const { destinatariosPara } = require("./avisos");

const MAX_ANEXOS = 5;
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MINUTOS = 15;

// Avisos por e-mail enviados pela API do Brevo (https://www.brevo.com).
// A chave fica no Secret Manager e o remetente em functions/.env. Os destinatários
// são cadastrados pelos admins no painel (documento config/notificacoes).
const BREVO_API_KEY = defineSecret("BREVO_API_KEY");
const AVISO_REMETENTE = defineString("AVISO_REMETENTE", {
  default: "",
  description: "E-mail remetente verificado no Brevo",
});

setGlobalOptions({ region: "southamerica-east1", maxInstances: 10 });
initializeApp();
const db = getFirestore();

function erroUsuario(e) {
  if (e instanceof HttpsError) return e;
  return new HttpsError("invalid-argument", e.message);
}

function ms(ts) {
  return ts instanceof Timestamp ? ts.toMillis() : null;
}

// Move os anexos da área temporária do denunciante para a pasta da denúncia.
async function moverAnexos(anexos, uid, protocolo) {
  if (anexos.length > MAX_ANEXOS) throw new Error(`Envie no máximo ${MAX_ANEXOS} arquivos.`);
  const bucket = getStorage().bucket();
  const prefixo = `uploads/${uid}/`;
  const movidos = [];
  for (const a of anexos) {
    const path = typeof a?.path === "string" ? a.path : "";
    if (!path.startsWith(prefixo) || path.slice(prefixo.length).includes("/")) {
      throw new Error("Anexo inválido.");
    }
    const arquivo = bucket.file(path);
    const [existe] = await arquivo.exists();
    if (!existe) throw new Error("Um dos anexos não foi encontrado. Envie-o novamente.");
    const [meta] = await arquivo.getMetadata();
    const destino = `denuncias/${protocolo}/${path.slice(prefixo.length)}`;
    await arquivo.move(destino);
    movidos.push({
      path: destino,
      nome: v.texto(a.nome, { max: 200, campo: "Nome do arquivo" }) || "arquivo",
      tipo: meta.contentType || "application/octet-stream",
      tamanho: Number(meta.size) || 0,
    });
  }
  return movidos;
}

exports.registrarDenuncia = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sessão inválida. Recarregue a página.");
  let dados;
  try {
    dados = v.validarDenuncia(req.data);
  } catch (e) {
    throw erroUsuario(e);
  }

  // Garante um protocolo inédito.
  let protocolo;
  for (let i = 0; i < 5; i++) {
    const candidato = v.gerarProtocolo();
    const snap = await db.doc(`denuncias/${candidato}`).get();
    if (!snap.exists) {
      protocolo = candidato;
      break;
    }
  }
  if (!protocolo) throw new HttpsError("internal", "Não foi possível gerar o protocolo. Tente novamente.");

  let anexos;
  try {
    anexos = await moverAnexos(dados.anexos, req.auth.uid, protocolo);
  } catch (e) {
    throw erroUsuario(e);
  }

  const { senha, anexos: _ignorado, ...relato } = dados;
  const { salt, hash } = v.hashSenha(senha);
  const agora = FieldValue.serverTimestamp();

  const batch = db.batch();
  batch.set(db.doc(`denuncias/${protocolo}`), {
    ...relato,
    anexos,
    status: "recebida",
    prioridade: "normal",
    aguardandoResposta: false,
    criadaEm: agora,
    atualizadaEm: agora,
  });
  batch.set(db.doc(`segredos/${protocolo}`), {
    salt,
    hash,
    tentativas: 0,
    bloqueadoAte: null,
  });
  await batch.commit();

  logger.info("Nova denúncia registrada", { protocolo });
  return { protocolo };
});

// Confere protocolo + senha, aplicando bloqueio após várias tentativas erradas.
async function autenticarDenunciante(data) {
  const protocolo = v.normalizarProtocolo(data?.protocolo);
  const senha = typeof data?.senha === "string" ? data.senha : "";
  const negado = new HttpsError("permission-denied", "Protocolo ou senha incorretos.");
  if (!protocolo || !senha) throw negado;

  const ref = db.doc(`segredos/${protocolo}`);
  const resultado = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return "negado";
    const s = snap.data();
    if (s.bloqueadoAte && s.bloqueadoAte.toMillis() > Date.now()) return "bloqueado";
    if (v.senhaConfere(senha, s.salt, s.hash)) {
      if (s.tentativas) tx.update(ref, { tentativas: 0, bloqueadoAte: null });
      return "ok";
    }
    const tentativas = (s.tentativas || 0) + 1;
    if (tentativas >= MAX_TENTATIVAS) {
      tx.update(ref, {
        tentativas: 0,
        bloqueadoAte: Timestamp.fromMillis(Date.now() + BLOQUEIO_MINUTOS * 60 * 1000),
      });
    } else {
      tx.update(ref, { tentativas });
    }
    return "negado";
  });

  if (resultado === "bloqueado") {
    throw new HttpsError(
      "resource-exhausted",
      `Muitas tentativas incorretas. Aguarde ${BLOQUEIO_MINUTOS} minutos e tente novamente.`
    );
  }
  if (resultado !== "ok") throw negado;
  return protocolo;
}

exports.consultarDenuncia = onCall(async (req) => {
  const protocolo = await autenticarDenunciante(req.data);
  const ref = db.doc(`denuncias/${protocolo}`);
  const [snap, msgs] = await Promise.all([
    ref.get(),
    ref.collection("mensagens").orderBy("criadaEm").get(),
  ]);
  const d = snap.data();
  return {
    protocolo,
    status: d.status,
    categoria: d.categoria,
    descricao: d.descricao,
    anonimo: d.anonimo,
    totalAnexos: (d.anexos || []).length,
    criadaEm: ms(d.criadaEm),
    atualizadaEm: ms(d.atualizadaEm),
    mensagens: msgs.docs.map((m) => ({
      autor: m.get("autor"),
      texto: m.get("texto"),
      criadaEm: ms(m.get("criadaEm")),
    })),
  };
});

exports.enviarMensagemDenunciante = onCall(async (req) => {
  const protocolo = await autenticarDenunciante(req.data);
  let mensagem;
  try {
    mensagem = v.texto(req.data?.texto, { max: 5000, min: 1, campo: "Mensagem" });
  } catch (e) {
    throw erroUsuario(e);
  }
  const ref = db.doc(`denuncias/${protocolo}`);
  await ref.collection("mensagens").add({
    autor: "denunciante",
    texto: mensagem,
    criadaEm: FieldValue.serverTimestamp(),
  });
  await ref.update({ atualizadaEm: FieldValue.serverTimestamp(), aguardandoResposta: true });
  return { ok: true };
});

// ---------- Avisos por e-mail ----------
// Os e-mails NÃO trazem o conteúdo da denúncia, apenas o aviso e o protocolo,
// para que informações sensíveis fiquem somente no painel protegido.

function urlAdmin() {
  const projeto = process.env.GCLOUD_PROJECT;
  return `https://${projeto}.web.app/admin`;
}

// Envia uma mensagem separada para cada destinatário, para que um não veja os demais.
async function enviarAviso(denuncia, protocolo, assunto, linhas) {
  let chave = "";
  try {
    chave = BREVO_API_KEY.value();
  } catch {
    chave = "";
  }
  const remetente = AVISO_REMETENTE.value();
  if (!chave || chave === "desativado" || !remetente) {
    logger.warn("Brevo não configurado; aviso por e-mail não enviado.", { protocolo });
    return;
  }

  const config = (await db.doc("config/notificacoes").get()).data();
  const { envolveDiretoria, emails } = destinatariosPara(denuncia, config);
  if (!emails.length) {
    logger.warn("Nenhum destinatário cadastrado para este tipo de denúncia.", { protocolo, envolveDiretoria });
    return;
  }

  const texto = [
    ...linhas,
    ...(envolveDiretoria ? ["", "Atenção: o denunciante indicou que a situação pode envolver a diretoria."] : []),
    "",
    `Acesse o painel: ${urlAdmin()}`,
  ].join("\n");

  const falhas = [];
  for (const email of emails) {
    const resposta = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": chave, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "Canal de Denúncias Estrela Nova", email: remetente },
        to: [{ email }],
        subject: assunto,
        textContent: texto,
      }),
    });
    if (!resposta.ok) falhas.push(`${resposta.status}: ${await resposta.text()}`);
  }
  if (falhas.length) {
    throw new Error(`Brevo recusou ${falhas.length} de ${emails.length} envios: ${falhas.join(" | ")}`);
  }
  logger.info("Avisos enviados.", { protocolo, envolveDiretoria, total: emails.length });
}

exports.avisarNovaDenuncia = onDocumentCreated(
  { document: "denuncias/{protocolo}", secrets: [BREVO_API_KEY] },
  async (event) => {
    const d = event.data?.data() || {};
    const { protocolo } = event.params;
    await enviarAviso(d, protocolo, `[Canal de Denúncias] Nova denúncia ${protocolo}`, [
      "Uma nova denúncia foi registrada no Canal de Denúncias do Estrela Nova.",
      "",
      `Protocolo: ${protocolo}`,
      `Categoria: ${v.CATEGORIAS[d.categoria] || d.categoria}`,
      `Identificação: ${d.anonimo ? "anônima" : "identificada"}`,
    ]);
  }
);

exports.avisarNovaMensagem = onDocumentCreated(
  { document: "denuncias/{protocolo}/mensagens/{mensagemId}", secrets: [BREVO_API_KEY] },
  async (event) => {
    if (event.data?.get("autor") !== "denunciante") return;
    const { protocolo } = event.params;
    const denuncia = (await db.doc(`denuncias/${protocolo}`).get()).data() || {};
    await enviarAviso(denuncia, protocolo, `[Canal de Denúncias] Nova mensagem na denúncia ${protocolo}`, [
      "O denunciante enviou uma nova mensagem.",
      "",
      `Protocolo: ${protocolo}`,
    ]);
  }
);
