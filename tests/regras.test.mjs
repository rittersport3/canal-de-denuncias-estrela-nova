// Testes das regras de segurança do Firestore e do Storage (rodam no emulador).
import test, { before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getBytes } from "firebase/storage";

const ADMIN = "pedro.a.m.pimenta@gmail.com";
let env;

const tokenGoogle = (email, extra = {}) => ({
  email,
  email_verified: true,
  firebase: { sign_in_provider: "google.com" },
  ...extra,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-estrela-nova",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});

after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "denuncias/AAAA-BBBB-CCCC"), { descricao: "relato", status: "recebida" });
    await setDoc(doc(db, "segredos/AAAA-BBBB-CCCC"), { hash: "x", salt: "y" });
  });
});

const admin = () => env.authenticatedContext("admin", tokenGoogle(ADMIN)).firestore();

test("admin lê denúncias", async () => {
  await assertSucceeds(getDoc(doc(admin(), "denuncias/AAAA-BBBB-CCCC")));
  await assertSucceeds(getDocs(collection(admin(), "denuncias")));
});

test("segunda administradora também lê denúncias e anexos", async () => {
  const luana = env.authenticatedContext("luana", tokenGoogle("luana@estrelanova.org.br"));
  await assertSucceeds(getDoc(doc(luana.firestore(), "denuncias/AAAA-BBBB-CCCC")));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), "denuncias/AAAA-BBBB-CCCC/g.pdf"), new Uint8Array([1]), { contentType: "application/pdf" });
  });
  await assertSucceeds(getBytes(ref(luana.storage(), "denuncias/AAAA-BBBB-CCCC/g.pdf")));
});

test("visitante, anônimo e outros e-mails não leem denúncias", async () => {
  const contextos = [
    env.unauthenticatedContext(),
    env.authenticatedContext("anon", { firebase: { sign_in_provider: "anonymous" } }),
    env.authenticatedContext("outro", tokenGoogle("outra.pessoa@gmail.com")),
    env.authenticatedContext("parecido", tokenGoogle("luana@estrelanova.org.br.evil.com")),
    env.authenticatedContext("naoverif", tokenGoogle(ADMIN, { email_verified: false })),
    env.authenticatedContext("senha", { email: ADMIN, email_verified: true, firebase: { sign_in_provider: "password" } }),
  ];
  for (const c of contextos) {
    await assertFails(getDoc(doc(c.firestore(), "denuncias/AAAA-BBBB-CCCC")));
    await assertFails(getDocs(collection(c.firestore(), "denuncias")));
  }
});

test("ninguém cria denúncias diretamente pelo cliente", async () => {
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), "denuncias/X"), { a: 1 }));
  await assertFails(setDoc(doc(admin(), "denuncias/NOVA-NOVA-NOVA"), { a: 1 }));
});

test("admin altera status, mas não o relato", async () => {
  const ref1 = doc(admin(), "denuncias/AAAA-BBBB-CCCC");
  await assertSucceeds(updateDoc(ref1, { status: "em_analise", atualizadaEm: serverTimestamp() }));
  await assertFails(updateDoc(ref1, { descricao: "alterado" }));
});

test("segredos nunca são acessíveis", async () => {
  await assertFails(getDoc(doc(admin(), "segredos/AAAA-BBBB-CCCC")));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "segredos/AAAA-BBBB-CCCC")));
});

test("admin responde como comitê; não pode se passar pelo denunciante", async () => {
  const msgs = collection(admin(), "denuncias/AAAA-BBBB-CCCC/mensagens");
  await assertSucceeds(addDoc(msgs, { autor: "comite", texto: "Olá", criadaEm: serverTimestamp() }));
  await assertFails(addDoc(msgs, { autor: "denunciante", texto: "x", criadaEm: serverTimestamp() }));
  const outro = env.authenticatedContext("outro", tokenGoogle("x@gmail.com")).firestore();
  await assertFails(addDoc(collection(outro, "denuncias/AAAA-BBBB-CCCC/mensagens"), { autor: "comite", texto: "x", criadaEm: serverTimestamp() }));
});

test("listas de destinatários: só admins leem e editam, no formato esperado", async () => {
  const cfg = (db) => doc(db, "config/notificacoes");
  const valido = (email) => ({ padrao: ["a@b.org"], diretoria: ["c@d.org"], atualizadaEm: serverTimestamp(), atualizadaPor: email });
  await assertSucceeds(setDoc(cfg(admin()), valido(ADMIN)));
  await assertSucceeds(getDoc(cfg(admin())));
  await assertFails(setDoc(cfg(admin()), { ...valido(ADMIN), extra: 1 }));
  await assertFails(setDoc(cfg(admin()), { ...valido(ADMIN), padrao: "a@b.org" }));
  await assertFails(setDoc(cfg(admin()), valido("outro@x.org")));
  const outro = env.authenticatedContext("o", tokenGoogle("x@gmail.com")).firestore();
  await assertFails(getDoc(cfg(outro)));
  await assertFails(setDoc(cfg(outro), valido("x@gmail.com")));
  await assertFails(getDoc(cfg(env.unauthenticatedContext().firestore())));
});

test("storage: anônimo só envia para a própria pasta e não lê", async () => {
  const anon = env.authenticatedContext("u1", { firebase: { sign_in_provider: "anonymous" } }).storage();
  const pdf = new Uint8Array([37, 80, 68, 70]);
  await assertSucceeds(uploadBytes(ref(anon, "uploads/u1/a.pdf"), pdf, { contentType: "application/pdf" }));
  await assertFails(uploadBytes(ref(anon, "uploads/u2/a.pdf"), pdf, { contentType: "application/pdf" }));
  await assertFails(uploadBytes(ref(anon, "uploads/u1/b.html"), pdf, { contentType: "text/html" }));
  await assertFails(uploadBytes(ref(anon, "uploads/u1/a.pdf"), pdf, { contentType: "application/pdf" }));
  await assertFails(getBytes(ref(anon, "uploads/u1/a.pdf")));
  await assertFails(uploadBytes(ref(env.unauthenticatedContext().storage(), "uploads/x/a.pdf"), pdf, { contentType: "application/pdf" }));
});

test("storage: só o admin lê anexos das denúncias", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), "denuncias/AAAA-BBBB-CCCC/f.pdf"), new Uint8Array([1]), { contentType: "application/pdf" });
  });
  const adm = env.authenticatedContext("admin", tokenGoogle(ADMIN)).storage();
  await assertSucceeds(getBytes(ref(adm, "denuncias/AAAA-BBBB-CCCC/f.pdf")));
  const outro = env.authenticatedContext("o", tokenGoogle("x@gmail.com")).storage();
  await assertFails(getBytes(ref(outro, "denuncias/AAAA-BBBB-CCCC/f.pdf")));
});
