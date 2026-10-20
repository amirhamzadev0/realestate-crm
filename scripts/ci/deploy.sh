#!/usr/bin/env bash
# Deploys dist/runtime to the VPS: backup, migrate, switch the release, health check, roll back on failure.
# Needs: DEPLOY_HOST, DEPLOY_USER, SSH_KEY_FILE, SSH_KNOWN_HOSTS_FILE (CI file variables) and the tarball
# built by the pipeline (dist/runtime.tar.gz). The app env file lives on the server in shared/app.env.
set -euo pipefail

APP="${APP_NAME:-buildflow}"
PORT="${APP_PORT:-3130}"
BASE="/var/www/${APP}"
RELEASE="${CI_COMMIT_SHORT_SHA:-manual}-${CI_JOB_ID:-0}"
ARCHIVE="dist/runtime.tar.gz"

ssh_cmd=(ssh -i "$SSH_KEY_FILE" -o UserKnownHostsFile="$SSH_KNOWN_HOSTS_FILE" -o StrictHostKeyChecking=yes "${DEPLOY_USER}@${DEPLOY_HOST}")

echo "Verifying artifact checksum"
(cd dist && sha256sum -c runtime.tar.gz.sha256)

echo "Uploading release ${RELEASE}"
"${ssh_cmd[@]}" "mkdir -p ${BASE}/releases/${RELEASE} ${BASE}/shared/backups"
"${ssh_cmd[@]}" "tar -xzf - -C ${BASE}/releases/${RELEASE}" < "$ARCHIVE"

echo "Backup, then migrate with the new release's scripts"
"${ssh_cmd[@]}" "set -euo pipefail
  cd ${BASE}/releases/${RELEASE}
  set -a; . ${BASE}/shared/app.env; set +a
  if [ -d ${BASE}/current ]; then (cd ${BASE}/current && node scripts/ci/backup.mjs ${BASE}/shared/backups); fi
  node scripts/ci/migrate.mjs
  node scripts/ci/check-schema.mjs"

echo "Switching to ${RELEASE}"
"${ssh_cmd[@]}" "set -euo pipefail
  cd ${BASE}
  ln -sfn ${BASE}/shared/.private releases/${RELEASE}/.private
  if [ -L current ]; then ln -sfn \$(readlink current) previous; fi
  ln -sfn ${BASE}/releases/${RELEASE} current.next && mv -Tf current.next current
  sudo systemctl restart ${APP}"

echo "Health check"
if ! "${ssh_cmd[@]}" "for i in 1 2 3 4 5 6 7 8 9 10; do curl -fsS http://127.0.0.1:${PORT}/api/health && exit 0; sleep 2; done; exit 1"; then
  echo "Health check failed, rolling back" >&2
  "${ssh_cmd[@]}" "cd ${BASE} && [ -L previous ] && ln -sfn \$(readlink previous) current.next && mv -Tf current.next current && sudo systemctl restart ${APP}"
  exit 1
fi
echo "Deployed ${RELEASE}"
