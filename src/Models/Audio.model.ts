export type AudioClipId = 'click' | 'harvest' | 'chicken' | 'cow';

export interface AudioClipConfig {
    readonly path: string;
    readonly poolSize: number;
    readonly volume: number;
}

export interface AudioPoolState {
    readonly clipId: AudioClipId;
    readonly instances: HTMLAudioElement[];
    nextIndex: number;
}
