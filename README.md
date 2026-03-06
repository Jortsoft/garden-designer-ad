# Garden Designer Playable Ad

Mobile-first playable ad built with Three.js for 3D world rendering and Pixi.js for all UI overlays.

## Features
- Plant flow with preview, plant confirm, grow levels, and harvest.
- Fast day/night skip cycle with accelerated simulation.
- Resource and money HUD with flying reward icon animations.
- Market selling modal and animal shop flow (chicken/cow).
- Tutorial finger guidance across core onboarding steps.
- End card with game icon and download CTA.
- Debug panel (when enabled) with FPS, renderer stats, and live lighting/post FX sliders.

## Tech Stack
- TypeScript
- Vite
- Three.js
- Pixi.js

## Quick Start
```bash
npm install
npm run dev
```

Build and preview:
```bash
npm run build
npm run preview
```

## Project Structure
```text
src/
  Animations/    Shared UI animation controllers
  Effects/       Visual simulation systems (wind waves)
  Entities/      World objects and GLTF loaders
  Managers/      Gameplay orchestration and runtime managers
  Models/        Shared enums, interfaces, and typed contracts
  Scene/         Scene bootstrap and frame loop integration
  Shaders/       Custom shader modules
  Systems/       Cross-cutting runtime systems (state, camera, pixi, loader)
  UI/            Pixi-based UI components
```

## Core Loop
1. Click/touch first placeholder.
2. Select plant (default: corn), then press `Plant`.
3. Press `Skip Day` to simulate growth (L1 -> L2 -> L3).
4. Press sickle to harvest and gain resources.
5. Open market area, sell crops for money.
6. Buy animal home + animal, then show end card.

## Configuration
Global gameplay/camera/light/post settings are in:
- `src/Managers/GameConfig.ts`

## Documentation
- `docs/README.md`
- `docs/ARCHITECTURE.md`
- `docs/GAMEPLAY_FLOW.md`
- `docs/TUNING_GUIDE.md`

