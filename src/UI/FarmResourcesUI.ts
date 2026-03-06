import * as THREE from 'three';
import {
    Assets,
    Container,
    Graphics,
    Sprite,
    Text,
    Texture,
} from 'pixi.js';
import type {
    FlyingResourceIcon,
    ResourceDefinition,
    ResourceEntry,
    ResourceGainBatch,
} from '../Models/FarmResources.model';
import { PlantId } from '../Models/PlaceVegetable.model';
import { PixiUI } from '../Systems/PixiUI';

const RESOURCE_DEFINITIONS: readonly ResourceDefinition[] = [
    { id: PlantId.corn, iconPath: 'assets/images/corn.png' },
    { id: PlantId.grape, iconPath: 'assets/images/grape.png' },
    { id: PlantId.strawberry, iconPath: 'assets/images/strawberry.png' },
] as const;

const HUD_MARGIN_LEFT = 10;
const HUD_MARGIN_TOP = 10;
const ITEM_GAP = 3;
const ICON_MIN_SIZE = 44;
const ICON_MAX_SIZE = 64;
const ICON_SCREEN_RATIO = 0.09;
const COUNT_OFFSET_Y_RATIO = -0.3;
const COUNT_ICON_GAP_PX = 1;
const FRAME_PADDING_X = 20;
const FRAME_PADDING_Y = 10;
const FLY_ICON_SIZE_RATIO = 0.66;
const FLY_ICON_MIN_SIZE = 26;
const FLY_ICON_MAX_SIZE = 42;
const FLY_ICON_DURATION_MIN = 0.48;
const FLY_ICON_DURATION_MAX = 0.72;
const FLY_ICON_STAGGER = 0.06;
const FLY_ICON_DELAY_JITTER = 0.04;
const FLY_ICON_START_JITTER_X = 16;
const FLY_ICON_START_JITTER_Y = 10;
const FLY_ICON_CONTROL_JITTER_X = 34;
const FLY_ICON_ARC_HEIGHT_MIN = 74;
const FLY_ICON_ARC_HEIGHT_EXTRA = 38;

export class FarmResourcesUI {
    private readonly inputElement: HTMLElement;
    private readonly pixiUI: PixiUI;
    private readonly root = new Container();
    private readonly frame = new Graphics();
    private readonly entries: ResourceEntry[] = [];
    private readonly flyingIcons: FlyingResourceIcon[] = [];
    private readonly projectionVector = new THREE.Vector3();
    private viewportWidth = 1;
    private viewportHeight = 1;
    private currentIconSize = ICON_MIN_SIZE;
    private isVisible = true;
    private isInitialized = false;
    private isDisposed = false;
    private loadPromise: Promise<void> | null = null;

    constructor(inputElement: HTMLElement, pixiUI: PixiUI) {
        this.inputElement = inputElement;
        this.pixiUI = pixiUI;
        this.root.visible = true;
        this.root.zIndex = 20;
        this.root.sortableChildren = true;
        this.frame.zIndex = 0;
        this.root.addChild(this.frame);
        this.createEntries();
    }

    initialize() {
        if (this.isDisposed) {
            return Promise.resolve();
        }

        if (this.isInitialized) {
            return this.loadPromise ?? Promise.resolve();
        }

        this.isInitialized = true;
        this.pixiUI.root.addChild(this.root);
        this.updateViewport(
            this.inputElement.clientWidth || window.innerWidth,
            this.inputElement.clientHeight || window.innerHeight,
        );
        this.setVisible(this.isVisible);
        this.loadPromise = this.loadIconTextures();

        return this.loadPromise;
    }

    update(deltaSeconds: number) {
        this.updateFlyingIcons(deltaSeconds);
    }

    render() {
        // Rendered by shared PixiUI.
    }

    updateViewport(width: number, height: number) {
        this.viewportWidth = Math.max(width, 1);
        this.viewportHeight = Math.max(height, 1);
        this.layoutEntries();
    }

    setResourceCount(plantId: PlantId, value: number) {
        const entry = this.entries.find((item) => item.id === plantId);
        if (!entry) {
            return;
        }

        const nextValue = Math.max(0, Math.round(value));
        if (entry.count === nextValue) {
            return;
        }

        entry.count = nextValue;
        entry.countLabel.text = `x${entry.count}`;
    }

    getResourceCount(plantId: PlantId) {
        return this.entries.find((item) => item.id === plantId)?.count ?? 0;
    }

