/**
 * Feature-detect a usable camera before offering to scan. [G4]
 *
 * Lives apart from QrScanner on purpose: that component is lazy-loaded, and
 * importing anything from it statically would pull the module — and its
 * scanner dependency — back into the main bundle.
 */
export const hasCamera = (): boolean =>
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    isSecureContext();

/**
 * Browsers only expose the camera — and only persist a permission grant — on a
 * secure origin. Over plain http on a LAN IP the prompt either never appears or
 * is re-asked every time, which is worth saying out loud rather than letting
 * the scanner fail silently.
 */
export const isSecureContext = (): boolean =>
    typeof window === "undefined" || window.isSecureContext;
