export type UIVisibilityAnimationState = 'hidden' | 'entering' | 'visible' | 'exiting';

export interface UIAnimationDefinition {
    readonly duration: number;
    readonly easing: (progress: number) => number;
}

export interface UIVisibilityAnimationDefinition {
    readonly enter: UIAnimationDefinition;
    readonly exit: UIAnimationDefinition;
    readonly hiddenOffsetY: number;
    readonly hiddenScale: number;
    readonly interactiveThreshold: number;
}

export interface UIVisibilityAnimationFrame {
    readonly opacity: number;
    readonly scale: number;
    readonly offsetY: number;
    readonly state: UIVisibilityAnimationState;
    readonly isRenderable: boolean;
    readonly isInteractive: boolean;
}
