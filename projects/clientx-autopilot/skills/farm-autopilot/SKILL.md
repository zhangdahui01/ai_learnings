---
name: farm-autopilot
description: Monitor, diagnose and heal the device farm (Android emulators on Mac Studios, iOS Simulators, real iPhones on hubs, Appium, WDA, mitmproxy) through typed actions in the pull queue. Use for device or Mac faults, stuck queues, farm health questions and recovery actions.
---
# Farm Autopilot

1. One pass: `python -m harness emit fixtures/events/05_device_status.json`, or in code `device_farm.pipeline.run(snapshot, history, policy)`.
2. Monitor rules are topology aware (region → Mac → hub → device): a parent fault silences its children. Several iPhones dropping on one hub is a hub fault; the phones are quarantined, not restarted.
3. The Farm Doctor reads history: a recovery that already ran three times is escalated, not repeated. What rules cannot explain becomes a `farm-doctor` agent task (`agents/farm-doctor.md`).
4. The policy gate (`policies/farm_policy.json`): allowlist, cooldown, budget per Mac per hour, approval for `reset_mac`. Default is dry-run.
5. Approved actions go to the pull queue. On the Mac: `python -m device_farm.runner --mac <id> --queue var/farm_queue.json [--execute]`; commands per device kind are in `policies/farm_commands.json`.
6. Dashboard: see the `farm-dashboard` skill.

The harness never calls into the farm. The Mac pulls.
