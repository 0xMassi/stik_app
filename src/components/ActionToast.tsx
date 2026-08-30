import { useEffect, useState } from "react";

interface ActionToastProps {
  message: string;
  onDone: () => void;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  durationMs?: number;
}

export default function ActionToast({
  message,
  onDone,
  actionLabel,
  onAction,
  durationMs = 5000,
}: ActionToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsVisible(true));
    const timer = window.setTimeout(onDone, durationMs);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [durationMs, message, onDone]);

  const handleAction = () => {
    void onAction?.();
    onDone();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        fixed bottom-6 left-1/2 -translate-x-1/2 z-[250]
        flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-stik
        text-[13px] font-medium bg-ink text-bg
        transition-all duration-200 ease-out
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
      `}
    >
      <span>{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={handleAction}
          className="rounded-md px-1.5 py-0.5 font-semibold text-coral hover:bg-bg/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
