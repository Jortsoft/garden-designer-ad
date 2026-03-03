export interface GameConfigModel {
    debugMode: boolean;
    Fps: number;
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
    postProcessingData: {
        exposure: number;
    }
}
