#!/usr/bin/env bash
# Prepara o projeto Google Cloud/Firebase para o deploy automático pelo GitHub Actions,
# usando Workload Identity Federation (sem chave de conta de serviço).
# Já foi executado para canal-denuncias-estrela-nova; serve para recriar o ambiente
# em outro projeto. Rode no Cloud Shell (https://shell.cloud.google.com):
#
#   bash configurar-deploy.sh <ID_DO_PROJETO> <dono/repositorio>
#
# Depois, atualize em .github/workflows/ci-cd.yml o PROJETO, o
# workload_identity_provider e o service_account impressos no final.
set -euo pipefail

PROJETO="${1:?Informe o ID do projeto Firebase}"
REPO="${2:?Informe o repositório GitHub, ex.: rittersport3/canal-de-denuncias-estrela-nova}"
EMAIL="github-deploy@${PROJETO}.iam.gserviceaccount.com"

gcloud config set project "$PROJETO"
NUMERO=$(gcloud projects describe "$PROJETO" --format='value(projectNumber)')

echo "Ativando APIs necessárias…"
gcloud services enable \
  cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  run.googleapis.com eventarc.googleapis.com pubsub.googleapis.com secretmanager.googleapis.com \
  firestore.googleapis.com firebasestorage.googleapis.com firebaserules.googleapis.com \
  firebasehosting.googleapis.com cloudresourcemanager.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com

echo "Criando a conta de serviço ${EMAIL}…"
gcloud iam service-accounts describe "$EMAIL" >/dev/null 2>&1 ||
  gcloud iam service-accounts create github-deploy --display-name "Deploy pelo GitHub Actions"

for papel in \
  roles/firebase.admin roles/cloudfunctions.admin roles/run.admin roles/iam.serviceAccountUser \
  roles/secretmanager.admin roles/artifactregistry.admin roles/serviceusage.serviceUsageConsumer \
  roles/eventarc.admin roles/datastore.indexAdmin; do
  gcloud projects add-iam-policy-binding "$PROJETO" \
    --member "serviceAccount:${EMAIL}" --role "$papel" --condition=None --quiet >/dev/null
  echo "  papel concedido: $papel"
done

echo "Configurando a federação de identidade com o GitHub…"
gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers describe github --location=global --workload-identity-pool=github >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc github --location=global \
    --workload-identity-pool=github --display-name="GitHub" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.environment=assertion.environment" \
    --attribute-condition="assertion.repository=='${REPO}' && assertion.environment=='producao'"
gcloud iam service-accounts add-iam-policy-binding "$EMAIL" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${NUMERO}/locations/global/workloadIdentityPools/github/attribute.repository/${REPO}" \
  --condition=None >/dev/null

echo
echo "Pronto! Valores para .github/workflows/ci-cd.yml:"
echo "  PROJETO: ${PROJETO}"
echo "  workload_identity_provider: projects/${NUMERO}/locations/global/workloadIdentityPools/github/providers/github"
echo "  service_account: ${EMAIL}"
