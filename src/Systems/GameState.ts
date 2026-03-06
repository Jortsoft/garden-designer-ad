import type { PlantId } from '../Models/PlaceVegetable.model';

export class GameState {
    selectedPlantId: PlantId | null = null;
    isPlantSelectionActive = false;
    isSkipDayCycleActive = false;
    isHarvestAnimationActive = false;
    skipDayPlantId: PlantId | null = null;
    harvestPlantId: PlantId | null = null;

    isInputFlowBlocked() {
        return this.isSkipDayCycleActive || this.isHarvestAnimationActive;
    }

    clearHarvestAndSkipTargets() {
        this.skipDayPlantId = null;
        this.harvestPlantId = null;
    }

    canActivatePlaceholder() {
        return !this.isInputFlowBlocked() && this.harvestPlantId === null;
    }
}
