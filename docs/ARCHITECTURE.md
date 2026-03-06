# Architecture

## Runtime Layers
1. Three.js renderer canvas renders 3D world.
2. Loader overlay renders above the world inside Three.js pipeline until loading reveal ends.
3. Pixi.js UI canvas renders overlay UI after loader hides.

`GamePlayScene` hides Pixi UI while loader is active:
- `src/Scene/GamePlayScene.ts`

## Bootstrap and Ownership
- `src/main.ts` creates `GamePlayScene`.
- `GamePlayScene` owns:
  - `THREE.WebGLRenderer`
  - `THREE.Scene`
  - `PixiUI`
  - `WorldManager`
  - `LoaderOverlay`
- `WorldManager` is the gameplay composition root and wires entities, managers, and UI.

## World Composition
`WorldManager` creates and owns:
- 3D entities:
  - `Ground`, `Land`, `Market`, two `PlaceHolder` instances
  - `Vegetable` pool keyed by `PlantId`
  - `AnimalHome`, `Animal`
- managers/systems:
  - `LightingManager`, `PostProcessingManager`, `CameraController`
  - input activation managers (`PlaceHolderActivationManager`, `MarketActivationManager`)
  - `TutorialGuideManager`, `DebugManager`, `WindWaveSystem`
- Pixi UI components:
  - `PlaceVegetablesUI`, `SkipDayUI`, `SickleUI`, `FarmResourcesUI`
  - `MarketModalUI`, `AnimalShopUI`, `EndCardUI`

Main file:
- `src/Managers/WorldManager.ts`

## State Flow
- Shared gameplay flags are centralized in:
  - `src/Systems/GameState.ts`
- `WorldManager` mutates `GameState` and drives all transitions.
- Input blockers are composed from:
  - game-state block flags
  - debug panel hit area
  - UI hit areas

## UI Architecture
- Shared Pixi host/canvas:
  - `src/Systems/PixiUI.ts`
- Every UI component:
  - owns its own Pixi `Container`
  - exposes `initialize/update/render/updateViewport/dispose`
  - blocks world input only when visible/interactive
- Shared show/hide animation controller:
  - `src/Animations/AnimationUI.ts`

## Render and Update Loop
`GamePlayScene.renderFrame()`:
1. Computes capped delta (based on `GameConfig.Fps`).
2. Calls `worldManager.update(delta)`.
3. Updates loader.
4. Toggles Pixi visibility depending on loader state.
5. Calls `worldManager.render()`.
6. Renders loader overlay.

Key file:
- `src/Scene/GamePlayScene.ts`

## Asset Loading Strategy
- World models and UI textures are preloaded by their owning classes.
- Vegetable levels and animal variants are loaded in advance and shown/hidden without reloading.
- Audio clips use pooled `HTMLAudioElement` instances.

Key files:
- `src/Entities/Vegetable.ts`
- `src/Entities/Animal.ts`
- `src/Managers/AudioManager.ts`

## Memory and Cleanup
- All major classes expose `dispose()`.
- `WorldManager.dispose()` tears down:
  - event listeners
  - Three resources/materials/textures
  - Pixi containers
  - overlay and managers
- `PixiUI.dispose()` removes canvas from DOM then destroys Pixi app.

Key files:
- `src/Managers/WorldManager.ts`
- `src/Systems/PixiUI.ts`

