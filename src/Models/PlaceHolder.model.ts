import type { Vector3Like } from './Vegetable.model';

export interface PlaceHolderOptions {
    readonly name?: string;
    readonly position?: Vector3Like;
    readonly rotationDegrees?: Vector3Like;
    readonly scale?: number;
    readonly isVisibleInitially?: boolean;
}
