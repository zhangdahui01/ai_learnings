#!/usr/bin/env bash
# Take a device out of rotation: record it so the device-local agent stops offering it.
#   quarantine_device.sh <device id> [reason]        release with: quarantine_device.sh --release <device id>
source "$(dirname "$0")/_common.sh"
file="$FARM_STATE_DIR/quarantine.txt"; touch "$file"
if [[ "${1:-}" == "--release" ]]; then
  grep -v "^${2:?device id} " "$file" > "$file.tmp" || true; mv "$file.tmp" "$file"; log "released $2 from quarantine"; exit 0
fi
id="${1:?device id}"
grep -q "^$id " "$file" || echo "$id $(date -u +%FT%TZ) ${2:-farm-autopilot}" >> "$file"
log "quarantined $id"
