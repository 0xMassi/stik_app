#!/usr/bin/env bash
set -euo pipefail

YEARS_BACK="${1:-3}"
FOLDER="${2:-Inbox}"

if ! [[ "$YEARS_BACK" =~ ^[0-9]+$ ]] || [[ "$YEARS_BACK" -lt 1 ]]; then
  echo "Usage: ./scripts/seed-on-this-day-fixture.sh [years_back>=1] [folder]"
  exit 1
fi

STIK_DIR="${HOME}/Documents/Stik/${FOLDER}"
mkdir -p "${STIK_DIR}"

today_md="$(date +%m%d)"
current_year="$(date +%Y)"
seed_id="$(date +%s)"
created=0

for ((i = 1; i <= YEARS_BACK; i++)); do
  year=$((current_year - i))
  filename="${year}${today_md}-090000-on-this-day-fixture-${seed_id}-${i}.md"
  file_path="${STIK_DIR}/${filename}"

  cat > "${file_path}" <<EOF
On This Day fixture (${i} year(s) ago)

This note exists to test On This Day resurfacing in Stik.
EOF

  created=$((created + 1))
done

echo "Created ${created} On This Day fixture notes in ${STIK_DIR}"
echo "Open Settings and use 'On This Day -> Check now' to test immediately."
