import { PHOTO_MAX_CHARS } from "../model/Car";

/**
 * Turning a phone photo into something that fits in a Firestore document.
 * [C5, D4]
 *
 * Firebase Storage would be the obvious home for this, and it is not available:
 * new projects need the Blaze plan for it, which breaks the zero-cost
 * constraint. So the photo lives *in* the car document as a JPEG data URL, and
 * that puts a hard ceiling on it — Firestore documents stop at 1MB, and the
 * document also has to hold everything else about the car.
 *
 * The pipeline: decode → rotate upright → scale the long edge → encode JPEG,
 * stepping quality down to a floor and then dimensions down, until the data URL
 * fits. It gives up rather than storing something oversized.
 *
 * Everything here is browser-native — canvas, `createImageBitmap`, and a small
 * EXIF reader. No library, no upload, no network.
 */

/** Long edge, in CSS pixels. Plenty for a card header on any phone. */
export const MAX_EDGE = 1280;

/**
 * The quality floor. [T10 follow-up]
 *
 * Below this, JPEG artefacts are visible on exactly the things people
 * photograph cars against — flat paintwork, sky, tarmac — and a mushy photo of
 * your own car is worse than no photo. When quality alone can't reach the
 * budget, the pipeline gives up PIXELS instead: a sharp 1080px image beats a
 * soft 1280px one at the same file size.
 */
export const MIN_QUALITY = 0.6;

/** Tried in order. Never goes below MIN_QUALITY — see the invariant test. */
export const QUALITY_STEPS = [0.82, 0.74, 0.66, MIN_QUALITY];

/** When the quality floor is reached, shrink and run the ladder again. */
export const EDGE_STEPS = [MAX_EDGE, 1080, 900, 720];

export class PhotoTooLargeError extends Error {
    constructor() {
        super("Could not compress this image small enough to store.");
        this.name = "PhotoTooLargeError";
    }
}

export class PhotoUnreadableError extends Error {
    constructor() {
        super("Could not read this image.");
        this.name = "PhotoUnreadableError";
    }
}

/** Scaled dimensions with the aspect ratio kept, never scaling UP. */
export const fitWithin = (
    width: number,
    height: number,
    maxEdge: number,
): { width: number; height: number } => {
    const longest = Math.max(width, height);
    if (longest <= maxEdge) return { width, height };

    const scale = maxEdge / longest;
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
};

// ─────────────────────────────────────────────────────────── EXIF / ROTATION

/** What a JPEG's own bytes say about itself. */
export interface JpegMeta {
    /** EXIF orientation, 1–8. 1 when absent, unparseable, or not a JPEG. */
    orientation: number;
    /** Dimensions as STORED (before any rotation). 0 when not found. */
    width: number;
    height: number;
}

export const NO_JPEG_META: JpegMeta = { orientation: 1, width: 0, height: 0 };

/** Orientations 5–8 are 90°/270° turns, so display axes are swapped. */
export const orientationSwapsAxes = (orientation: number): boolean =>
    orientation >= 5 && orientation <= 8;

/**
 * Reads EXIF orientation and the stored dimensions straight out of a JPEG.
 *
 * Deliberately hand-rolled and tiny: this needs two numbers from a header, and
 * an EXIF library would be a dependency an order of magnitude larger than the
 * feature. Anything it can't parse — a HEIC, a PNG, a truncated file — comes
 * back as "no rotation, unknown size", which every caller treats as safe.
 */
