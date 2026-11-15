# 云灯岛 Yundeng Island

A small 3D healing adventure for the browser: you wake on an island above a sea of clouds with Bingo, a white Samoyed, and a nine-square "wish bingo card". Each square is a small deed (light the lanterns, wake the moss grandfather, pet Bingo ...). One completed line wakes the old tree on the hill; a full card calls the cloud whale.

It is the second sample app under test for [`clientx-autopilot`](../clientx-autopilot/README.md), next to [`quiet-hall`](../quiet-hall/README.md): a WebGL game with touch controls, accounts and cloud saves.

```text
yundeng-island/
└── app/index.html   The whole game: three.js r128 from a CDN, no build step
```

## How it works

- Rendering: three.js, toon shading, instanced grass with wind, a shadow map, bloom and a colour grade. All models are built in code from primitives.
- Controls: on-screen joystick or tap the ground to walk, drag to turn; WASD and mouse on a desktop.
- Guidance: the next deed is always written at the top left with a direction arrow and the distance, a golden beam stands on its location, Bingo runs ahead to it, and a minimap (tap to enlarge) marks every location. Tapping an open square on the bingo card makes it the next deed.
- Saves: without an account, progress is kept in `localStorage`. With an account, every completed deed is saved to the cloud, the player can save by hand, and any earlier save can be restored.
- Backend: a Supabase project. The page calls seven Postgres functions through the REST API (`game_register`, `game_login`, `game_logout`, `game_save`, `game_list_saves`, `game_load_save`, `game_delete_save`). Tables have row level security on and no policies, so the browser can reach data only through those functions. Passwords are stored as bcrypt hashes, session tokens as SHA-256 hashes. The key in `index.html` is the project's public browser key, not a secret.
- The schema is in the Supabase project's migration `game_accounts_and_saves`; it is not yet copied into this folder.
- Test mode: open the page with `?test=1`. The rules are unchanged; it draws less grass and skips shadows and bloom so a machine without a GPU keeps a usable frame rate. `window.__game` exposes the game state for tests.

## Deployment

Live at https://yundeng-island.vercel.app. The Vercel project has a one-file build step that downloads `app/index.html` from this repository at a pinned commit and serves it as a static page. Connecting the Vercel project to the repository directly (root directory `projects/yundeng-island/app`) would remove that step.

## Tests

The BDD cases live in `../clientx-autopilot/automation/web`: `specs/island-*.md`, `tests-island/`, `pages/island.ts`.

```bash
cd ../clientx-autopilot/automation/web
npm install
CHROME_PATH=/path/to/chrome npm run test:island
```

The cases replace the Supabase functions with an in-memory stand-in (`FakeBackend` in `pages/island.ts`) that follows the same contract, and serve three.js from `node_modules` so the run needs no network.
