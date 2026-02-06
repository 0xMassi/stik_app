#!/usr/bin/env bash
set -euo pipefail

DAYS="${1:-5}"
FOLDER="${2:-Inbox}"

if ! [[ "$DAYS" =~ ^[0-9]+$ ]] || [[ "$DAYS" -lt 1 ]]; then
  echo "Usage: ./scripts/seed-streak-fixture.sh [days>=1] [folder]"
  exit 1
fi

STIK_DIR="${HOME}/Documents/Stik/${FOLDER}"
mkdir -p "${STIK_DIR}"

created=0
seed_id="$(date +%s)"

for ((i = 0; i < DAYS; i++)); do
  if date_prefix="$(date -v-"${i}"d +%Y%m%d 2>/dev/null)"; then
    :
  else
    date_prefix="$(date -d "-${i} day" +%Y%m%d)"
  fi

  filename="${date_prefix}-120000-streak-fixture-${seed_id}-${i}.md"
  file_path="${STIK_DIR}/${filename}"

  cat > "${file_path}" <<EOF
Streak fixture note (${i} days ago)

Created by seed-streak-fixture.sh to test capture streak behavior.
EOF

  created=$((created + 1))
done

echo "Created ${created} fixture notes in ${STIK_DIR}"
echo "Open Stik Settings and check the 'Capture Streak' section, or relaunch Stik to refresh tray label."