export const readJpegMeta = (buffer: ArrayBuffer): JpegMeta => {
    try {
        const view = new DataView(buffer);
        if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
            return NO_JPEG_META;
        }

        let orientation = 1;
        let width = 0;
        let height = 0;
        let offset = 2;

        while (offset + 4 <= view.byteLength) {
            const marker = view.getUint16(offset, false);
            if ((marker & 0xff00) !== 0xff00) break;
            offset += 2;

            const size = view.getUint16(offset, false);
            if (size < 2) break;

            // APP1 — where EXIF lives.
            if (marker === 0xffe1 && orientation === 1) {
                orientation = readOrientationFromApp1(view, offset + 2, size - 2);
            }

            // SOF0/1/2/3 and the rest — the true stored dimensions. Excludes
            // DHT (c4), JPG (c8) and DAC (cc), which share the 0xffc_ range.
            const isFrameHeader =
                marker >= 0xffc0 &&
                marker <= 0xffcf &&
                marker !== 0xffc4 &&
                marker !== 0xffc8 &&
                marker !== 0xffcc;

            // Read the dimensions before the overrun check below: the seven
            // bytes needed are right here, and a segment whose declared length
            // runs past the end of what we were given is exactly the case
            // where we'd still rather have them than not.
            if (isFrameHeader && offset + 7 <= view.byteLength) {
                height = view.getUint16(offset + 3, false);
                width = view.getUint16(offset + 5, false);
                break; // Both numbers in hand.
            }

            if (offset + size > view.byteLength) break;
            offset += size;
        }

        return { orientation, width, height };
    } catch {
        // A malformed header must never be the reason a photo is rejected.
        return NO_JPEG_META;
    }
};

/** The orientation tag inside an APP1 segment, or 1. */
const readOrientationFromApp1 = (
    view: DataView,
    start: number,
    length: number,
): number => {
    if (start + 14 > view.byteLength || length < 14) return 1;
    // "Exif"
    if (view.getUint32(start, false) !== 0x45786966) return 1;

    const tiff = start + 6;
    const byteOrder = view.getUint16(tiff, false);
    if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return 1;
    const little = byteOrder === 0x4949;

    const ifdOffset = view.getUint32(tiff + 4, little);
    const dir = tiff + ifdOffset;
    if (dir + 2 > view.byteLength) return 1;

    const entries = view.getUint16(dir, little);
    for (let index = 0; index < entries; index++) {
        const entry = dir + 2 + index * 12;
        if (entry + 12 > view.byteLength) break;

        // 0x0112 = Orientation
        if (view.getUint16(entry, little) === 0x0112) {
            const value = view.getUint16(entry + 8, little);
            return value >= 1 && value <= 8 ? value : 1;
        }
    }
    return 1;
};

/**
 * Which rotation this pipeline still has to apply itself.
 *
 * The decode asks for `imageOrientation: "none"`, and a browser that ignores
 * the option gets the same result, because "none" is the spec default. So in
 * principle the answer is always "whatever EXIF says".
 *
 * In practice some browsers — and the `<img>` fallback below, where CSS
 * `image-orientation: from-image` is now the default — rotate anyway. Applying
 * EXIF on top of that would land the photo 180° out, which is worse than the
 * bug this is fixing. For a 90°/270° tag that double-rotation is detectable:
 * the decoded bitmap comes back with its axes already swapped relative to the
 * dimensions stored in the JPEG's frame header.
 *
 * Square images are the blind spot — swapped and unswapped look identical — so
 * those trust the requested "none" and apply the tag.
 */
export const resolveRotation = (
    meta: JpegMeta,
    bitmapWidth: number,
    bitmapHeight: number,
): number => {
    if (meta.orientation <= 1) return 1;
    if (!orientationSwapsAxes(meta.orientation)) return meta.orientation;

    // No stored dimensions to compare against, or a square image: can't tell,
    // so trust the decode request.
    if (!meta.width || !meta.height || meta.width === meta.height) {
        return meta.orientation;
    }

    const alreadyRotated =
        bitmapWidth === meta.height && bitmapHeight === meta.width;

    return alreadyRotated ? 1 : meta.orientation;
};

// ────────────────────────────────────────────────────────────────── DECODING

interface DecodedImage {
    source: CanvasImageSource;
    width: number;
    height: number;
    release: () => void;
}

/**
 * Decodes an image file, HEIC/HEIF included where the platform can.
 *
 * Two attempts, because they don't have the same reach:
 *
 *  1. `createImageBitmap` — fast, and on iOS/macOS it goes through the system
 *     codecs, so an iPhone's HEIC decodes natively.
 *  2. An `<img>` element — slower, but a different code path in some browsers,
 *     and worth trying before telling someone their photo is unusable.
 *
 * Only when both fail does the caller get "please use JPEG". iOS usually
 * transcodes HEIC to JPEG in the photo picker anyway; this is for when it
 * doesn't.
 */
