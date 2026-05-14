<#
.SYNOPSIS
    Tạo tài nguyên Azure tối thiểu cho dự án secure-file-sharing (Storage Account + container + Key Vault).

.DESCRIPTION
    Mỗi thành viên nhóm truyền subscription/tenant của mình và một ResourceSuffix duy nhất (toàn cục Azure)
    để tránh trùng tên storage account / Key Vault. Tên resource group cũng gắn suffix để tách biệt.

    Yêu cầu: Azure CLI đã cài (`az`) và quyền tạo resource trên subscription.

.PARAMETER SubscriptionId
    GUID subscription Azure (Azure Portal > Subscriptions).

.PARAMETER TenantId
    GUID tenant Microsoft Entra ID (dùng với `az login --tenant`).

.PARAMETER ResourceSuffix
    Chuỗi 4-8 ký tự, chỉ a-z và 0-9, viết thường. Dùng ghép tên storage & Key Vault (phải unique toàn Azure).

.PARAMETER RegionStorage
    Region cho resource group + Storage Account (mặc định: southeastasia).

.PARAMETER RegionKeyVault
    Region cho Key Vault (mặc định: eastus - thường dùng khi cần tách region).

.PARAMETER SkipAzLogin
    Bỏ bước `az login` (dùng khi đã đăng nhập sẵn, ví dụ pipeline).

.EXAMPLE
    .\setup-azure.ps1 `
      -SubscriptionId 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' `
      -TenantId '11111111-2222-3333-4444-555555555555' `
      -ResourceSuffix 'nam12abc'

.EXAMPLE
    .\setup-azure.ps1 -SubscriptionId ... -TenantId ... -ResourceSuffix 'dev01' -SkipAzLogin

.NOTES
    Sau khi chạy xong, copy các dòng AZURE_* in ra vào backend/.env (tham chiếu backend/.env.example).
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, HelpMessage = "Azure subscription ID (GUID)")]
    [ValidatePattern('^(?i)[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$')]
    [string]$SubscriptionId,

    [Parameter(Mandatory = $true, HelpMessage = "Microsoft Entra tenant ID (GUID)")]
    [ValidatePattern('^(?i)[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$')]
    [string]$TenantId,

    [Parameter(Mandatory = $true, HelpMessage = "Suffix duy nhat 4-8 ky tu (a-z, A-Z, 0-9); se chuyen thanh chu thuong cho ten Azure")]
    [ValidatePattern('^(?i)[a-z0-9]{4,8}$')]
    [string]$ResourceSuffix,

    [Parameter()]
    [string]$RegionStorage = "southeastasia",

    [Parameter()]
    [string]$RegionKeyVault = "eastus",

    [Parameter()]
    [switch]$SkipAzLogin
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Chuẩn hóa GUID lowercase (Azure CLI chấp nhận cả hai; nhất quán khi so sánh)
$SubscriptionId = $SubscriptionId.ToLowerInvariant()
$TenantId = $TenantId.ToLowerInvariant()
$ResourceSuffix = $ResourceSuffix.ToLowerInvariant()

$storageAccountName = "sfs$ResourceSuffix"
$keyVaultName = "kv-sfs-$ResourceSuffix"
$containerName = "secure-files"
$rgStorage = "rg-sfs-$ResourceSuffix-storage"
$rgKv = "rg-sfs-$ResourceSuffix-kv"

# Storage account: 3-24 ký tự, chỉ chữ thường và số
if ($storageAccountName.Length -lt 3 -or $storageAccountName.Length -gt 24) {
    Write-Error "Tên storage '$storageAccountName' phải dài 3-24 ký tự. Rút ngắn ResourceSuffix."
    exit 1
}

# Key Vault: 3-24 ký tự, chữ số và gạch ngang, bắt đầu bằng chữ cái
if ($keyVaultName.Length -lt 3 -or $keyVaultName.Length -gt 24) {
    Write-Error "Tên Key Vault '$keyVaultName' phải dài 3-24 ký tự. Rút ngắn ResourceSuffix."
    exit 1
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Host "Lỗi: Không tìm thấy lệnh az (Azure CLI). Cài đặt: https://learn.microsoft.com/cli/azure/install-azure-cli" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  Subscription : $SubscriptionId" -ForegroundColor DarkGray
Write-Host "  Tenant       : $TenantId" -ForegroundColor DarkGray
Write-Host "  Suffix       : $ResourceSuffix" -ForegroundColor DarkGray
Write-Host "  Storage acct : $storageAccountName" -ForegroundColor DarkGray
Write-Host "  Key Vault    : $keyVaultName" -ForegroundColor DarkGray
Write-Host "  RG storage   : $rgStorage ($RegionStorage)" -ForegroundColor DarkGray
Write-Host "  RG Key Vault : $rgKv ($RegionKeyVault)" -ForegroundColor DarkGray
Write-Host ""

if (-not $SkipAzLogin) {
    Write-Host "[1/7] Đăng nhập Azure (tenant)..." -ForegroundColor Cyan
    az login --tenant $TenantId
}
else {
    Write-Host "[1/7] Bỏ qua az login (-SkipAzLogin)" -ForegroundColor DarkYellow
}

Write-Host "[2/7] Chọn subscription..." -ForegroundColor Cyan
az account set --subscription $SubscriptionId --tenant $TenantId
az account show --query "{Subscription:name, ID:id, Tenant:tenantId}" -o table

$activeSub = az account show --query "id" -o tsv
if ($activeSub -ne $SubscriptionId) {
    Write-Host "Lỗi: Subscription đang active không khớp." -ForegroundColor Red
    Write-Host "  Đang dùng: $activeSub" -ForegroundColor Red
    Write-Host "  Mong đợi: $SubscriptionId" -ForegroundColor Red
    exit 1
}

Write-Host "[3/7] Tạo resource group storage: $rgStorage" -ForegroundColor Cyan
az group create --name $rgStorage --location $RegionStorage --subscription $SubscriptionId --output table

Write-Host "[4/7] Tạo resource group Key Vault: $rgKv" -ForegroundColor Cyan
az group create --name $rgKv --location $RegionKeyVault --subscription $SubscriptionId --output table

Write-Host "[5/7] Tạo Storage Account: $storageAccountName" -ForegroundColor Cyan
az storage account create `
    --name $storageAccountName `
    --resource-group $rgStorage `
    --location $RegionStorage `
    --sku Standard_LRS `
    --kind StorageV2 `
    --subscription $SubscriptionId `
    --output table

