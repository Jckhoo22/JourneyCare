import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import type { Toast, ToastType } from "../../context/Toast";
import "./ToastMessage.css";

interface ToastMessageProps {
    toasts: Toast[];
    removeToast: (id: number) => void;
}

const ToastMessage = ({ toasts, removeToast }: ToastMessageProps) => {
    // Helper to get the right icon based on type
    const getIcon = (type: ToastType) => {
        switch (type) {
            case "success":
                return <CheckCircle size={20} />;
            case "error":
                return <AlertCircle size={20} />;
            default:
                return <Info size={20} />;
        }
    };

    return (
        <div className="toast-container">
            {toasts.map((toast) => (
                <div key={toast.id} className={`toast toast-${toast.type} slide-in`}>
                    <div className="toast-icon">{getIcon(toast.type)}</div>

                    <span className="toast-content">{toast.message}</span>

                    <button
                        onClick={() => removeToast(toast.id)}
                        className="toast-close-btn"
                    >
                        <X size={16} />
                    </button>
                </div>
            ))}
        </div>
    );
};

export default ToastMessage;
