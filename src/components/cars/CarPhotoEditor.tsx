import {
    lazy,
    Suspense,
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
} from "react";
import { Camera, Car as CarIcon, Trash2 } from "lucide-react";
import "./CarPhotoEditor.css";

import { ConfirmDialog } from "../ui";
import { useLanguage } from "../../context/LanguageContext";
import { useToast } from "../../context/Toast";
import { carDisplayName, type Car } from "../../model/Car";
import {
    PhotoTooLargeError,
    PhotoUnreadableError,
    compressPreparedImage,
    prepareFileForEditor,
} from "../../utils/imageCompress";

// Lazy-loaded so react-easy-crop stays out of the initial bundle — the
// editor is only fetched when a user opens it. Matches the QrScanner
// pattern for the same reason.
const PhotoEditor = lazy(() => import("./PhotoEditor"));

interface CarPhotoEditorProps {
    car: Car;
    /** Called with a compressed JPEG data URL, or `null` to remove. */
    onSave: (dataUrl: string | null) => Promise<boolean>;
    /** Parent's save-in-flight flag. */
    isSaving: boolean;
}

/**
 * A source URL for the crop/rotate editor, plus how to dispose of it. Data
 * URLs are copied by the caller; object URLs from a picked file need to be
 * revoked or they leak.
 */
interface EditorSource {
    url: string;
    revoke: () => void;
}

/**
 * The car photo's edit UI, used on the Edit car screen. [C5, Photo redesign]
 *
 * ── What the section is ───────────────────────────────────────────────────
 * The image IS the section. A 16:9 container, rounded, hairline border —
 * the same visual treatment other cards in the app use. It renders one of
 * two states in the same box so the layout never shifts when the photo
 * changes:
 *
 *   • photo    → the JPEG, `object-fit: cover`, `object-position: center 60%`
 *   • no photo → the lucide car mark, centered at ~60% width on a muted
 *                gray surface so it reads as a deliberate placeholder rather
 *                than a stretched graphic
 *
 * `imageUrl` is deliberately absent from the precedence: the CarImages API
 * (C4) was stripped, and reviving it needs a new spec item. See
 * `specs/CONTEXT.md § the CarImages gate`.
 *
 * ── Actions ───────────────────────────────────────────────────────────────
 * Actions live ON the image as overlay pills anchored bottom-right with an
 * 8px inset. Two shapes:
 *
 *   • no photo → one "Add photo" pill (camera icon + label)
 *   • photo    → "Change photo" pill + a compact icon-only Remove pill
 *
 * "Change photo" is the single ingress into the picker — the file input
 * feeds prepare → editor → save, which is the same pipeline as before.
 * Remove is destructive so it opens the shared ConfirmDialog rather than
 * writing immediately. The Remove pill only exists when a custom photo
 * does; the illustration state doesn't render one, because there is nothing
 * to remove.
 *
 * ── Working state ─────────────────────────────────────────────────────────
 * While `prepare` or `compress` is running the image dims to 60% and the
 * primary pill shows a spinner + "Saving…". Interaction is blocked via
 * `disabled` on the pill and on the underlying file input.
 *
 * ── Pipeline is UNCHANGED ─────────────────────────────────────────────────
 * `prepareFileForEditor` decodes HEIC and applies EXIF orientation, the
 * cropped canvas is fed to `compressPreparedImage`, and the result is a
 * JPEG data URL passed to `onSave` — identical write shape, identical
 * ≤350k-char rules guard on the receiving side.
 */
