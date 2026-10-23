#!/usr/bin/env bash
# Prepara o projeto Google Cloud/Firebase para o deploy automático pelo GitHub Actions.
# Rode uma única vez no Cloud Shell (https://shell.cloud.google.com), logado com a
# conta dona do projeto:
#
#   bash configurar-deploy.sh <ID_DO_PROJETO>
#
# Ao final, é gerado o arquivo chave-github.json: copie o conteúdo para o secret
# FIREBASE_SERVICE_ACCOUNT do GitHub e apague o arquivo.
set -euo pipefail

PROJETO="${1:?Informe o ID do projeto Firebase. Ex.: bash configurar-deploy.sh canal-denuncias-estrela-nova}"
CONTA="github-deploy"
EMAIL="${CONTA}@${PROJETO}.iam.gserviceaccount.com"

gcloud config set project "$PROJETO"

echo "Ativando APIs necessárias…"
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  eventarc.googleapis.com \
  pubsub.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  firebasestorage.googleapis.com \
  firebaserules.googleapis.com \
  firebasehosting.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com

echo "Criando a conta de serviço ${EMAIL}…"
gcloud iam service-accounts describe "$EMAIL" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$CONTA" --display-name "Deploy pelo GitHub Actions"

for papel in \
  roles/firebase.admin \
  roles/cloudfunctions.admin \
  roles/run.admin \
  roles/iam.serviceAccountUser \
  roles/secretmanager.admin \
  roles/artifactregistry.admin \
  roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJETO" \
    --member "serviceAccount:${EMAIL}" --role "$papel" --condition=None --quiet >/dev/null
  echo "  papel concedido: $papel"
done

gcloud iam service-accounts keys create chave-github.json --iam-account "$EMAIL"
echo
echo "Pronto! Copie o conteúdo abaixo para o secret FIREBASE_SERVICE_ACCOUNT no GitHub"
echo "e depois apague o arquivo com: rm chave-github.json"
echo "------------------------------------------------------------------"
cat chave-github.json
