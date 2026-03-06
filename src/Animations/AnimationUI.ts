import type {
    UIAnimationDefinition,
    UIVisibilityAnimationDefinition,
    UIVisibilityAnimationFrame,
    UIVisibilityAnimationState,
} from '../Models/AnimationUI.model';
export type {
    UIAnimationDefinition,
    UIVisibilityAnimationDefinition,
    UIVisibilityAnimationFrame,
    UIVisibilityAnimationState,
} from '../Models/AnimationUI.model';

const EPSILON = 0.0001;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

const easeOutCubic = (progress: number) => 1 - Math.pow(1 - clamp01(progress), 3);
const easeInCubic = (progress: number) => Math.pow(clamp01(progress), 3);

export const UI_ENTER_ANIMATION: UIAnimationDefinition = {
    duration: 0.34,
    easing: easeOutCubic,
};

export const UI_EXIT_ANIMATION: UIAnimationDefinition = {
    duration: 0.24,
    easing: easeInCubic,
};

export const SHARED_UI_VISIBILITY_ANIMATION: UIVisibilityAnimationDefinition = {
    enter: UI_ENTER_ANIMATION,
    exit: UI_EXIT_ANIMATION,
    hiddenOffsetY: -56,
    hiddenScale: 0.94,
    interactiveThreshold: 0.9,
};

export class UIVisibilityAnimationController {
    private readonly animation: UIVisibilityAnimationDefinition;
    private visibilityAmount = 1;
    private targetVisibilityAmount = 1;

    constructor(animation: UIVisibilityAnimationDefinition = SHARED_UI_VISIBILITY_ANIMATION) {
        this.animation = animation;
    }

    show(immediate = false) {
        this.targetVisibilityAmount = 1;

        if (immediate) {
            this.visibilityAmount = 1;
        }
    }

    hide(immediate = false) {
        this.targetVisibilityAmount = 0;

        if (immediate) {
            this.visibilityAmount = 0;
        }
    }

    update(deltaSeconds: number) {
        if (deltaSeconds <= 0) {
            return;
        }

        if (Math.abs(this.targetVisibilityAmount - this.visibilityAmount) <= EPSILON) {
            this.visibilityAmount = this.targetVisibilityAmount;
            return;
        }

        if (this.targetVisibilityAmount > this.visibilityAmount) {
            const duration = Math.max(this.animation.enter.duration, EPSILON);
            this.visibilityAmount = Math.min(
                this.targetVisibilityAmount,
                this.visibilityAmount + deltaSeconds / duration,
            );
            return;
        }

        const duration = Math.max(this.animation.exit.duration, EPSILON);
        this.visibilityAmount = Math.max(
            this.targetVisibilityAmount,
            this.visibilityAmount - deltaSeconds / duration,
        );
    }

    getFrame() {
        const state = this.getState();
        const easedProgress =
            state === 'entering'
                ? this.animation.enter.easing(this.visibilityAmount)
                : state === 'exiting'
                    ? this.animation.exit.easing(this.visibilityAmount)
                    : this.visibilityAmount;
        const progress = clamp01(easedProgress);
        const opacity = progress;
        const scale = lerp(this.animation.hiddenScale, 1, progress);
        const offsetY = this.animation.hiddenOffsetY * (1 - progress);
        const isRenderable = opacity > 0.001;
        const isInteractive =
            state === 'visible' ||
            (state === 'entering' && progress >= this.animation.interactiveThreshold);

        return {
            opacity,
            scale,
            offsetY,
            state,
            isRenderable,
            isInteractive,
        } satisfies UIVisibilityAnimationFrame;
    }

    private getState(): UIVisibilityAnimationState {
        const isVisible = this.visibilityAmount >= 1 - EPSILON;
        const isHidden = this.visibilityAmount <= EPSILON;

        if (isVisible && this.targetVisibilityAmount >= 1 - EPSILON) {
            return 'visible';
        }

        if (isHidden && this.targetVisibilityAmount <= EPSILON) {
            return 'hidden';
        }

        return this.targetVisibilityAmount > this.visibilityAmount ? 'entering' : 'exiting';
    }
}
