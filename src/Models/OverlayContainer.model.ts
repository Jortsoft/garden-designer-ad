export interface OverlayContainerTheme {
    readonly backgroundColor: string;
    readonly borderColor: string;
    readonly titleColor: string;
    readonly titleStrokeColor: string;
    readonly titleShadowColor: string;
}

export interface OverlayContainerUIOptions {
    readonly renderOrder?: number;
    readonly title?: string;
    readonly titleFontFamily?: string;
    readonly textureScale?: number;
    readonly textureMinPixelWidth?: number;
    readonly textureMinPixelHeight?: number;
    readonly textureMaxPixelWidth?: number;
    readonly textureMaxPixelHeight?: number;
    readonly theme?: Partial<OverlayContainerTheme>;
}
