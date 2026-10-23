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
- Recebe **aviso por e-mail** (enviado pelo Brevo) a cada nova denúncia ou nova mensagem do denunciante. Por segurança, o e-mail **não** traz o conteúdo da denúncia, só o protocolo e o link do painel.

## Segurança

| Camada | Proteção |
|---|---|
| `firestore.rules` | Só o admin lê denúncias. O relato é imutável: o admin altera apenas status, prioridade e flags. Os hashes de senha (`segredos/`) nunca são acessíveis por clientes. |
| `storage.rules` | O denunciante só **envia** arquivos para a própria pasta temporária: não lê, não lista, não sobrescreve. Só o admin lê os anexos. |
| Cloud Functions | Registram a denúncia, conferem protocolo e senha (hash scrypt) e bloqueiam por 15 minutos após 5 tentativas erradas. A mensagem de erro é a mesma para protocolo inexistente e senha errada. |
| Hosting | CSP restritiva, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS e `noindex` no painel. |
| Front-end | Todo conteúdo é renderizado como texto (`textContent`), sem `innerHTML`, para evitar XSS. |

O e-mail do admin está fixado no código. Para trocá-lo, altere:
`firestore.rules`, `storage.rules` e, só para a interface, `public/assets/js/firebase.js`.

## Publicação

O sistema está publicado no projeto Firebase **`canal-denuncias-estrela-nova`** (conta pedro.a.m.pimenta@gmail.com, plano Blaze):

- Site: <https://canal-denuncias-estrela-nova.web.app>
- Painel: <https://canal-denuncias-estrela-nova.web.app/admin>

Configuração feita no projeto:
- Firestore e Storage em `southamerica-east1` (São Paulo). O Firestore tem proteção contra exclusão.
- Authentication com os provedores Google e Anônimo.
- Regra de ciclo de vida no bucket que apaga anexos abandonados em `uploads/` após 1 dia.
- Limpeza automática de imagens antigas de build das funções.
- Exclusão dos logs de requisição HTTP das funções, para não registrar o IP de quem denuncia.
- Conta de serviço `github-deploy`, acessada pelo GitHub Actions via **Workload Identity Federation**, sem chave guardada. Só este repositório, no ambiente `producao`, pode usá-la.

### CI/CD

O workflow `.github/workflows/ci-cd.yml` faz o seguinte:
- **Em todo PR e push**: roda os testes de validação e os testes das regras de segurança nos emuladores.
- **Em todo push ou merge na `main`**: depois dos testes, sincroniza a chave do Brevo e roda `firebase deploy` (Hosting, Firestore, Storage e Functions).
- Para rodar sem um novo commit, use *Actions → CI/CD → Run workflow*.

Nenhum secret é obrigatório no GitHub. Opcionalmente:
- **Avisos por e-mail** (via [Brevo](https://www.brevo.com), plano gratuito de 300 e-mails/dia):
  1. Crie uma conta no Brevo e, em *Remetentes, domínios e IPs dedicados → Remetentes*, adicione e confirme o e-mail remetente.
  2. Em *SMTP e API → Chaves de API*, gere uma chave e salve-a no GitHub em *Settings → Environments → producao → Add environment secret*, com o nome `BREVO_API_KEY`.
  3. Preencha `AVISO_REMETENTE` e `AVISO_DESTINATARIO` em `functions/.env`.

  A chave é enviada ao Google Cloud no próximo deploy. Sem ela, o valor fica "desativado" e o sistema funciona sem avisos.
- **Aprovação manual de cada deploy**: em *Environments → producao → Required reviewers*.

Se um deploy falhar por permissão (`403` / `Permission denied`), conceda o papel indicado na mensagem à conta `github-deploy` em *IAM*. Para recriar tudo em outro projeto, use `scripts/configurar-deploy.sh`.

### Deploy manual (alternativa)

```bash
npm install && npm --prefix functions install
npx firebase login
npx firebase functions:secrets:set BREVO_API_KEY   # ou "desativado"
npx firebase deploy
```

### Recomendado após o deploy

- **Domínio próprio** (ex.: `denuncias.estrelanova.org.br`): em *Hosting → Adicionar domínio personalizado*, crie os registros DNS indicados. Depois, adicione o domínio em *Authentication → Configurações → Domínios autorizados*. Vale pôr um link "Canal de Denúncias" no rodapé do site do Estrela Nova.
- **Logs e anonimato** (já aplicado): a aplicação não grava IP nem dados do dispositivo junto à denúncia. Além disso, o roteador de logs do projeto tem a exclusão `requisicoes-http-funcoes`, que descarta os logs de requisição das funções (onde o Google Cloud registraria o IP de quem acessa).
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
