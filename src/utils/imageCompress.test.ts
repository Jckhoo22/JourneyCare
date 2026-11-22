import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    EDGE_STEPS,
    MAX_EDGE,
    MIN_QUALITY,
    NO_JPEG_META,
    QUALITY_STEPS,
    PhotoTooLargeError,
    compressPreparedImage,
    fitWithin,
    orientationSwapsAxes,
    readJpegMeta,
    resolveRotation,
} from "./imageCompress";

/**
 * The encode loop needs a real canvas and `createImageBitmap`, neither of which
 * jsdom implements — that half is covered by the manual test on a phone. What
 * IS pure, and what goes wrong silently, is everything around it: the EXIF
 * read, the double-rotation guard, and the ladder's floor.
 */

// ─────────────────────────────────────────────────────── JPEG FIXTURES

/**
 * Builds a minimal JPEG header: SOI, an optional EXIF APP1 carrying an
 * orientation tag, then an SOF0 frame header with the stored dimensions.
 *
 * Hand-built rather than checked in as a binary so the bytes under test are
 * visible right here — the parser's whole job is reading these offsets.
 */
const jpegHeader = ({
    orientation,
    width,
    height,
    littleEndian = true,
}: {
    orientation?: number;
    width: number;
    height: number;
    littleEndian?: boolean;
}): ArrayBuffer => {
    const bytes: number[] = [0xff, 0xd8]; // SOI

    if (orientation !== undefined) {
        // One IFD entry: 2 (count) + 12 (entry) + 4 (next-IFD) = 18 bytes,
        // after an 8-byte TIFF header and a 6-byte "Exif\0\0".
        const tiff: number[] = [];
        const u16 = (value: number) =>
            littleEndian
                ? [value & 0xff, (value >> 8) & 0xff]
                : [(value >> 8) & 0xff, value & 0xff];
        const u32 = (value: number) =>
            littleEndian
                ? [
                      value & 0xff,
                      (value >> 8) & 0xff,
                      (value >> 16) & 0xff,
                      (value >> 24) & 0xff,
                  ]
                : [
                      (value >> 24) & 0xff,
                      (value >> 16) & 0xff,
                      (value >> 8) & 0xff,
                      value & 0xff,
                  ];

        tiff.push(...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]));
        tiff.push(...u16(42));
        tiff.push(...u32(8)); // first IFD sits right after this header
        tiff.push(...u16(1)); // one entry
        tiff.push(...u16(0x0112)); // Orientation
        tiff.push(...u16(3)); // SHORT
        tiff.push(...u32(1)); // count
        tiff.push(...u16(orientation), 0, 0); // value, padded to 4 bytes
        tiff.push(...u32(0)); // no next IFD

        const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
        const size = payload.length + 2;
        bytes.push(0xff, 0xe1, (size >> 8) & 0xff, size & 0xff, ...payload);
    }

    // SOF0. Length counts itself: 2 + precision(1) + height(2) + width(2)
    // + component count(1) + one 3-byte component spec = 11 (0x0b).
    bytes.push(
        0xff,
        0xc0,
        0x00,
        0x0b,
        0x08, // 8-bit precision
        (height >> 8) & 0xff,
        height & 0xff,
        (width >> 8) & 0xff,
        width & 0xff,
        0x01, // one component
        0x01,
        0x11,
        0x00, // that component's id / sampling / quant table
    );

    return new Uint8Array(bytes).buffer;
};

// ───────────────────────────────────────────────────────────── GEOMETRY

describe("fitWithin [C5]", () => {
    it("leaves an image that already fits alone", () => {
        expect(fitWithin(800, 600, MAX_EDGE)).toEqual({ width: 800, height: 600 });
    });

    it("never scales an image UP", () => {
        expect(fitWithin(200, 150, MAX_EDGE)).toEqual({ width: 200, height: 150 });
    });

    it("scales a landscape photo by its long edge", () => {
        expect(fitWithin(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 });
    });

    it("scales a portrait photo by its long edge too", () => {
        // The case a width-only rule gets wrong: a portrait phone photo.
        expect(fitWithin(3000, 4000, 1280)).toEqual({ width: 960, height: 1280 });
    });

    it("keeps the aspect ratio within a rounding error", () => {
        const fitted = fitWithin(4032, 3024, 1280);
        expect(Math.abs(4032 / 3024 - fitted.width / fitted.height)).toBeLessThan(
            0.01,
        );
    });

    it("never rounds a dimension down to zero", () => {
        expect(fitWithin(10000, 3, 1280).height).toBeGreaterThanOrEqual(1);
    });
});

// ───────────────────────────────────────────────────── EXIF ORIENTATION

