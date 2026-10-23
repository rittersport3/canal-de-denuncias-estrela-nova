// Inicialização do Firebase. Em produção, a configuração vem do endereço
// reservado do Firebase Hosting (/__/firebase/init.json), então não é preciso
// colar chaves no código. Em localhost, conecta aos emuladores.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getStorage, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

// Apenas para a interface; a proteção real está nas regras do Firestore/Storage.
export const ADMIN_EMAILS = ["pedro.a.m.pimenta@gmail.com", "luana@estrelanova.org.br"];
const REGIAO = "southamerica-east1";

const local = ["localhost", "127.0.0.1"].includes(location.hostname);

async function carregarConfig() {
  try {
    const r = await fetch("/__/firebase/init.json");
    if (r.ok) return await r.json();
  } catch {
    // segue para o fallback
  }
  if (local) return { projectId: "demo-estrela-nova", apiKey: "demo", authDomain: "localhost", storageBucket: "demo-estrela-nova.appspot.com" };
  throw new Error("Configuração do Firebase indisponível.");
}

const config = await carregarConfig();
export const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, REGIAO);

if (local) {
  connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, location.hostname, 8080);
  connectStorageEmulator(storage, location.hostname, 9199);
  connectFunctionsEmulator(functions, location.hostname, 5001);
}
