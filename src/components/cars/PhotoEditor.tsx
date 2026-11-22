import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Minus, Plus, RotateCw } from "lucide-react";
import "./PhotoEditor.css";

import { useLanguage } from "../../context/LanguageContext";
import { Button, Modal } from "../ui";
import { getCroppedCanvas } from "../../utils/cropCanvas";

/**
 * The aspect ratio the crop is locked to.
 *
 * 16:9 matches every display container in the app — the hero card on
 * CarDetail, the media container in the EditCar photo section, and the
 * 96×64 (=16:10.67, close enough that object-cover doesn't matter) list
 * thumbnails all crop cleanly from a 16:9 source. Locking here means the
 * user's crop and the app's display are the same rectangle: no
 * letterboxing, no surprise re-crop when the image lands on the page.
 */
export const CAR_PHOTO_ASPECT = 16 / 9;

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;

interface PhotoEditorProps {
    /**
     * Object URL or data URL for the image the user is editing. The editor
     * assumes it is already upright (HEIC decoded, EXIF applied). Ownership
     * of the URL — creating it, revoking it — sits with the caller.
     */
    src: string;
    /** Called with the cropped canvas — the caller then compresses and saves. */
    onConfirm: (canvas: HTMLCanvasElement) => void;
    /** Called when the user cancels or dismisses the modal (including Esc). */
    onCancel: () => void;
    /** True while the caller is compressing/saving the confirmed crop. */
    isSaving?: boolean;
}

/**
 * Crop / rotate editor. [phase-C, Cropper redesign, Modal shell fix]
 *
 * ── Modal shell ─────────────────────────────────────────────────────────
 * Consumes the shared `Modal` shell — same dialog primitive as PartDialog.
 * The old bespoke `<dialog>` here left the same "panel stretches to
 * viewport height on desktop" bug that Modal now fixes centrally; migrating
 * removed the duplication that let it ship in two places.
 *
 * ── Structure inside the shell ─────────────────────────────────────────
 *   Modal header      title + close X (from Modal)
 *   Modal body (flush): stage — dark crop surface (react-easy-crop)
 *                       tools — rotate + zoom slider framed by ± buttons
 *   Modal footer      Cancel + Save (passed in)
 *
 * `flush` on the Modal body strips its default padding + gap so the dark
 * crop stage sits edge-to-edge, matching the pre-migration look. The dark
 * surround still only lives INSIDE the stage — the modal's rounded corners
 * clip the whole shell.
 *
 * ── Aspect lock ─────────────────────────────────────────────────────────
 * Aspect is fixed at 16:9. The library still supports free-form crop; we
 * don't expose it because a variable-aspect crop landing in a fixed 16:9
 * container would either letterbox or re-crop the user's selection
 * silently — either behaviour is worse than not offering the freedom.
 *
 * ── Zoom slider ─────────────────────────────────────────────────────────
 * `zoomWithScroll` on the cropper still handles wheel + pinch. The
 * slider is an ADDITIONAL affordance for anyone on a touchpad-less
 * desktop, and the ± buttons flanking it are keyboard-visible entry
 * points that step by ZOOM_STEP.
 *
 * Two safeguards for the caller: Save is disabled until the cropper has
 * reported a `croppedAreaPixels` (a first-load click would otherwise
 * hand back a null region), and every control is disabled when the
 * caller sets `isSaving`.
 */
const PhotoEditor = ({
    src,
    onConfirm,
    onCancel,
    isSaving = false,
}: PhotoEditorProps) => {
    const { locale } = useLanguage();
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

    const handleCropComplete = useCallback((_area: Area, pixels: Area) => {
        setCroppedAreaPixels(pixels);
    }, []);

    const handleRotate = () => setRotation((current) => (current + 90) % 360);

    const stepZoom = (delta: number) =>
        setZoom((current) => {
            const next = Math.round((current + delta) * 100) / 100;
            return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
        });

    const handleSave = async () => {
        if (!croppedAreaPixels) return;
        try {
            const canvas = await getCroppedCanvas(
                src,
                croppedAreaPixels,
                rotation,
            );
            onConfirm(canvas);
        } catch (error) {
            console.error("Cropping failed:", error);
            // Fall through — the modal stays open so the user can try again.
        }
    };

    const controlsDisabled = isSaving;

    return (
        <Modal
            title={locale.cars.photoEditTitle}
            onClose={onCancel}
            closeLabel={locale.cars.photoEditCancel}
            isBusy={isSaving}
            size="2xl"
            flush
            footer={
                <>
                    <Button
                        variant="secondary"
                        inline
                        onClick={onCancel}
                        disabled={isSaving}
                        label={locale.cars.photoEditCancel}
                    />
                    <Button
                        variant="primary"
                        inline
                        onClick={handleSave}
                        disabled={isSaving || !croppedAreaPixels}
                        label={
                            isSaving
                                ? locale.common.processing
                                : locale.cars.photoEditSave
                        }
                    />
                </>
            }
        >
            <div
                className={`photo-editor-content ${
                    isSaving ? "photo-editor-content-busy" : ""
                }`}
            >
                <div className="photo-editor-stage">
                    <Cropper
                        image={src}
                        crop={crop}
                        zoom={zoom}
                        rotation={rotation}
                        aspect={CAR_PHOTO_ASPECT}
                        minZoom={MIN_ZOOM}
                        maxZoom={MAX_ZOOM}
                        showGrid
                        zoomWithScroll
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onRotationChange={setRotation}
                        onCropComplete={handleCropComplete}
                    />
                </div>

                <div className="photo-editor-tools">
                    <button
                        type="button"
                        className="photo-editor-tool"
                        onClick={handleRotate}
                        disabled={controlsDisabled}
                        aria-label={locale.cars.photoEditRotate}
                        title={locale.cars.photoEditRotate}
                    >
                        <RotateCw
                            size={16}
                            strokeWidth={2}
                            aria-hidden="true"
                        />
                    </button>

                    <div
                        className="photo-editor-zoom"
                        role="group"
                        aria-label={locale.cars.photoEditZoom}
                    >
                        <button
                            type="button"
                            className="photo-editor-tool"
                            onClick={() => stepZoom(-ZOOM_STEP)}
                            disabled={controlsDisabled || zoom <= MIN_ZOOM}
                            aria-label={locale.cars.photoEditZoomOut}
                            title={locale.cars.photoEditZoomOut}
                        >
                            <Minus
                                size={16}
                                strokeWidth={2}
                                aria-hidden="true"
                            />
                        </button>
                        <input
                            type="range"
                            className="photo-editor-zoom-slider"
                            min={MIN_ZOOM}
                            max={MAX_ZOOM}
                            step={ZOOM_STEP}
                            value={zoom}
                            onChange={(event) =>
                                setZoom(Number(event.target.value))
                            }
                            disabled={controlsDisabled}
                            aria-label={locale.cars.photoEditZoom}
                        />
                        <button
                            type="button"
                            className="photo-editor-tool"
                            onClick={() => stepZoom(ZOOM_STEP)}
                            disabled={controlsDisabled || zoom >= MAX_ZOOM}
                            aria-label={locale.cars.photoEditZoomIn}
                            title={locale.cars.photoEditZoomIn}
                        >
                            <Plus
                                size={16}
                                strokeWidth={2}
                                aria-hidden="true"
                            />
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default PhotoEditor;
