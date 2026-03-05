const AUDIO_CLIP_CONFIG = {
    click: {
        path: 'assets/sounds/click_003.mp3',
        poolSize: 4,
        volume: 1,
    },
    harvest: {
        path: 'assets/sounds/throw_spear.mp3',
        poolSize: 3,
        volume: 1,
    },
} as const;

export type AudioClipId = keyof typeof AUDIO_CLIP_CONFIG;

interface AudioPoolState {
    readonly clipId: AudioClipId;
    readonly instances: HTMLAudioElement[];
    nextIndex: number;
}

export class AudioManager {
    private readonly pools = new Map<AudioClipId, AudioPoolState>();

    play(clipId: AudioClipId) {
        const pool = this.getOrCreatePool(clipId);

        if (pool.instances.length === 0) {
            return;
        }

        const sound = pool.instances[pool.nextIndex];
        pool.nextIndex = (pool.nextIndex + 1) % pool.instances.length;
        sound.currentTime = 0;
        void sound.play().catch(() => {
            // Ignore blocked playback or transient play failures.
        });
    }

    playClick() {
        this.play('click');
    }

    playHarvest() {
        this.play('harvest');
    }

    private getOrCreatePool(clipId: AudioClipId) {
        const existingPool = this.pools.get(clipId);
        if (existingPool) {
            return existingPool;
        }

        const clipConfig = AUDIO_CLIP_CONFIG[clipId];
        const instances: HTMLAudioElement[] = [];

        if (typeof Audio !== 'undefined') {
            for (let index = 0; index < clipConfig.poolSize; index += 1) {
                const audio = new Audio(clipConfig.path);
                audio.preload = 'auto';
                audio.volume = clipConfig.volume;
                instances.push(audio);
            }
        }

        const pool: AudioPoolState = {
            clipId,
            instances,
            nextIndex: 0,
        };
        this.pools.set(clipId, pool);

        return pool;
    }
}

export const audioManager = new AudioManager();