const decode = async (file: Blob): Promise<DecodedImage> => {
    try {
        // "none" so rotation stays this module's decision — see resolveRotation.
        const bitmap = await createImageBitmap(file, {
            imageOrientation: "none",
        });
        return {
            source: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            release: () => bitmap.close(),
        };
    } catch {
        return decodeViaImageElement(file);
    }
};

const decodeViaImageElement = (file: Blob): Promise<DecodedImage> =>
    new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            resolve({
                source: image,
                width: image.naturalWidth,
                height: image.naturalHeight,
                release: () => URL.revokeObjectURL(url),
            });
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new PhotoUnreadableError());
        };

        image.src = url;
    });

// ────────────────────────────────────────────────────────────────── DRAWING

/**
 * The canvas transform for each EXIF orientation, in display space.
 * Orientations 2/4/5/7 are mirrored, which real cameras rarely produce but
 * editing apps do.
 */
const applyOrientation = (
    context: CanvasRenderingContext2D,
    orientation: number,
    width: number,
    height: number,
): void => {
    switch (orientation) {
        case 2: // mirror
            context.transform(-1, 0, 0, 1, width, 0);
            break;
        case 3: // 180°
            context.transform(-1, 0, 0, -1, width, height);
            break;
        case 4: // mirror + 180°
            context.transform(1, 0, 0, -1, 0, height);
            break;
        case 5: // mirror + 90° CW
            context.transform(0, 1, 1, 0, 0, 0);
            break;
        case 6: // 90° CW — a phone held upright
            context.transform(0, 1, -1, 0, width, 0);
            break;
        case 7: // mirror + 270° CW
            context.transform(0, -1, -1, 0, width, height);
            break;
        case 8: // 270° CW — a phone held upright the other way
            context.transform(0, -1, 1, 0, 0, height);
            break;
        default:
            break;
    }
};

/**
 * Draws the image upright and scaled, and encodes it.
 *
 * The output carries no EXIF at all — `canvas.toDataURL` writes a bare JPEG —
 * so the rotation has to be baked into the pixels here. That is the point:
 * strip the metadata, keep the orientation.
 */
const drawToDataUrl = (
    decoded: DecodedImage,
    orientation: number,
    maxEdge: number,
    quality: number,
): { dataUrl: string; width: number; height: number } => {
    const swap = orientationSwapsAxes(orientation);
    const displayWidth = swap ? decoded.height : decoded.width;
    const displayHeight = swap ? decoded.width : decoded.height;

    const { width, height } = fitWithin(displayWidth, displayHeight, maxEdge);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new PhotoUnreadableError();

    // A JPEG has no alpha channel; without this, anything transparent in the
    // source encodes as black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    applyOrientation(context, orientation, width, height);
    // Post-transform the drawing space is the UNrotated one, so a swapped
    // orientation draws into the transposed box.
    context.drawImage(
        decoded.source,
        0,
        0,
        swap ? height : width,
        swap ? width : height,
    );

    return { dataUrl: canvas.toDataURL("image/jpeg", quality), width, height };
};

/**
 * Rescales a prepared canvas source down to `maxEdge` and encodes it at
 * `quality`. Nothing about the input — no rotation, no crop — changes; the
 * pixels are only fit into the ladder's current attempt.
 *
 * Used by `compressPreparedImage`, which the editor calls when the user has
 * already cropped and rotated the photo themselves. The old file path uses
 * `drawToDataUrl` instead so it can bake EXIF orientation in the same pass.
 */
const encodePreparedSource = (
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    maxEdge: number,
    quality: number,
): { dataUrl: string; width: number; height: number } => {
    const { width, height } = fitWithin(sourceWidth, sourceHeight, maxEdge);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new PhotoUnreadableError();

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);

    return { dataUrl: canvas.toDataURL("image/jpeg", quality), width, height };
};

export interface CompressedPhoto {
    /** JPEG data URL, guaranteed at most PHOTO_MAX_CHARS long. */
    dataUrl: string;
    /** Stored length in characters — what the rules measure. */
    chars: number;
    width: number;
    height: number;
    /** The rotation baked in, for diagnostics. 1 means none was needed. */
    appliedOrientation: number;
}

