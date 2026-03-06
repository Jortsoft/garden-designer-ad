# Gameplay Flow

## High-Level Sequence
1. Player activates primary placeholder.
2. Plant selection UI opens (default selected plant is corn).
3. Player confirms with `Plant`.
4. Placeholder hides, selected crop appears at level 1.
5. `Skip Day` appears over land.
6. Skip cycle runs for 3 seconds with day/night progression and accelerated simulation.
7. Crop level advances level 1 -> level 2 -> level 3.
8. `Sickle` appears and player harvests.
9. Harvest animation completes, resources increase by 6 units.
10. Market area can be opened to sell resources for money.
11. After money is available, second placeholder appears for animal shop.
12. Player buys animal home + selected animal.
13. End card is shown after delay.

Main orchestrator:
- `src/Managers/WorldManager.ts`

## Planting and Growth
- Plant IDs:
  - `corn`, `grape`, `strawberry`
  - `src/Models/PlaceVegetable.model.ts`
- Growth levels:
  - 1, 2, 3
  - `src/Models/Vegetable.model.ts`
- Level transitions during skip-day:
  - at 50% progress -> level 2
  - at 100% progress -> level 3

## Skip-Day Simulation
- Duration: 3 seconds.
- Simulation time scale increases while active.
- Sun and post-processing values are animated through a full orbit-like cycle, then restored.
- During skip-day, gameplay input flow is blocked.

Key logic:
- `startSkipDayCycle()`
- `updateSkipDayCycle()`
- `applySkipDayLighting()`
- `completeSkipDayCycle()`
- all in `src/Managers/WorldManager.ts`

## Harvest and Rewards
- Harvest uses vegetable cut/pull animation then hides model.
- Resource gain:
  - +6 units to selected plant type.
  - flying icons animate from world slot positions to resource HUD.
- Harvest SFX plays from shared `AudioManager`.

Key files:
- `src/Entities/Vegetable.ts`
- `src/UI/FarmResourcesUI.ts`
- `src/Managers/AudioManager.ts`

## Market Flow
- Market click area triggers market modal.
- Player adjusts sell counts per resource.
- Sell value: `$5` per unit.
- Money gain animates from sell button source point to money HUD icon.

Key files:
- `src/Entities/Market.ts`
- `src/UI/MarketModalUI.ts`
- `src/Models/Market.model.ts`

## Animal Shop Flow
- Animal shop placeholder appears only when:
  - money > 0
  - animal home not placed yet
- Shop supports:
  - Chicken `$5`
  - Cow `$10`
- On purchase:
  - deduct money
  - spawn animate `AnimalHome` and selected animal
  - play animal-specific SFX
  - schedule end card

Key files:
- `src/UI/AnimalShopUI.ts`
- `src/Entities/AnimalHome.ts`
- `src/Entities/Animal.ts`
- `src/Models/Animal.model.ts`

## Tutorial Steps
Tutorial finger sequence:
1. primary placeholder
2. skip day
3. market click area
4. animal shop placeholder

State machine:
- `src/Managers/TutorialGuideManager.ts`
- `src/Models/Tutorial.model.ts`
- `src/UI/TutorialFingerUI.ts`

## End Card
- Triggered after animal purchase with delay.
- Applies scene blur and shows download CTA overlay.
- CTA redirects to configured URL.

Key files:
- `src/UI/EndCardUI.ts`
- `src/Managers/GameConfig.ts`
- `src/Managers/WorldManager.ts`

