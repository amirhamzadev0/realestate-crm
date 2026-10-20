# Starts the local MySQL server for development (data lives in .private/mysql-data). Safe to run twice.
$bin = 'C:\Program Files\MySQL\MySQL Server 8.4\bin'
$data = Join-Path $PSScriptRoot '..\.private\mysql-data' | Resolve-Path | Select-Object -ExpandProperty Path

if (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue) {
  Write-Host 'MySQL is already running on 127.0.0.1:3306'
  exit 0
}

Start-Process -FilePath "$bin\mysqld.exe" -WindowStyle Hidden -ArgumentList @(
  '--no-defaults', "--datadir=$data", '--port=3306', '--bind-address=127.0.0.1',
  '--character-set-server=utf8mb4', '--collation-server=utf8mb4_unicode_ci', '--mysqlx=OFF'
)

for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  if (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue) {
    Write-Host 'MySQL started on 127.0.0.1:3306'
    exit 0
  }
}
Write-Error 'MySQL did not start. See the .err file in .private/mysql-data'
exit 1
