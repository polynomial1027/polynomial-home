#!/usr/bin/env bash
set -euo pipefail
umask 077
repo=${POLYNOMIAL_REPOSITORY:-/var/www/polynomial-home}
data=${POLYNOMIAL_DATA_DIR:-/var/lib/polynomial-server}
branch=${1:-codex/ai-framework}
installers=${2:-}
unit=polynomial-home.service
cd "$repo"
git diff --quiet && git diff --cached --quiet || { echo 'Tracked files have local changes; deployment stopped.'; exit 1; }
old_head=$(git rev-parse HEAD)
git fetch origin "$branch"
target=$(git rev-parse FETCH_HEAD)
stage=$(mktemp -d /tmp/polynomial-release-XXXXXX)
cleanup() { rm -rf "$stage"; }
trap cleanup EXIT
git archive "$target" | tar -xf - -C "$stage"
(
  cd "$stage"
  npm ci --ignore-scripts >/tmp/polynomial-release-install.log 2>&1
  npm run check >/tmp/polynomial-release-check.log 2>&1
  npm test >/tmp/polynomial-release-tests.log 2>&1
)
backup_dir=${POLYNOMIAL_DEPLOY_BACKUPS:-"$HOME/polynomial-deploy-backups"}
mkdir -p "$backup_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$HOME/.config/systemd/user"
install -m 600 "$stage/deploy/polynomial-home-user.service" "$HOME/.config/systemd/user/$unit"
systemctl --user daemon-reload
if systemctl --user is-active --quiet "$unit"; then systemctl --user stop "$unit";
else
  pid=$(cat /tmp/polynomial-home.pid)
  running=$(ps -p "$pid" -o args=)
  case "$running" in *'/usr/bin/node --env-file=/etc/polynomial-server.env server.js'*) ;; *) echo 'Unexpected legacy process; deployment stopped.'; exit 1;; esac
  kill "$pid"
  for attempt in {1..20}; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
  kill -0 "$pid" 2>/dev/null && { echo 'Service did not stop'; exit 1; }
fi
rollback() {
  echo 'Deployment failed; restoring previous code.'
  systemctl --user stop "$unit" || true
  # Preserve the latest records when the previous version still uses JSON.
  if [ -f "$data/store.sqlite" ]; then POLYNOMIAL_DATA_DIR="$data" POLYNOMIAL_OFFLINE_IMPORT=1 node scripts/export-legacy-store.js || true; fi
  git switch --detach "$old_head"
  systemctl --user restart "$unit"
  systemctl --user show "$unit" -p MainPID --value > /tmp/polynomial-home.pid
}
trap 'rollback; cleanup' ERR
tar --exclude='./backups' -czf "$backup_dir/data-before-$stamp.tar.gz" -C "$data" .
git merge --ff-only "$target"
mkdir -p "$HOME/.config/systemd/user"
install -m 600 deploy/polynomial-home-user.service "$HOME/.config/systemd/user/$unit"
systemctl --user daemon-reload
if [ -n "$installers" ]; then CLIENT_RECOMMENDED_VERSION=$(node -p "require('./package.json').version") POLYNOMIAL_DATA_DIR="$data" POLYNOMIAL_OFFLINE_IMPORT=1 node scripts/import-client-builds.js "$installers"; fi
POLYNOMIAL_DATA_DIR="$data" node - <<'NODE'
const { load, getDatabase, dataDir } = require('./lib/store');
const { BackupService } = require('./lib/backups');
load();
const service = new BackupService({ dataDir, database: getDatabase() });
service.create({ source: 'deployment' }).then(row => { console.log(`Deployment backup verified: ${row.fileCount} files`); getDatabase().close(); }).catch(error => { console.error(error.message); process.exitCode = 1; });
NODE
systemctl --user enable --now "$unit"
systemctl --user show "$unit" -p MainPID --value > /tmp/polynomial-home.pid
for attempt in {1..20}; do curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1 && break; sleep 1; done
POLYNOMIAL_DATA_DIR="$data" node scripts/release-check.js
trap cleanup EXIT
echo "Deployment complete: $target"
