import type { GameConfigModel } from "../Models/GameConfig.model";

export const GameConfig: GameConfigModel = {
    debugMode: true,
    Fps: 60,
    defaultCameraPosition: {
        x: 0.852,
        y: 1.235,
        z: 3.202,
        yaw: -0.29,
        pitch: -44.67,
        dirX: 0.004,
        dirY: -0.703,
        dirZ: -0.711
    },
    LandscapeDefaultZoomLevel: 1.109,
    MaxZoomInLevel: 0.804,
    MaxZoomOutLevel: 1.566,
    MaxLeftMove: 0.508,
    MaxRightMove: 1.252,
    MaxTopMove: 2.897,
    MaxDownMove: 3.119,
    enableShadow: true,
    postProcessingData: {
        exposure: 1.88
    }
};
