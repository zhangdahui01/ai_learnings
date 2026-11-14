# 静堂 Quiet Hall

A shared meditation hall. Tap Enter at the temple gate and you become a little monk (a random ID is drawn for every visit), sit on a cushion and let the time count. Everyone in the hall sees everyone else. There is no chat; the only interaction is a bow.

It is an original app in the "online temple" genre, built as the sample app under test for [`clientx-autopilot`](../clientx-autopilot/README.md): one React Native codebase for Android, iOS and the web, with a `testID` on every element a test needs.

```text
quiet-hall/
├── server/   Hall server, Node 20+, no dependencies (join, sit, stand, bow, leave; state in data/hall.json)
└── app/      Expo (React Native + TypeScript): gate screen, hall screen, monks drawn in SVG
```

## Rules of the hall

- Guests: "入寺" draws a random ID. The dharma name, gender and look are derived from it; you stay that monk until you leave. A guest is forgotten six hours after leaving.
- Registered IDs: "用我的 ID 入寺" registers an ID you choose (3 to 16 letters or digits). A registered monk keeps merit, counts and the merit record. The hall shows a return code once: on the same device the ID alone lets you back in; on another device you need the ID and the code, and the old device is signed out. Five wrong codes pause that ID for five minutes. Only hashes of tokens and codes are stored; a lost code cannot be recovered.
- Merit: wooden fish +1, prayer bead +1, prostration +3, trial held +10, trial lost -20 (never below zero).
- Merit record: every change is kept with its time, reason, amount and the total afterwards (latest 100, newest first). "功德记录" in the hall shows it.
- Sitting time counts while you sit and is kept when you stand or leave. A monk who goes silent for 90 seconds leaves the hall and frees the cushion.
- The temple: modelled on a great Buddha hall of the Nara period in the manner of Tōdai-ji's Daibutsuden. Outside: two stacked roofs of grey tile, golden horns at the ends of the ridge, a cusped gable over the door, white plaster between dark timbers, an eight-sided bronze lantern, lawns, a cloister and deer. Inside: a seated bronze Buddha with the right hand raised before a gilded halo set with small Buddhas, two gilded attendants, great timber pillars bound with iron, slatted windows, a coffered ceiling and a stone floor. It is an original low-polygon model, not a survey of the real building.
- Faces: every monk and every celestial maiden has their own drawn face (eyes, brows, nose, mouth, age, and how well the features go together), head shape, build and height, all derived from their ID. They are illustrations, not photographs of real people. Native builds keep the simple face.
- Sound: chanting is two openly licensed recordings from Wikimedia Commons, monks at Lingyin Temple (CC BY-SA 3.0) and a Mandarin Heart Sutra (CC0); credits are in `app/public/audio/CREDITS.md` and on the gate screen. The wooden fish and bell strokes are synthesized. The web build has sound; native builds are silent for now.
- Wooden fish: it sits beside your cushion. Tap it (or the button) and the mallet strikes, it sounds, and you gain one merit. Knocks are sent in batches (at most 60 per batch) and are delivered even when the page is closing.
- Walking: stand up, then use the thumb stick or tap the floor; others see you move. You do not pass through pillars or other monks.
- Changing cushion: sit down anywhere and you take the nearest free cushion; your wooden fish moves with you.
- Trials of composure: while you sit, a stray dog or seven celestial maidens come to distract you, at random or when you call one with "唤野狗" / "唤仙女". Composure drains with time; gathering your mind, knocking the wooden fish, turning beads and prostrating restore it. Sit through it for +10 merit; let composure reach zero and you lose 20 merit and are shown out of the temple. Random trials can be switched off.
- Prostration: your monk folds forward to the floor and rises; the count is kept, and every 108th is announced.
- Prayer beads: a loop of beads you turn one at a time; 108 make a round.
- No 3D, no problem: where WebGL is unavailable (many office computers and in-app browsers) the gate and the hall fall back to flat drawings instead of a blank page; everything except walking still works.
- The hall grows: there are always spare cushions past the last occupied one.
- `--residents N` seats N resident monks so the hall is never empty. They are marked as residents in the API.

## Who visited and what they did

Every entry, registration, login, sit, practice batch, trial, bow and leave is logged with the monk's ID and dharma name, whether the ID is registered, a browser label (for example `iPhone · WeChat`), and the country, region and city of the request. Polling and walking are not logged. IP addresses are not stored.

