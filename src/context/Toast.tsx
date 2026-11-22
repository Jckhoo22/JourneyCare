import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import ToastMessage from "../components/toast_message/ToastMessage";

export type ToastType = "success" | "error" | "info";

export interface Toast {
    id: number;
    message: string;
    type: ToastType;
    /** Optional dedupe key. A second toast with the same kind REPLACES the
     *  first (message + timer refresh, id preserved) rather than stacking —
     *  so a coalesced write that fires the same "granted" copy twice in a
     *  row doesn't paint the corner with two identical cards. */
    kind?: string;
}

interface ToastOptions {
    kind?: string;
}

interface ToastContextValue {
    addToast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/** No more than this many toasts visible at once. When a third would be
 *  pushed, the oldest is evicted — a stack past two is noise a phone can't
 *  read fast enough for it to be useful. */
const MAX_VISIBLE = 2;
const AUTO_DISMISS_MS = 4000;

export const useToast = (): ToastContextValue => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    /** Live per-toast dismiss timers. Kept as refs so a `kind`-refresh can
     *  cancel the existing timer and start a new one without leaking. */
    const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

    const clearTimer = useCallback((id: number) => {
        const timer = timersRef.current.get(id);
        if (timer !== undefined) {
            clearTimeout(timer);
            timersRef.current.delete(id);
        }
    }, []);

    const removeToast = useCallback(
        (id: number) => {
            clearTimer(id);
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
        },
        [clearTimer],
    );

    const scheduleDismiss = useCallback(
        (id: number) => {
            clearTimer(id);
            timersRef.current.set(
                id,
                setTimeout(() => removeToast(id), AUTO_DISMISS_MS),
            );
        },
        [clearTimer, removeToast],
    );

    const addToast = useCallback(
        (message: string, type: ToastType = "info", options?: ToastOptions) => {
            const kind = options?.kind;

            setToasts((prev) => {
                // Same-kind replace: keep the id (and its slot in the
                // stack), swap message + type, refresh the timer.
                if (kind) {
                    const existing = prev.find((toast) => toast.kind === kind);
                    if (existing) {
                        scheduleDismiss(existing.id);
                        return prev.map((toast) =>
                            toast.id === existing.id
                                ? { ...toast, message, type }
                                : toast,
                        );
                    }
                }

                // Date.now() alone collides when two toasts fire in the
                // same tick; the random suffix disambiguates.
                const id = Date.now() + Math.random();
                scheduleDismiss(id);
                const next: Toast[] = [...prev, { id, message, type, kind }];
                // Cap: evict the oldest until we're under the limit.
                while (next.length > MAX_VISIBLE) {
                    const dropped = next.shift();
                    if (dropped) clearTimer(dropped.id);
                }
                return next;
            });
        },
        [clearTimer, scheduleDismiss],
    );

    // Cancel every pending dismiss on unmount so the provider doesn't leak
    // timers into a subsequent mount (matters mostly for tests).
    useEffect(() => {
        const timers = timersRef.current;
        return () => {
            timers.forEach((timer) => clearTimeout(timer));
            timers.clear();
        };
    }, []);

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <ToastMessage toasts={toasts} removeToast={removeToast} />
        </ToastContext.Provider>
    );
};
