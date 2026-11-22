import { useEffect, useRef, useState } from "react";
import "./QrScanner.css";

interface QrScannerProps {
    /** Called once, with the decoded text, then the camera stops. */
    onResult: (text: string) => void;
    onError: (message: string) => void;
}

const ELEMENT_ID = "qr-scanner-region";

interface Html5QrcodeLike {
    start: (
        camera: { facingMode: string },
        config: { fps: number; qrbox: { width: number; height: number } },
        onDecode: (text: string) => void,
        onFailure: () => void,
    ) => Promise<void>;
    stop: () => Promise<void>;
    clear: () => void;
}

/**
 * Camera QR scanner. [G4]
 *
 * html5-qrcode is ~375 kB and only ever needed by someone who taps Scan, so it
 * is imported dynamically — the main bundle never carries it.
 *
 * **The camera is acquired exactly once per mount.** The effect has an empty
 * dependency list and reads its callbacks through refs, so a parent re-render
 * that hands down new function identities cannot tear the stream down and
 * re-acquire it — which is what made the browser re-prompt for permission on
 * every scan. Teardown waits for start() to settle before stopping, so a
 * fast mount/unmount (React StrictMode does this in development) can't leak a
 * live stream that the next mount would have to request again.
 */
const QrScanner = ({ onResult, onError }: QrScannerProps) => {
    const [isStarting, setIsStarting] = useState(true);

    // Latest callbacks, without them becoming effect dependencies.
    const onResultRef = useRef(onResult);
    const onErrorRef = useRef(onError);

    useEffect(() => {
        onResultRef.current = onResult;
        onErrorRef.current = onError;
    }, [onResult, onError]);

    // Guards against a late decode firing after teardown.
    const decodedRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        let instance: Html5QrcodeLike | null = null;

        // Held so cleanup can await it — stopping mid-start throws and leaves
        // the track running.
        const startup = (async () => {
            try {
                const { Html5Qrcode } = await import("html5-qrcode");
                if (cancelled) return;

                instance = new Html5Qrcode(ELEMENT_ID) as unknown as Html5QrcodeLike;

                await instance.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: { width: 220, height: 220 } },
                    (decodedText: string) => {
                        if (decodedRef.current) return;
                        decodedRef.current = true;
                        onResultRef.current(decodedText);
                    },
                    // Per-frame decode misses are normal; ignore them entirely.
                    () => {},
                );

                if (!cancelled) setIsStarting(false);
            } catch (error: unknown) {
                if (cancelled) return;
                console.error("QR scanner failed to start:", error);
                onErrorRef.current(String(error));
            }
        })();

        return () => {
            cancelled = true;

            // Release the camera only after start() has settled, so the track
            // is always stopped and the grant isn't left dangling.
            void startup.finally(async () => {
                if (!instance) return;
                try {
                    await instance.stop();
                    instance.clear();
                } catch {
                    // Already stopped, or never fully started. Nothing to release.
                }
            });
        };
        // Empty on purpose — see the note above. Callbacks come from refs.
    }, []);

    return (
        <div className="qr-scanner">
            <div id={ELEMENT_ID} className="qr-scanner-region" />
            {isStarting && <p className="qr-scanner-status">…</p>}
        </div>
    );
};

export default QrScanner;
