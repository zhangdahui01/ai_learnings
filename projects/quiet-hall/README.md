# 静堂 Quiet Hall

A shared meditation hall. Tap Enter at the temple gate and you become a little monk (a random ID is drawn for every visit), sit on a cushion and let the time count. Everyone in the hall sees everyone else. There is no chat; the only interaction is a bow.

It is an original app in the "online temple" genre, built as the sample app under test for [`clientx-autopilot`](../clientx-autopilot/README.md): one React Native codebase for Android, iOS and the web, with a `testID` on every element a test needs.

```text
quiet-hall/
├── server/   Hall server, Node 20+, no dependencies (join, sit, stand, bow, leave; state in data/hall.json)
└── app/      Expo (React Native + TypeScript): gate screen, hall screen, monks drawn in SVG
```

## Rules of the hall

- Every visit draws a random ID. The dharma name, gender and look are derived from it; you stay that monk until you leave the temple.
- An ID belongs to whoever used it first (a token is kept in the app). Nobody else can enter with it.
- Sitting time counts while you sit and is kept when you stand or leave. A monk who goes silent for 90 seconds leaves the hall and frees the cushion.
- Sound: chanting is two openly licensed recordings from Wikimedia Commons, monks at Lingyin Temple (CC BY-SA 3.0) and a Mandarin Heart Sutra (CC0); credits are in `app/public/audio/CREDITS.md` and on the gate screen. The wooden fish and bell strokes are synthesized. The web build has sound; native builds are silent for now.
- Wooden fish: it sits beside your cushion. Tap it (or the button) and the mallet strikes, it sounds, and you gain one merit. Knocks are sent in batches (at most 60 per batch) and are delivered even when the page is closing.
- The hall grows: there are always spare cushions past the last occupied one.
- `--residents N` seats N resident monks so the hall is never empty. They are marked as residents in the API.

## Run it

```bash
# 1. the hall (prints the address phones on the same Wi-Fi should use)
node server/server.mjs --residents 24

# 2. the app
cd app && npm install
npx expo start            # scan the QR code with Expo Go on your phone, or press i / a / w
```

- **Phone (quickest):** install *Expo Go*, connect the phone to the same Wi-Fi as the computer, scan the QR code. The app finds the hall on the computer that runs `expo start`. If it cannot connect, open "服务器地址" at the gate and type the address the server printed.
- **Android emulator / iOS Simulator:** `npx expo run:android` / `npx expo run:ios` builds and installs a native app (`dev.clientx.quiethall`). The emulator reaches the hall at `http://10.0.2.2:8787`, the simulator at `http://localhost:8787`; both are the defaults.
- **Browser:** `npx expo export -p web`, then `node ../server/static.mjs dist 8790` and open `http://localhost:8790`.

## Tests

```bash
node --test server/hall.test.mjs                                        # hall rules
cd app && npx tsc --noEmit                                   # types

cd ../../clientx-autopilot
(cd automation/web && npm run hall:build && npm run test:hall)   # BDD web cases against the web build
python -m ci.gate run --gate cd --service quiet-hall             # the same cases through the release gate

# on a Mac with the app installed on an emulator or simulator and the hall server running:
export ANDROID_APP_PACKAGE=dev.clientx.quiethall ANDROID_APP_ACTIVITY=.MainActivity
python -m pytest automation/app/quiet_hall --device-profile android-emulator
export IOS_BUNDLE_ID=dev.clientx.quiethall DEVICE_UDID=<booted simulator udid>
python -m pytest automation/app/quiet_hall --device-profile ios-simulator
```

## What has and has not been run

- Run: the server tests, the type check, the web export, and the three BDD web cases in mobile Chromium (two people in the hall at once).
- Not run: the native Android and iOS builds, Expo Go on a phone, and the Appium scenarios in `clientx-autopilot/automation/app/quiet_hall`. They were written against the React Native `testID` contract and need a Mac to build and run.
- The hall server is for a trusted network: plain HTTP, no accounts, no rate limiting. Put it behind HTTPS and add limits before exposing it to the internet.
