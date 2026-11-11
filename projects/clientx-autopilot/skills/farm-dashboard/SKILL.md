---
name: farm-dashboard
description: Generate the Device Farm monitor dashboard as one self-contained HTML file from a farm status snapshot - availability, topology, findings, diagnosis, healing decisions, recovery history. Use when asked for a farm dashboard, farm status page or device health report.
---
# Farm dashboard

```bash
python -m device_farm.dashboard.generate_dashboard \
  --snapshot fixtures/farm_snapshot.json --history fixtures/farm_history.json \
  --policy policies/farm_policy.json --out var/farm-dashboard.html
```

- Input: the status snapshot the automation service already holds (see `fixtures/farm_snapshot.json` for the shape) and the recovery history.
- Output: one HTML file, no server and no external assets; light and dark; region and severity filters.
- Run it on every status push or on a schedule and publish the file from CI.