const CarPhotoEditor = ({ car, onSave, isSaving }: CarPhotoEditorProps) => {
    const { locale } = useLanguage();
    const { addToast } = useToast();

    const inputRef = useRef<HTMLInputElement>(null);
    const [isWorking, setIsWorking] = useState(false);
    const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);
    const [editorSource, setEditorSource] = useState<EditorSource | null>(null);

    // Revoke any lingering object URL on unmount. The happy path revokes as
    // soon as the editor closes; this belt-and-braces catches the case
    // where the parent unmounts while the modal is still open.
    useEffect(() => () => editorSource?.revoke(), [editorSource]);

    const reportPhotoError = (error: unknown) => {
        if (error instanceof PhotoTooLargeError) {
            addToast(locale.cars.photoTooLarge, "error");
        } else if (error instanceof PhotoUnreadableError) {
            addToast(locale.cars.photoUnreadable, "error");
        } else {
            console.error("Photo processing failed:", error);
            addToast(locale.cars.photoUnreadable, "error");
        }
    };

    const openEditorFromFile = async (file: File) => {
        setIsWorking(true);
        try {
            const canvas = await prepareFileForEditor(file);
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/jpeg", 0.92),
            );
            if (!blob) throw new PhotoUnreadableError();

            const url = URL.createObjectURL(blob);
            setEditorSource({ url, revoke: () => URL.revokeObjectURL(url) });
        } catch (error) {
            reportPhotoError(error);
        } finally {
            setIsWorking(false);
        }
    };

    const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        // Reset immediately so picking the SAME file twice still fires change.
        event.target.value = "";
        if (!file) return;

        await openEditorFromFile(file);
    };

    const closeEditor = () => {
        editorSource?.revoke();
        setEditorSource(null);
    };

    const handleEditorConfirm = async (canvas: HTMLCanvasElement) => {
        setIsWorking(true);
        try {
            const compressed = await compressPreparedImage(canvas);
            const saved = await onSave(compressed.dataUrl);
            if (saved) closeEditor();
        } catch (error) {
            reportPhotoError(error);
        } finally {
            setIsWorking(false);
        }
    };

    const openPicker = () => inputRef.current?.click();
    const busy = isWorking || isSaving;
    const hasPhoto = Boolean(car.photo);

    const primaryLabel = busy
        ? locale.common.processing
        : hasPhoto
          ? locale.cars.photoChange
          : locale.cars.photoAdd;

    return (
        <section
            className={`car-photo-editor ${busy ? "car-photo-editor-busy" : ""}`}
            aria-label={locale.cars.photoTitle}
        >
            <div
                className={`car-photo-editor-media ${
                    hasPhoto ? "" : "car-photo-editor-media-empty"
                }`}
            >
                {hasPhoto ? (
                    <img
                        className="car-photo-editor-image"
                        src={car.photo!}
                        alt={carDisplayName(car)}
                    />
                ) : (
                    <CarIcon
                        className="car-photo-editor-illustration"
                        strokeWidth={1.25}
                        aria-hidden="true"
                    />
                )}

                {/* `capture` asks a phone for the camera directly; a desktop
                    browser ignores it and opens the file picker, which is
                    exactly the behaviour we want on each.

                    Explicit .heic/.heif extensions matter on desktop:
                    `image/*` alone greys out an iPhone photo copied to a
                    Mac, because the OS doesn't always map the extension to
                    an image MIME type. The pipeline decodes them where the
                    platform can. */}
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*,.heic,.heif"
                    capture="environment"
                    className="car-photo-editor-input"
                    onChange={handleFile}
                    disabled={busy}
                />

                {/* Overlay pill(s), anchored bottom-right with an 8px
                    inset. Sized off `--tap-min` so a phone tap never falls
                    below 44px even though the pill reads as compact. */}
                <div className="car-photo-editor-overlay">
                    <button
                        type="button"
                        className="car-photo-editor-pill car-photo-editor-pill-primary"
                        onClick={openPicker}
                        disabled={busy}
                    >
                        {busy ? (
                            <span
                                className="car-photo-editor-spinner"
                                aria-hidden="true"
                            />
                        ) : (
                            <Camera
                                size={16}
                                strokeWidth={2.5}
                                aria-hidden="true"
                            />
                        )}
                        <span>{primaryLabel}</span>
                    </button>

                    {hasPhoto && (
                        <button
                            type="button"
                            className="car-photo-editor-pill car-photo-editor-pill-remove"
                            onClick={() => setIsConfirmingRemove(true)}
                            disabled={busy}
                            aria-label={locale.cars.photoRemove}
                            title={locale.cars.photoRemove}
                        >
                            <Trash2
                                size={16}
                                strokeWidth={2.5}
                                aria-hidden="true"
                            />
                        </button>
                    )}
                </div>
            </div>

            {isConfirmingRemove && (
                <ConfirmDialog
                    title={locale.cars.photoRemoveTitle}
                    prompt={locale.cars.photoRemoveConfirm}
                    confirmLabel={locale.cars.photoRemove}
                    cancelLabel={locale.cars.odometerCancel}
                    onConfirm={async () => {
                        setIsConfirmingRemove(false);
                        await onSave(null);
                    }}
                    onCancel={() => setIsConfirmingRemove(false)}
                    isBusy={busy}
                    busyLabel={locale.common.processing}
                />
            )}

            {editorSource && (
                <Suspense fallback={null}>
                    <PhotoEditor
                        src={editorSource.url}
                        onConfirm={handleEditorConfirm}
                        onCancel={closeEditor}
                        isSaving={busy}
                    />
                </Suspense>
            )}
        </section>
    );
};

export default CarPhotoEditor;
