param(
  [string]$BaseUrl = "http://localhost:3001/api"
)

Write-Host "=== HEALTH CHECK ==="
$health = Invoke-RestMethod -Uri "$BaseUrl/health" -Method GET
$health | ConvertTo-Json -Depth 10

Write-Host "`n=== SIGNUP ==="
$signupBody = @{
  name = "Test Student"
  email = "test@example.com"
  password = "password123"
  stream = "PLUS2_SCIENCE"
} | ConvertTo-Json

try {
  $signup = Invoke-RestMethod -Uri "$BaseUrl/auth/signup" -Method POST -ContentType "application/json" -Body $signupBody
} catch {
  $signup = $_.ErrorDetails.Message | ConvertFrom-Json
}

$signup | ConvertTo-Json -Depth 10
$token = $signup.token

Write-Host "`n=== LOGIN ==="
$loginBody = @{
  email = "test@example.com"
  password = "password123"
} | ConvertTo-Json

$login = Invoke-RestMethod -Uri "$BaseUrl/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
$login | ConvertTo-Json -Depth 10

if ($token) {
  Write-Host "`n=== GET ME ==="
  $headers = @{ Authorization = "Bearer $token" }
  $me = Invoke-RestMethod -Uri "$BaseUrl/auth/me" -Method GET -Headers $headers
  $me | ConvertTo-Json -Depth 10

  Write-Host "`n=== TASKS STUB ==="
  try {
    $tasks = Invoke-RestMethod -Uri "$BaseUrl/tasks" -Method GET -Headers $headers
    $tasks | ConvertTo-Json -Depth 10
  } catch {
    Write-Host $_.ErrorDetails.Message
  }
}

Write-Host "`nDone."
