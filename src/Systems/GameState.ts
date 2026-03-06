import type { PlantId } from '../Models/PlaceVegetable.model';

export class GameState {
    selectedPlantId: PlantId | null = null;
    isPlantSelectionActive = false;
    isSkipDayCycleActive = false;
    isHarvestAnimationActive = false;
    isMarketModalOpen = false;
    isAnimalShopOpen = false;
    isAnimalHomePlaced = false;
    skipDayPlantId: PlantId | null = null;
    harvestPlantId: PlantId | null = null;
    money = 0;

    isInputFlowBlocked() {
        return (
            this.isSkipDayCycleActive ||
            this.isHarvestAnimationActive ||
            this.isMarketModalOpen ||
            this.isAnimalShopOpen
        );
    }

    clearHarvestAndSkipTargets() {
        this.skipDayPlantId = null;
        this.harvestPlantId = null;
    }

    canActivatePlaceholder() {
        return !this.isInputFlowBlocked() && this.harvestPlantId === null;
    }

    canActivateAnimalShopPlaceholder() {
        return (
            !this.isInputFlowBlocked() &&
            !this.isAnimalHomePlaced &&
            this.money > 0
        );
    }
}
