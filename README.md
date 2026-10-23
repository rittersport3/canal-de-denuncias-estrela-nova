# Canal de Denúncias — Estrela Nova

Canal de denúncias para o [Estrela Nova Movimento Comunitário](https://www.estrelanova.org.br/), com a identidade visual do site (Nunito Sans e Roboto Slab, azul `#0075bf`/`#007dc5`, rosa `#ec5667`, laranja `#ee6b29`).

Roda inteiro no **Firebase** (Hosting, Firestore, Storage, Auth e Cloud Functions em `southamerica-east1`, São Paulo).

## Funcionalidades

**Denunciante** (sem login)
- Escolhe se faz a denúncia **anônima** ou **identificada** (nome e e-mail/telefone).
- Formulário guiado: categoria, relato, quando, onde, envolvidos, testemunhas, se ainda está acontecendo e se já comunicou a alguém.
- Pode enviar **anexos**: até 5 arquivos de 15 MB (fotos, PDF, áudio, vídeo).
- Recebe um **protocolo** (ex.: `K7QM-2XRP-9TBD`) e cria uma **senha**. Pode copiar, imprimir ou baixar um comprovante.
- Em **/acompanhar**, consulta o status e **troca mensagens** com a equipe sem se identificar.
- Uma faixa de emergência no topo orienta a ligar 190, Disque 100 ou procurar o Conselho Tutelar quando uma criança está em risco.

**Administrador** (`/admin`)
- Login com Google, aceito **somente** para `pedro.a.m.pimenta@gmail.com` (e-mail verificado e provedor Google).
- Indicadores, lista com filtros por status e categoria, e busca.
- Detalhes da denúncia, download de anexos, alteração de status e prioridade.
- Responde ao denunciante e mantém **anotações internas**, que o denunciante não vê.
- Recebe **aviso por e-mail** a cada nova denúncia ou nova mensagem do denunciante. Por segurança, o e-mail **não** traz o conteúdo da denúncia, só o protocolo e o link do painel.

## Segurança

| Camada | Proteção |
|---|---|
| `firestore.rules` | Só o admin lê denúncias. O relato é imutável: o admin altera apenas status, prioridade e flags. Os hashes de senha (`segredos/`) nunca são acessíveis por clientes. |
| `storage.rules` | O denunciante só **envia** arquivos para a própria pasta temporária: não lê, não lista, não sobrescreve. Só o admin lê os anexos. |
| Cloud Functions | Registram a denúncia, conferem protocolo e senha (hash scrypt) e bloqueiam por 15 minutos após 5 tentativas erradas. A mensagem de erro é a mesma para protocolo inexistente e senha errada. |
| Hosting | CSP restritiva, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS e `noindex` no painel. |
| Front-end | Todo conteúdo é renderizado como texto (`textContent`), sem `innerHTML`, para evitar XSS. |

O e-mail do admin está fixado no código. Para trocá-lo, altere:
`firestore.rules`, `storage.rules`, `functions/index.js` (`ADMIN_EMAIL`) e, só para a interface, `public/assets/js/firebase.js`.

## Como publicar (passo a passo)

Use a conta **pedro.a.m.pimenta@gmail.com**.

1. **Crie o projeto** em <https://console.firebase.google.com> (ex.: `canal-denuncias-estrela-nova`). Se o ID for diferente, ajuste `.firebaserc`.
2. **Ative o plano Blaze** (pagamento por uso), exigido por Cloud Functions e Storage. Para o volume de um canal de denúncias, o custo esperado é zero ou de centavos, porque fica dentro da cota gratuita. Crie um **alerta de orçamento** (ex.: R$ 10) em *Uso e faturamento*.
3. **Authentication → Método de login**: ative **Google** e **Anônimo**. O anônimo serve só para autorizar o envio de anexos e não identifica ninguém.
4. **Firestore Database**: crie em modo produção, região `southamerica-east1`.
5. **Storage**: crie o bucket padrão, de preferência na mesma região.
6. **Conta de serviço para o deploy automático**: abra o [Cloud Shell](https://shell.cloud.google.com) com a mesma conta, envie o arquivo `scripts/configurar-deploy.sh` (menu ⋮ → *Upload*) e rode:
   ```bash
   bash configurar-deploy.sh <ID_DO_PROJETO>
   ```
   O script ativa as APIs, cria a conta `github-deploy` com as permissões necessárias e imprime uma chave JSON.
7. **Configure o GitHub** em *Settings → Environments → New environment*. Crie o ambiente `producao` e, nele:
   - **Secret `FIREBASE_SERVICE_ACCOUNT`**: cole o JSON impresso pelo script e depois apague o arquivo no Cloud Shell (`rm chave-github.json`).
   - **Secret `GMAIL_APP_PASSWORD`** (opcional, para os avisos por e-mail): ative a verificação em duas etapas na conta Google e gere uma senha de app em <https://myaccount.google.com/apppasswords>. Sem esse secret, o sistema funciona, mas sem avisos por e-mail.
   - Em *Settings → Secrets and variables → Actions → Variables*, crie a **variável `FIREBASE_PROJECT_ID`** com o ID do projeto.
   - Opcional: em *Deployment protection rules*, marque *Required reviewers* para aprovar cada deploy manualmente.
8. **Deploy**: todo push ou merge na branch `main` roda os testes e, se passarem, publica no Firebase. Para rodar sem um novo commit, use *Actions → CI/CD → Run workflow*.
9. O site fica em `https://<id-do-projeto>.web.app`. O painel fica em `/admin`.

### CI/CD

O workflow `.github/workflows/ci-cd.yml` faz o seguinte:
- **Em todo PR e push**: roda os testes de validação e os testes das regras de segurança nos emuladores.
- **Na `main`**: depois dos testes, sincroniza o secret `GMAIL_APP_PASSWORD` no Google Cloud e roda `firebase deploy` (Hosting, Firestore, Storage e Functions).

Se o deploy falhar por permissão (`Permission denied` / `403`), conceda o papel indicado na mensagem à conta `github-deploy` em *IAM*.

### Deploy manual (alternativa)

```bash
npm install && npm --prefix functions install
npx firebase login
npx firebase functions:secrets:set GMAIL_APP_PASSWORD   # ou digite "desativado"
npx firebase deploy
```

### Recomendado após o deploy

- **Domínio próprio** (ex.: `denuncias.estrelanova.org.br`): em *Hosting → Adicionar domínio personalizado*, crie os registros DNS indicados. Depois, adicione o domínio em *Authentication → Configurações → Domínios autorizados*. Vale pôr um link "Canal de Denúncias" no rodapé do site do Estrela Nova.
- **Limpar anexos abandonados**: se alguém envia um anexo e desiste antes de concluir, o arquivo fica em `uploads/`. Crie uma regra de ciclo de vida que apague esses arquivos após 1 dia:
  ```bash
  cat > lifecycle.json <<'EOF'
  {"rule":[{"action":{"type":"Delete"},"condition":{"age":1,"matchesPrefix":["uploads/"]}}]}
  EOF
  gcloud storage buckets update gs://<nome-do-bucket> --lifecycle-file=lifecycle.json  # nome exibido no console do Storage
  ```
- **Logs e anonimato**: a aplicação não grava IP nem dados do dispositivo junto à denúncia. Porém, os logs de requisição do Google Cloud (Cloud Run) registram o IP de quem chama as funções. Para reduzir isso, crie no *Cloud Logging → Roteador de logs* uma exclusão para `resource.type="cloud_run_revision" AND log_name:"requests"`, ou reduza a retenção.
- **App Check** (opcional): para conter envios automatizados (spam), ative o Firebase App Check com reCAPTCHA Enterprise e passe `enforceAppCheck: true` nas funções.

## Desenvolvimento local

Requer Node 22 e Java (para os emuladores).

```bash
npm install && npm --prefix functions install
npm run emuladores   # site em http://localhost:5000, painel dos emuladores em http://localhost:4000
npm test             # testes de validação + testes das regras de segurança
```

Em `localhost`, o site se conecta automaticamente aos emuladores. No painel `/admin`, o login Google do emulador permite criar uma conta fictícia com o e-mail do admin.

## Estrutura

```
public/                 site estático (HTML, CSS, JS com módulos ES)
  index.html            página inicial / como funciona
  denunciar.html        formulário de denúncia
  acompanhar.html       consulta por protocolo + senha
  admin.html            painel do administrador
  assets/               css, js e logos do Estrela Nova
functions/              Cloud Functions (registro, consulta, mensagens, avisos por e-mail)
firestore.rules         regras de acesso ao banco
storage.rules           regras de acesso aos anexos
tests/                  testes das regras (rodam no emulador)
scripts/                configuração única da conta de serviço do deploy
.github/workflows/      CI/CD (testes em PRs, deploy na main)
```