    playResourceGainAnimation(
        plantId: PlantId,
        amount: number,
        sourceWorldPositions: readonly THREE.Vector3[],
        camera: THREE.Camera,
    ) {
        const rewardAmount = Math.max(0, Math.round(amount));
        if (rewardAmount <= 0) {
            return Promise.resolve();
        }

        const entry = this.entries.find((item) => item.id === plantId);
        if (!entry) {
            return Promise.resolve();
        }

        if (this.isDisposed) {
            this.setResourceCount(plantId, this.getResourceCount(plantId) + rewardAmount);
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            const batch: ResourceGainBatch = {
                plantId,
                pendingIcons: rewardAmount,
                resolve,
            };
            const startPositions = this.buildFlyStartPositions(sourceWorldPositions, camera);
            const endX = entry.icon.x;
            const endY = entry.icon.y;

            for (let index = 0; index < rewardAmount; index += 1) {
                const startBase = startPositions[index % startPositions.length];
                const startX = startBase.x + this.randomRange(-FLY_ICON_START_JITTER_X, FLY_ICON_START_JITTER_X);
                const startY = startBase.y + this.randomRange(-FLY_ICON_START_JITTER_Y, FLY_ICON_START_JITTER_Y);
                const controlY = Math.max(startY, endY) + FLY_ICON_ARC_HEIGHT_MIN + this.randomRange(0, FLY_ICON_ARC_HEIGHT_EXTRA);
                const controlX = (startX + endX) * 0.5 + this.randomRange(-FLY_ICON_CONTROL_JITTER_X, FLY_ICON_CONTROL_JITTER_X);
                const icon = new Sprite(entry.iconTexture ?? Texture.WHITE);
                const baseSize = this.clamp(this.currentIconSize * FLY_ICON_SIZE_RATIO, FLY_ICON_MIN_SIZE, FLY_ICON_MAX_SIZE);
                icon.anchor.set(0.5, 0.5);
                icon.position.set(startX, startY);
                icon.width = baseSize;
                icon.height = baseSize;
                icon.alpha = 0;
                icon.zIndex = 50;
                this.root.addChild(icon);
                this.flyingIcons.push({
                    plantId,
                    icon,
                    startX,
                    startY,
                    controlX,
                    controlY,
                    endX,
                    endY,
                    duration: this.randomRange(FLY_ICON_DURATION_MIN, FLY_ICON_DURATION_MAX),
                    delay: index * FLY_ICON_STAGGER + this.randomRange(0, FLY_ICON_DELAY_JITTER),
                    baseSize,
                    batch,
                    elapsed: 0,
                    isRewardApplied: false,
                });
            }
        });
    }

    setVisible(isVisible: boolean) {
        this.isVisible = isVisible;
        this.root.visible = isVisible;
    }

    dispose() {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.clearFlyingIcons(false);
        this.pixiUI.root.removeChild(this.root);
        this.root.destroy({ children: true });
    }

    private createEntries() {
        for (const definition of RESOURCE_DEFINITIONS) {
            const icon = new Sprite(Texture.WHITE);
            icon.anchor.set(0.5, 0.5);
            icon.zIndex = 1;
            const countLabel = new Text({
                text: 'x0',
                style: {
                    fontFamily: 'Trebuchet MS, Verdana, sans-serif',
                    fontSize: 30,
                    fill: '#fff6e6',
                    fontWeight: '800',
                    stroke: { color: '#70421d', width: 5 },
                },
            });
            countLabel.anchor.set(0.5, 0.5);
            countLabel.zIndex = 2;
            this.root.addChild(icon);
            this.root.addChild(countLabel);
            this.entries.push({
                id: definition.id,
                icon,
                countLabel,
                iconTexture: null,
                count: 0,
            });
        }
    }

    private async loadIconTextures() {
        await Promise.all(
            RESOURCE_DEFINITIONS.map(async (definition) => {
                const entry = this.entries.find((item) => item.id === definition.id);
                if (!entry) {
                    return;
                }

                try {
                    const texture = await Assets.load<Texture>(definition.iconPath);
                    entry.iconTexture = texture;
                    entry.icon.texture = texture;
                } catch (error) {
                    console.error(`Failed to load farm icon: ${definition.iconPath}`, error);
                }
            }),
        );
    }

    private layoutEntries() {
        const iconSize = this.clamp(this.viewportWidth * ICON_SCREEN_RATIO, ICON_MIN_SIZE, ICON_MAX_SIZE);
        this.currentIconSize = iconSize;
        const countWidth = iconSize * 0.66;
        const groupWidth = iconSize + COUNT_ICON_GAP_PX + countWidth;
        const itemStride = groupWidth + ITEM_GAP;
        const frameWidth = this.entries.length * itemStride - ITEM_GAP + FRAME_PADDING_X * 2;
        const frameHeight = iconSize + FRAME_PADDING_Y * 2;
        const frameX = HUD_MARGIN_LEFT;
        const frameY = HUD_MARGIN_TOP;

        this.frame.clear();
        this.frame.roundRect(frameX, frameY, frameWidth, frameHeight, Math.max(10, frameHeight * 0.2));
        this.frame.fill({ color: 0xb59875, alpha: 0.9 });
        this.frame.stroke({ color: 0x947454, alpha: 0.86, width: 2 });

        const startX = frameX + FRAME_PADDING_X + iconSize * 0.5;
        const iconY = frameY + frameHeight * 0.5;
        for (let index = 0; index < this.entries.length; index += 1) {
            const entry = this.entries[index];
            const iconX = startX + index * itemStride;
            const countX = iconX + iconSize * 0.5 + COUNT_ICON_GAP_PX + countWidth * 0.5;
            const countY = iconY + iconSize * COUNT_OFFSET_Y_RATIO;

            entry.icon.position.set(iconX, iconY);
            entry.icon.width = iconSize;
            entry.icon.height = iconSize;
            entry.countLabel.position.set(countX, countY);
            entry.countLabel.style.fontSize = Math.round(iconSize * 0.5);
        }
    }

    private updateFlyingIcons(deltaSeconds: number) {
        if (this.flyingIcons.length === 0 || this.isDisposed) {
            return;
        }

        const safeDeltaSeconds = Math.max(0, deltaSeconds);
        for (let index = this.flyingIcons.length - 1; index >= 0; index -= 1) {
            const icon = this.flyingIcons[index];
            icon.elapsed += safeDeltaSeconds;
            const localElapsed = icon.elapsed - icon.delay;
            if (localElapsed <= 0) {
                continue;
            }

            const progress = this.clamp(localElapsed / Math.max(icon.duration, 0.001), 0, 1);
            const pathProgress = this.easeOutCubic(progress);
            const inverse = 1 - pathProgress;
            const x =
                inverse * inverse * icon.startX +
                2 * inverse * pathProgress * icon.controlX +
                pathProgress * pathProgress * icon.endX;
            const y =
                inverse * inverse * icon.startY +
                2 * inverse * pathProgress * icon.controlY +
                pathProgress * pathProgress * icon.endY;
            const scale =
                1 +
                0.22 * Math.sin(progress * Math.PI) +
                this.lerp(0.08, -0.12, progress);
            const fadeIn = this.clamp(progress / 0.2, 0, 1);
            const fadeOut = this.clamp((1 - progress) / 0.22, 0, 1);

            icon.icon.position.set(x, y);
            icon.icon.width = icon.baseSize * scale;
            icon.icon.height = icon.baseSize * scale;
            icon.icon.alpha = Math.min(fadeIn, fadeOut) * 0.96;

            if (progress < 1) {
                continue;
            }

            this.completeFlyingIcon(index, icon);
        }
    }

    private completeFlyingIcon(index: number, icon: FlyingResourceIcon) {
        if (!icon.isRewardApplied) {
            this.setResourceCount(icon.plantId, this.getResourceCount(icon.plantId) + 1);
            icon.isRewardApplied = true;
        }

        this.root.removeChild(icon.icon);
        icon.icon.destroy();
        this.flyingIcons.splice(index, 1);
        icon.batch.pendingIcons = Math.max(0, icon.batch.pendingIcons - 1);
        if (icon.batch.pendingIcons <= 0) {
            icon.batch.resolve();
        }
    }

    private clearFlyingIcons(shouldApplyPendingRewards: boolean) {
        for (let index = this.flyingIcons.length - 1; index >= 0; index -= 1) {
            const icon = this.flyingIcons[index];
            if (shouldApplyPendingRewards && !icon.isRewardApplied) {
                this.setResourceCount(icon.plantId, this.getResourceCount(icon.plantId) + 1);
                icon.isRewardApplied = true;
            }

            this.root.removeChild(icon.icon);
            icon.icon.destroy();
            icon.batch.pendingIcons = Math.max(0, icon.batch.pendingIcons - 1);
            if (icon.batch.pendingIcons <= 0) {
                icon.batch.resolve();
            }
        }
        this.flyingIcons.length = 0;
    }

    private buildFlyStartPositions(
        sourceWorldPositions: readonly THREE.Vector3[],
        camera: THREE.Camera,
    ) {
        const starts: { x: number; y: number }[] = [];
        for (const worldPosition of sourceWorldPositions) {
            const projected = this.projectWorldToScreen(worldPosition, camera);
            if (projected) {
                starts.push(projected);
            }
        }

        if (starts.length > 0) {
            return starts;
        }

        return [{ x: this.viewportWidth * 0.08, y: this.viewportHeight * 0.82 }];
    }

    private projectWorldToScreen(worldPosition: THREE.Vector3, camera: THREE.Camera) {
        this.projectionVector.copy(worldPosition).project(camera);
        if (
            !Number.isFinite(this.projectionVector.x) ||
            !Number.isFinite(this.projectionVector.y) ||
            this.projectionVector.z < -1 ||
            this.projectionVector.z > 1
        ) {
            return null;
        }

        return {
            x: (this.projectionVector.x * 0.5 + 0.5) * this.viewportWidth,
            y: (-this.projectionVector.y * 0.5 + 0.5) * this.viewportHeight,
        };
    }

    private randomRange(min: number, max: number) {
        return min + Math.random() * (max - min);
    }

    private clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value));
    }

    private lerp(from: number, to: number, t: number) {
        return from + (to - from) * this.clamp(t, 0, 1);
    }

    private easeOutCubic(value: number) {
        const t = this.clamp(value, 0, 1);
        const inverse = 1 - t;
        return 1 - inverse * inverse * inverse;
    }
}