describe("readJpegMeta", () => {
    it("reads the orientation tag and the stored dimensions", () => {
        expect(
            readJpegMeta(jpegHeader({ orientation: 6, width: 4032, height: 3024 })),
        ).toEqual({ orientation: 6, width: 4032, height: 3024 });
    });

    it("reads big-endian EXIF too", () => {
        // Canon and Nikon write MM; phones mostly write II. Both are legal.
        expect(
            readJpegMeta(
                jpegHeader({
                    orientation: 8,
                    width: 4032,
                    height: 3024,
                    littleEndian: false,
                }),
            ).orientation,
        ).toBe(8);
    });

    it("reports orientation 1 for a JPEG with no EXIF", () => {
        const meta = readJpegMeta(jpegHeader({ width: 1000, height: 800 }));
        expect(meta.orientation).toBe(1);
        expect(meta.width).toBe(1000);
    });

    /**
     * Every one of these has to come back safe rather than throw: a photo must
     * never be rejected because its header confused the parser. HEIC in
     * particular is expected here — it has no JPEG marker structure at all, and
     * the platform decoder handles its orientation.
     */
    it("returns a safe default for anything it can't parse", () => {
        const notJpeg = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]).buffer;
        const heicish = new Uint8Array([
            0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
        ]).buffer;

        expect(readJpegMeta(notJpeg)).toEqual(NO_JPEG_META);
        expect(readJpegMeta(heicish)).toEqual(NO_JPEG_META);
        expect(readJpegMeta(new ArrayBuffer(0))).toEqual(NO_JPEG_META);
        expect(readJpegMeta(new Uint8Array([0xff, 0xd8]).buffer)).toEqual(
            NO_JPEG_META,
        );
    });

    it("survives a truncated EXIF segment", () => {
        const full = new Uint8Array(
            jpegHeader({ orientation: 6, width: 100, height: 100 }),
        );
        const cut = full.slice(0, 12).buffer;

        expect(() => readJpegMeta(cut)).not.toThrow();
        expect(readJpegMeta(cut).orientation).toBe(1);
    });

    it("ignores an out-of-range orientation value", () => {
        expect(
            readJpegMeta(jpegHeader({ orientation: 99, width: 10, height: 10 }))
                .orientation,
        ).toBe(1);
    });
});

describe("orientationSwapsAxes", () => {
    it("is true only for the quarter turns", () => {
        expect([1, 2, 3, 4].map(orientationSwapsAxes)).toEqual([
            false,
            false,
            false,
            false,
        ]);
        expect([5, 6, 7, 8].map(orientationSwapsAxes)).toEqual([
            true,
            true,
            true,
            true,
        ]);
    });
});

// ────────────────────────────────────────────── THE DOUBLE-ROTATION GUARD

/**
 * The bug this exists to prevent: applying EXIF rotation on top of a browser
 * that already applied it, which lands the photo 180° out — worse than the
 * sideways bug being fixed.
 */
describe("resolveRotation", () => {
    const portraitMeta = { orientation: 6, width: 4032, height: 3024 };

    it("applies the tag when the decode came back unrotated", () => {
        // Stored 4032x3024, decoded the same → the browser honoured "none".
        expect(resolveRotation(portraitMeta, 4032, 3024)).toBe(6);
    });

    it("applies NOTHING when the browser already rotated", () => {
        // Decoded 3024x4032 — axes swapped, so the rotation is already baked in.
        expect(resolveRotation(portraitMeta, 3024, 4032)).toBe(1);
    });

    it("does nothing for an upright photo", () => {
        expect(resolveRotation({ orientation: 1, width: 100, height: 50 }, 100, 50)).toBe(
            1,
        );
        expect(resolveRotation(NO_JPEG_META, 100, 50)).toBe(1);
    });

    // Mirrors and 180° don't change the dimensions, so there is nothing to
    // detect — those trust the "none" the decode asked for.
    it("applies non-swapping orientations as-is", () => {
        for (const orientation of [2, 3, 4]) {
            expect(
                resolveRotation({ orientation, width: 100, height: 50 }, 100, 50),
            ).toBe(orientation);
        }
    });

    it("trusts the tag when there are no stored dimensions to compare", () => {
        // A HEIC, or a JPEG whose frame header wasn't found.
        expect(resolveRotation({ orientation: 6, width: 0, height: 0 }, 3024, 4032)).toBe(
            6,
        );
    });

    // Square is the blind spot: swapped and unswapped are indistinguishable.
    it("trusts the tag for a square image", () => {
        expect(
            resolveRotation({ orientation: 6, width: 2000, height: 2000 }, 2000, 2000),
        ).toBe(6);
    });
});

// ──────────────────────────────────────────────────── THE QUALITY FLOOR

/**
 * The ladder's shape is the whole point of the follow-up: give up PIXELS
 * before giving up quality, because a soft photo of your own car is worse than
 * a smaller sharp one.
 */
