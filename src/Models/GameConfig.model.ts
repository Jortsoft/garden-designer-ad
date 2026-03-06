export interface GameConfigModel {
    debugMode: boolean;
    Fps: number;
    downloadGameUrl: string;
    gameName: string;
    defaultCameraPosition: {
        x: number;
        y: number;
        z: number;
        yaw: number;
        pitch: number;
        dirX: number;
        dirY: number;
        dirZ: number;
    },
    LandscapeDefaultZoomLevel: number;
    MaxZoomInLevel: number;
    MaxZoomOutLevel: number;
    MaxLeftMove: number;
    MaxRightMove: number;
    MaxTopMove: number;
    MaxDownMove: number;
    enableShadow: boolean;
    postProcessingData: {
        exposure: number;
        vignette: number;
        vignetteSoft: number;
    },
    lightData: {
        sunIntensity: number;
    }
}
