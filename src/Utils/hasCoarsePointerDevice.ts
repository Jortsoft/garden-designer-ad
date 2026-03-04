const COARSE_POINTER_MEDIA_QUERY = '(pointer: coarse)';

export function hasCoarsePointerDevice() {
    return (
        window.matchMedia(COARSE_POINTER_MEDIA_QUERY).matches ||
        navigator.maxTouchPoints > 0
    );
}
