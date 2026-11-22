/**
 * Turn a crop-region + rotation into a canvas.
 *
 * `react-easy-crop` reports the crop region (`pixelCrop`) in the coordinate
 * space of the ROTATED image — so the source image is rotated first, then the
 * region is copied out of the rotated pixels. This mirrors the recipe from
 * the react-easy-crop cookbook, hand-inlined so we own the six lines that
 * matter and don't take a dependency on the demo.
 *
 * A canvas is returned rather than a data URL because the caller (the photo
 * editor) hands the result straight to `compressPreparedImage`, which runs
 * the same size ladder every save path uses.
 */

interface PixelCrop {
    x: number;
    y: number;
    width: number;
    height: number;
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        // Cross-origin isn't a concern for our data/object URLs, but this makes
        // the pattern reusable if a remote URL ever gets passed by mistake.
        image.setAttribute("crossOrigin", "anonymous");
        image.addEventListener("load", () => resolve(image));
        image.addEventListener("error", () => reject(new Error("image load failed")));
        image.src = src;
    });

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * The bounding box of `width × height` rotated by `rotation` degrees. Used
 * to size the rotated intermediate canvas so nothing is clipped.
 */
export const rotatedBoundingBox = (
    width: number,
    height: number,
    rotation: number,
): { width: number; height: number } => {
    const radians = toRadians(rotation);
    return {
        width:
            Math.abs(Math.cos(radians) * width) +
            Math.abs(Math.sin(radians) * height),
        height:
            Math.abs(Math.sin(radians) * width) +
            Math.abs(Math.cos(radians) * height),
    };
};

/**
 * Draws `src`, rotated, and returns the pixel region defined by `pixelCrop`
 * out of the rotated result.
 */
export const getCroppedCanvas = async (
    src: string,
    pixelCrop: PixelCrop,
    rotation = 0,
): Promise<HTMLCanvasElement> => {
    const image = await loadImage(src);

    const bBox = rotatedBoundingBox(image.width, image.height, rotation);

    const rotated = document.createElement("canvas");
    rotated.width = bBox.width;
    rotated.height = bBox.height;

    const rotatedContext = rotated.getContext("2d");
    if (!rotatedContext) throw new Error("2d context unavailable");

    // Origin is at the box centre so the rotation pivots around the image
    // centre; the translate that follows undoes it so the image draws from
    // its own top-left, but into rotated pixel space.
    rotatedContext.translate(bBox.width / 2, bBox.height / 2);
    rotatedContext.rotate(toRadians(rotation));
    rotatedContext.translate(-image.width / 2, -image.height / 2);
    rotatedContext.drawImage(image, 0, 0);

    const cropped = document.createElement("canvas");
    cropped.width = Math.max(1, Math.round(pixelCrop.width));
    cropped.height = Math.max(1, Math.round(pixelCrop.height));

    const croppedContext = cropped.getContext("2d");
    if (!croppedContext) throw new Error("2d context unavailable");

    croppedContext.drawImage(
        rotated,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        cropped.width,
        cropped.height,
    );

    return cropped;
};
