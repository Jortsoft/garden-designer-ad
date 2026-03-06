# Tuning Guide

This guide lists the main constants to tweak gameplay feel and UI placement without changing logic.

## Global Config
File:
- `src/Managers/GameConfig.ts`

Common values:
- `debugMode`
- `Fps`
- `downloadGameUrl`
- camera defaults and movement bounds
- shadow and post-processing defaults

## Camera Moves
File:
- `src/Managers/WorldManager.ts`

Constants:
- `PLANTING_CAMERA_MOVE`
- `MARKET_TUTORIAL_CAMERA_MOVE`

Reusable camera movement API:
- `CameraController.MoveCamera(...)`
- `src/Systems/CameraController.ts`

## Placeholder and Market Click Areas
Primary/secondary placeholder model + hit box:
- `src/Entities/PlaceHolder.ts`
  - `PLACEHOLDER_POSITION`
  - `PLACEHOLDER_SCALE`
  - `HIT_AREA_PADDING`

Market click area:
- `src/Entities/Market.ts`
  - `MARKET_INTERACTION_POSITION`
  - `MARKET_HIT_SIZE`

## Tutorial Finger
Step-specific world offsets:
- `src/Managers/TutorialGuideManager.ts`
  - `PRIMARY_PLACEHOLDER_FINGER_OFFSET`
  - `MARKET_CLICK_AREA_FINGER_OFFSET`
  - `ANIMAL_PLACEHOLDER_FINGER_OFFSET`
  - `SKIP_DAY_FINGER_EXTRA_OFFSET`

Finger visual and scale controls:
- `src/UI/TutorialFingerUI.ts`
  - `FINGER_SCREEN_RATIO` (main scale by screen size)
  - `FINGER_MIN_SIZE`
  - `FINGER_MAX_SIZE`
  - `FINGER_ALPHA`
  - float/tap animation constants

## Skip Day and Sickle Buttons (World-Space UI)
World offset anchor:
- `src/Managers/WorldManager.ts`
  - `SKIP_BUTTON_WORLD_OFFSET`

Screen size/pulse/float tuning:
- `src/UI/SkipDayUI.ts`
- `src/UI/SickleUI.ts`

Key constants:
- `*_BUTTON_PIXEL_RATIO`
- `*_BUTTON_MIN_PIXELS`
- `*_BUTTON_MAX_PIXELS`
- `*_BUTTON_OPACITY`

## Resource HUD and Money HUD
File:
- `src/UI/FarmResourcesUI.ts`

Layout constants:
- `HUD_MARGIN_LEFT`
- `HUD_MARGIN_TOP`
- `ITEM_GAP` (resource-to-resource gap)
- `COUNT_ICON_GAP_PX` (icon-to-count gap)
- `FRAME_PADDING_X`, `FRAME_PADDING_Y`
- `MONEY_*` constants for right-top money block

Animation constants:
- `FLY_ICON_*` for crop reward icons
- `MONEY_FLY_*` for money reward icons

## Modal UI Responsiveness
Files:
- `src/UI/PlaceVegetablesUI.ts`
- `src/UI/MarketModalUI.ts`
- `src/UI/AnimalShopUI.ts`
- `src/UI/EndCardUI.ts`

Useful constants:
- `MOBILE_TEXT_BREAKPOINT`
- `MOBILE_TEXT_MIN_SCALE`
- modal width/height min/max values

Shared show/hide animation:
- `src/Animations/AnimationUI.ts`
  - `SHARED_UI_VISIBILITY_ANIMATION`

## Plant and Harvest Feel
File:
- `src/Entities/Vegetable.ts`

Preview shader pulse:
- `PREVIEW_OPACITY_MIN`
- `PREVIEW_OPACITY_MAX`
- `PREVIEW_OPACITY_PULSE_SPEED`

Grow animation:
- `GROW_ANIMATION_DURATION`
- `GROW_ANIMATION_STAGGER`
- `GROW_BOUNCE_HEIGHT`

Harvest animation:
- `HARVEST_ANIMATION_DURATION`
- `HARVEST_PULL_HEIGHT`
- `HARVEST_END_SCALE`

Wind sway:
- `WIND_SWAY_*` constants

## Day/Night Skip Lighting
File:
- `src/Managers/WorldManager.ts`

Core constants:
- `SKIP_DAY_DURATION_SECONDS`
- `SKIP_DAY_TIME_SCALE`
- `SKIP_DAY_NIGHT_SUN_Y`
- orbit/intensity/exposure/vignette blend constants

Base light control ranges:
- `src/Managers/LightingManager.ts`
- `src/Managers/PostProcessingManager.ts`

Post-processing shader source:
- `src/Shaders/PostProcessing.shader.ts`

## Animals
Animal home:
- `src/Entities/AnimalHome.ts`
  - default position/scale/rotation
  - spawn animation constants

Animals:
- `src/Entities/Animal.ts`
  - `DEFAULT_SCALE`
  - spawn animation constants
  - model mapping in `src/Models/Animal.model.ts`

## Audio
Centralized audio map and pooling:
- `src/Managers/AudioManager.ts`

Clip routes:
- click
- harvest
- chicken
- cow

