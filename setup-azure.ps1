# ============================================================
# Script setup Azure cho Secure File Sharing
# Chay trong PowerShell: .\setup-azure.ps1
# ============================================================

$SUBSCRIPTION   = "9080fbf8-8a6d-4a14-958d-8c8ca01f782c"
$TENANT         = "447080b4-b9c6-4b0b-92fd-b543a68b4e97"
$RG_STORAGE     = "rg-secure-share"
$REGION_STORAGE = "southeastasia"
$RG_KV          = "rg-secure-share-kv"
$REGION_KV      = "eastus"
$STORAGE        = "sfs9080f782c"
$CONTAINER      = "secure-files"
$KV             = "kv-secure-f782c"

Write-Host "`n[1/7] Dang nhap Azure (dung tenant)..." -ForegroundColor Cyan
az login --tenant $TENANT

Write-Host "`n[2/7] Set subscription..." -ForegroundColor Cyan
az account set --subscription $SUBSCRIPTION --tenant $TENANT
az account show --query "{Subscription:name, ID:id, Tenant:tenantId}" -o table

$ACTIVE_SUB = az account show --query "id" -o tsv
if ($ACTIVE_SUB -ne $SUBSCRIPTION) {
    Write-Host "ERROR: Subscription dang active khong dung!" -ForegroundColor Red
    Write-Host "Active  : $ACTIVE_SUB"
    Write-Host "Expected: $SUBSCRIPTION"
    exit 1
}

Write-Host "`n[3/7] Kiem tra RG storage: $RG_STORAGE ($REGION_STORAGE)" -ForegroundColor Cyan
az group create --name $RG_STORAGE --location $REGION_STORAGE --subscription $SUBSCRIPTION --output table

Write-Host "`n[4/7] Tao RG rieng cho Key Vault: $RG_KV ($REGION_KV)" -ForegroundColor Cyan
az group create --name $RG_KV --location $REGION_KV --subscription $SUBSCRIPTION --output table

Write-Host "`n[5/7] Tao Storage Account: $STORAGE" -ForegroundColor Cyan
az storage account create `
    --name $STORAGE `
    --resource-group $RG_STORAGE `
    --location $REGION_STORAGE `
    --sku Standard_LRS `
    --kind StorageV2 `
    --subscription $SUBSCRIPTION `
    --output table

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Khong tao duoc Storage Account!" -ForegroundColor Red
    exit 1
}

Write-Host "`n[6/7] Lay storage key va tao container: $CONTAINER" -ForegroundColor Cyan
$STORAGE_KEY = $(az storage account keys list `
    --account-name $STORAGE `
    --resource-group $RG_STORAGE `
    --subscription $SUBSCRIPTION `
    --query "[0].value" -o tsv)

az storage container create `
    --name $CONTAINER `
    --account-name $STORAGE `
    --account-key $STORAGE_KEY `
    --output table

Write-Host "`n[7/7] Tao Key Vault: $KV" -ForegroundColor Cyan
az keyvault create `
    --name $KV `
    --resource-group $RG_KV `
    --location $REGION_KV `
    --subscription $SUBSCRIPTION `
    --output table

Write-Host "`n============================================" -ForegroundColor Green
Write-Host " Setup xong! Copy noi dung sau vao backend/.env:" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "AZURE_STORAGE_ACCOUNT_NAME=$STORAGE"
Write-Host "AZURE_STORAGE_CONTAINER_NAME=$CONTAINER"
Write-Host "AZURE_KEY_VAULT_URL=https://$KV.vault.azure.net/"
Write-Host ""
Write-Host "Kiem tra tai nguyen vua tao:" -ForegroundColor Yellow
Write-Host "Storage container: $(az storage container show --name $CONTAINER --account-name $STORAGE --account-key $STORAGE_KEY --query "name" -o tsv)"
Write-Host "Key Vault URI    : $(az keyvault show --name $KV --subscription $SUBSCRIPTION --query "properties.vaultUri" -o tsv)"