- Local server: `data/events.jsonl` (one JSON object per line), or the file named by `HALL_EVENTS_FILE`.
- Deployed: the Supabase table `quiet_hall_events`. In the Supabase SQL editor:

```sql
select * from quiet_hall_daily;      -- per day: visits, distinct visitors, registrations, each practice, trials
select * from quiet_hall_visitors;   -- per ID: first and last seen, visits, what they did, where from
select * from quiet_hall_events order by at desc limit 200;   -- the raw log
```

The table is not readable with the public key; only the project owner sees it.

### The dashboard at `/admin`

`/admin` shows the same log as a dashboard: totals, visits and visitors per day, how often each feature was used, where visitors came from and with what, one row per visitor, and the raw log with filters.

- The first person to open `/admin` sets the one admin account (3 to 20 lowercase letters, digits or underscores; a password of at least 8 characters). After that the page only offers a login. Five wrong passwords pause the account for five minutes; a session lasts seven days.
- Deployed, the account and every check live in the database (`sql/admin.sql`, run once in the Supabase SQL editor), because the key the site calls the database with is public. Only hashes of the password and of session tokens are stored.
- To change the password or the admin: `delete from quiet_hall_admin_session; delete from quiet_hall_admin;` in the SQL editor, then open `/admin` and set a new one.
- Locally the account is kept in `data/admin.json` and `node server/static.mjs` passes `/api/*` on to the hall server, so `http://localhost:8790/admin` works the same way.

## Run it

```bash
# 1. the hall (prints the address phones on the same Wi-Fi should use)
node server/server.mjs --residents 24

# 2. the app
cd app && npm install
npx expo start            # scan the QR code with Expo Go on your phone, or press i / a / w
```

- **Phone (quickest):** install *Expo Go*, connect the phone to the same Wi-Fi as the computer, scan the QR code. The app finds the hall on the computer that runs `expo start`. If it cannot connect, open "服务器地址" at the gate and type the address the server printed.
- **Android emulator / iOS Simulator, one command:** from anywhere in the repository, `bash projects/clientx-autopilot/scripts/quiet_hall_local.sh android` (or `ios`). It boots the device, starts the hall server and Appium if they are not running, builds a release app, installs it and runs the BDD app cases. `--build-only` stops after the install.
- **By hand:** `npx expo run:android` / `npx expo run:ios` builds and installs a debug app (`dev.clientx.quiethall`) and keeps the Metro bundler running in that terminal. The emulator reaches the hall at `http://10.0.2.2:8787`, the simulator at `http://localhost:8787`; both are the defaults.
- **Browser:** `npx expo export -p web`, then `node ../server/static.mjs dist 8790` and open `http://localhost:8790`.

## Tests

```bash
node --test server/hall.test.mjs lib/*.test.mjs admin/report.test.mjs   # hall rules, API, visit log, admin and dashboard figures
cd app && npx tsc --noEmit                                   # types

cd ../../clientx-autopilot
(cd automation/web && npm run hall:build && npm run test:hall)   # BDD web cases against the web build
python -m ci.gate run --gate cd --service quiet-hall             # the same cases through the release gate

# on a Mac: build, install and run the app cases in one go
bash scripts/quiet_hall_local.sh android        # or: ios

# or by hand, with the app installed on an emulator or simulator and the hall server running:
export ANDROID_APP_PACKAGE=dev.clientx.quiethall ANDROID_APP_ACTIVITY=.MainActivity
python -m pytest automation/app/quiet_hall --device-profile android-emulator
export IOS_BUNDLE_ID=dev.clientx.quiethall DEVICE_UDID=<booted simulator udid>
python -m pytest automation/app/quiet_hall --device-profile ios-simulator
```

## What has and has not been run

- Run: the server and handler tests, the type check, the web export, and the seven BDD web cases in mobile Chromium.
- Not run: the native Android and iOS builds, Expo Go on a phone, and the Appium scenarios in `clientx-autopilot/automation/app/quiet_hall`. They were written against the React Native `testID` contract and need a Mac to build and run.
- The hall server is for a trusted network: plain HTTP, no rate limiting beyond the return-code lock. Put it behind HTTPS and add limits before exposing it to the internet.