describe("the compression ladder", () => {
    it("never proposes a quality below the floor", () => {
        for (const quality of QUALITY_STEPS) {
            expect(quality).toBeGreaterThanOrEqual(MIN_QUALITY);
        }
    });

    it("holds the floor at 0.6", () => {
        expect(MIN_QUALITY).toBe(0.6);
        // The floor has to be reachable, or it isn't a floor.
        expect(QUALITY_STEPS).toContain(MIN_QUALITY);
    });

    it("steps quality down monotonically", () => {
        for (let i = 1; i < QUALITY_STEPS.length; i++) {
            expect(QUALITY_STEPS[i]).toBeLessThan(QUALITY_STEPS[i - 1]);
        }
    });

    it("falls back to 1080px once the floor is reached", () => {
        expect(EDGE_STEPS[0]).toBe(MAX_EDGE);
        expect(EDGE_STEPS[1]).toBe(1080);
    });

    it("steps dimensions down monotonically, and keeps shrinking past 1080", () => {
        for (let i = 1; i < EDGE_STEPS.length; i++) {
            expect(EDGE_STEPS[i]).toBeLessThan(EDGE_STEPS[i - 1]);
        }
        // A pathological image still has to terminate somewhere.
        expect(EDGE_STEPS.length).toBeGreaterThan(2);
    });
});

// ────────────────────────────────────────── PRE-CROPPED ENTRY POINT [phase-C]

/**
 * The editor produces a canvas that has already been cropped and rotated,
 * and hands it to `compressPreparedImage` instead of `compressPhoto`. The
 * critical guarantee to preserve: the ≤ PHOTO_MAX_CHARS budget the rules
 * enforce, which is why this path uses the same EDGE_STEPS × QUALITY_STEPS
 * ladder rather than a separate encode.
 *
 * jsdom implements neither `getContext("2d")` nor a real `toDataURL`, so
 * both are stubbed here — the tests cover the ladder shape and the budget
 * guard, not pixels. The pixel path runs on a real device with the editor
 * open.
 */
describe("compressPreparedImage [phase-C]", () => {
    let previousGetContext:
        | ((this: HTMLCanvasElement, type: string) => unknown)
        | undefined;
    let previousToDataUrl:
        | ((this: HTMLCanvasElement, ...args: unknown[]) => string)
        | undefined;
    let stubbedDataUrl = "";

    beforeEach(() => {
        // A fake 2D context — the encoder only calls fillStyle, fillRect and
        // drawImage; everything else is decoration.
        const fakeContext = {
            fillStyle: "",
            fillRect: () => undefined,
            drawImage: () => undefined,
            transform: () => undefined,
        };
        previousGetContext = HTMLCanvasElement.prototype.getContext as never;
        (HTMLCanvasElement.prototype.getContext as unknown) = function () {
            return fakeContext;
        };

        // A stub toDataURL: length reflects the current canvas dimensions so
        // the ladder actually shrinks the string as it steps down. Quality
        // shaves ~10% per step so the ladder can find a fit within the
        // budget, matching real JPEG behaviour close enough for the guard
        // logic.
        previousToDataUrl = HTMLCanvasElement.prototype.toDataURL as never;
        (HTMLCanvasElement.prototype.toDataURL as unknown) = function (
            this: HTMLCanvasElement,
            _type?: string,
            quality?: number,
        ) {
            const q = typeof quality === "number" ? quality : 0.82;
            const bytesEstimate = Math.round(
                this.width * this.height * 0.3 * q,
            );
            stubbedDataUrl = `data:image/jpeg;base64,${"A".repeat(bytesEstimate)}`;
            return stubbedDataUrl;
        };
    });

    afterEach(() => {
        (HTMLCanvasElement.prototype.getContext as unknown) = previousGetContext;
        (HTMLCanvasElement.prototype.toDataURL as unknown) = previousToDataUrl;
    });

    /** A minimally-shaped canvas the encoder can `drawImage` from. */
    const canvasOf = (width: number, height: number): HTMLCanvasElement => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
    };

    it("returns a data URL within the character budget", async () => {
        const result = await compressPreparedImage(canvasOf(800, 500), 200_000);

        expect(result.dataUrl.length).toBeLessThanOrEqual(200_000);
        expect(result.dataUrl.startsWith("data:image")).toBe(true);
    });

    it("throws PhotoTooLargeError when no ladder step fits", async () => {
        // Byte-tight budget the ladder can't reach even at its smallest.
        await expect(
            compressPreparedImage(canvasOf(5000, 3000), 100),
        ).rejects.toBeInstanceOf(PhotoTooLargeError);
    });

    it("reports the encoded dimensions and the character count", async () => {
        const result = await compressPreparedImage(canvasOf(400, 300), 200_000);

        expect(result.chars).toBe(result.dataUrl.length);
        expect(result.width).toBeGreaterThan(0);
        expect(result.height).toBeGreaterThan(0);
        // The editor is the one deciding orientation, so this path never
        // reports EXIF rotation of its own. [Phase C]
        expect(result.appliedOrientation).toBe(1);
    });

    it("clips the long edge to the ladder's MAX_EDGE when the source is huge", async () => {
        const result = await compressPreparedImage(
            canvasOf(5000, 3000),
            5_000_000,
        );

        const longEdge = Math.max(result.width, result.height);
        expect(longEdge).toBeLessThanOrEqual(MAX_EDGE);
    });
});
