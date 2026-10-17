#!/usr/bin/env bash
# ONE-TIME server setup. Runs ON THE SERVER with sudo (first-time-setup.sh calls it).
# Safe to re-run. Regular deploys are done by .github/workflows/deploy.yml.

set -euo pipefail

HOST="nfl.brianfreestone.com"
HERE="$(dirname "$(readlink -f "$0")")"
APP=/var/www/nfltracker
CF_CONFIG=/etc/cloudflared/config.yml
TUNNEL=brianfreestone

echo "--- Folders"
mkdir -p "$APP/api" "$APP/client" "$APP/data" /etc/nfltracker
chown -R www-data:www-data "$APP"

echo "--- Edit password"
if [ ! -s /etc/nfltracker/env ]; then
  read -r -s -p "Choose the password for editing scores: " PW < /dev/tty
  echo
  [ -n "$PW" ] || { echo "Password can't be empty"; exit 1; }
  cat > /etc/nfltracker/env <<ENV
ASPNETCORE_URLS=http://127.0.0.1:5105
ASPNETCORE_ENVIRONMENT=Production
ConnectionStrings__Default=Data Source=$APP/data/nfl.db
Admin__Password=$PW
ENV
  chmod 600 /etc/nfltracker/env
else
  echo "(already set, leaving it alone)"
fi

echo "--- Service (enabled now, started by the first deploy)"
cp "$HERE/nfltracker.service" /etc/systemd/system/nfltracker.service
systemctl daemon-reload
systemctl enable nfltracker >/dev/null

echo "--- nginx"
cp "$HERE/$HOST.conf" /etc/nginx/sites-available/nfltracker
ln -sf /etc/nginx/sites-available/nfltracker /etc/nginx/sites-enabled/nfltracker
nginx -t
systemctl reload nginx

echo "--- Cloudflare tunnel route"
if ! grep -q "hostname: $HOST" "$CF_CONFIG"; then
  cp "$CF_CONFIG" "$CF_CONFIG.bak.$(date +%s)"
  sed -i "/^  - service: http_status:404/i\  - hostname: $HOST\n    service: http://localhost:80" "$CF_CONFIG"
  systemctl restart cloudflared
  echo "Added $HOST to $CF_CONFIG"
else
  echo "(already routed)"
fi
if ! sudo -u "${SUDO_USER:-root}" cloudflared tunnel route dns "$TUNNEL" "$HOST"; then
  echo "NOTE: could not create the DNS record automatically."
  echo "      Add it in Cloudflare: CNAME  nfl  ->  65094440-4f17-41f9-b114-dedd49b2f020.cfargotunnel.com (proxied)"
fi

echo "--- Done. Now push to main (or run the Deploy workflow) to put the app on the server."