/**
 * Compresses `file` until its data URL fits the document budget.
 *
 * Throws `PhotoUnreadableError` if nothing can decode it, and
 * `PhotoTooLargeError` if even the smallest setting won't fit — better a clear
 * refusal than a write the rules will bounce.
 */
export const compressPhoto = async (
    file: Blob,
    maxChars: number = PHOTO_MAX_CHARS,
): Promise<CompressedPhoto> => {
    // Read the header before decoding: the bytes are the only place the
    // original orientation survives, and the decode may consume the blob.
    let meta = NO_JPEG_META;
    try {
        meta = readJpegMeta(await file.arrayBuffer());
    } catch {
        // Unreadable header — carry on and let the decoder have its say.
    }

    const decoded = await decode(file);
    const orientation = resolveRotation(meta, decoded.width, decoded.height);

    try {
        // Quality first, down to the floor; then pixels. Never below the floor.
        for (const maxEdge of EDGE_STEPS) {
            for (const quality of QUALITY_STEPS) {
                const result = drawToDataUrl(decoded, orientation, maxEdge, quality);
                if (result.dataUrl.length <= maxChars) {
                    return {
                        dataUrl: result.dataUrl,
                        chars: result.dataUrl.length,
                        width: result.width,
                        height: result.height,
                        appliedOrientation: orientation,
                    };
                }
            }
        }
        throw new PhotoTooLargeError();
    } finally {
        // Frees the decoded pixels immediately rather than waiting for GC —
        // a 12MP phone photo is ~48MB of bitmap.
        decoded.release();
    }
};

/**
 * Decodes and up-rights a file for the editor. HEIC and EXIF orientation are
 * handled here, exactly like `compressPhoto` would — the editor then only has
 * to think about crop and rotation, not about which way a phone was held.
 *
 * Returns a canvas because react-easy-crop needs an image URL, and a canvas
 * is what feeds cleanly into `canvas.toBlob → URL.createObjectURL` without
 * roundtripping through a base64 string.
 */
export const prepareFileForEditor = async (
    file: Blob,
): Promise<HTMLCanvasElement> => {
    let meta = NO_JPEG_META;
    try {
        meta = readJpegMeta(await file.arrayBuffer());
    } catch {
        // Unreadable header — carry on and let the decoder have its say.
    }

    const decoded = await decode(file);
    const orientation = resolveRotation(meta, decoded.width, decoded.height);

    try {
        const swap = orientationSwapsAxes(orientation);
        const width = swap ? decoded.height : decoded.width;
        const height = swap ? decoded.width : decoded.height;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) throw new PhotoUnreadableError();

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        applyOrientation(context, orientation, width, height);
        context.drawImage(
            decoded.source,
            0,
            0,
            swap ? height : width,
            swap ? width : height,
        );

        return canvas;
    } finally {
        decoded.release();
    }
};

/**
 * Compresses a canvas the caller already cropped and rotated. The editor
 * produces this canvas — every pixel decision has already been made — so all
 * this does is fit the ladder around the same size guard `compressPhoto`
 * uses.
 *
 * Kept as its own entry point rather than folded into `compressPhoto` because
 * the two paths have opposite responsibilities: `compressPhoto` decides how to
 * decode and how to orient; this one only decides how to encode. Sharing the
 * ladder is what keeps the ≤ PHOTO_MAX_CHARS guarantee identical in both.
 */
export const compressPreparedImage = async (
    source: HTMLCanvasElement | ImageBitmap,
    maxChars: number = PHOTO_MAX_CHARS,
): Promise<CompressedPhoto> => {
    const sourceWidth = source.width;
    const sourceHeight = source.height;

    for (const maxEdge of EDGE_STEPS) {
        for (const quality of QUALITY_STEPS) {
            const result = encodePreparedSource(
                source,
                sourceWidth,
                sourceHeight,
                maxEdge,
                quality,
            );
            if (result.dataUrl.length <= maxChars) {
                return {
                    dataUrl: result.dataUrl,
                    chars: result.dataUrl.length,
                    width: result.width,
                    height: result.height,
                    // Rotation was the editor's choice, not this pipeline's.
                    appliedOrientation: 1,
                };
            }
        }
    }
    throw new PhotoTooLargeError();
};