if ($LASTEXITCODE -ne 0) {
    Write-Host "Lỗi: Không tạo được Storage Account (tên có thể đã bị người khác dùng - đổi ResourceSuffix)." -ForegroundColor Red
    exit 1
}

Write-Host "[6/7] Tạo container blob: $containerName" -ForegroundColor Cyan
$storageKey = az storage account keys list `
    --account-name $storageAccountName `
    --resource-group $rgStorage `
    --subscription $SubscriptionId `
    --query "[0].value" -o tsv

az storage container create `
    --name $containerName `
    --account-name $storageAccountName `
    --account-key $storageKey `
    --output table

Write-Host "[7/7] Tạo Key Vault: $keyVaultName" -ForegroundColor Cyan
az keyvault create `
    --name $keyVaultName `
    --resource-group $rgKv `
    --location $RegionKeyVault `
    --subscription $SubscriptionId `
    --output table

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Hoàn tất. Thêm vào backend/.env (local):" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "AZURE_STORAGE_ACCOUNT_NAME=$storageAccountName"
Write-Host "AZURE_STORAGE_CONTAINER_NAME=$containerName"
Write-Host "AZURE_KEY_VAULT_URL=https://$keyVaultName.vault.azure.net/"
Write-Host ""
Write-Host "Kiểm tra nhanh:" -ForegroundColor Yellow
Write-Host "  Container: $(az storage container show --name $containerName --account-name $storageAccountName --account-key $storageKey --query "name" -o tsv)"
Write-Host "  Key Vault: $(az keyvault show --name $keyVaultName --subscription $SubscriptionId --query "properties.vaultUri" -o tsv)"
Write-Host ""
Write-Host "Lưu ý nhóm: không commit file backend/.env; mỗi người một ResourceSuffix hoặc subscription riêng." -ForegroundColor DarkGray
