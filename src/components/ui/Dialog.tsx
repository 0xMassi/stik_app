import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface DialogProps {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  backdropClassName?: string;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  titleClassName?: string;
  descriptionClassName?: string;
  labelledBy?: string;
  describedBy?: string;
  closeOnBackdrop?: boolean;
}

export default function Dialog({
  title,
  description,
  children,
  onClose,
  initialFocusRef,
  backdropClassName = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm",
  panelClassName = "rounded-xl border border-line bg-bg shadow-stik",
  panelStyle,
  titleClassName,
  descriptionClassName,
  labelledBy,
  describedBy,
  closeOnBackdrop = false,
}: DialogProps) {
  const generatedTitleId = useId();
  const generatedDescriptionId = useId();
  const titleId = labelledBy ?? (title ? generatedTitleId : undefined);
  const descriptionId = describedBy ?? (description ? generatedDescriptionId : undefined);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const backdrop = panel.parentElement;
    const previousOverflow = document.body.style.overflow;
    const inertStates = new Map<HTMLElement, boolean>();

    document.body.style.overflow = "hidden";
    for (const child of Array.from(document.body.children)) {
      if (!(child instanceof HTMLElement) || child === backdrop) continue;
      inertStates.set(child, child.inert);
      child.inert = true;
    }

    const focusable = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hidden && element.getAttribute("aria-hidden") !== "true",
      );

    (initialFocusRef?.current ?? focusable()[0] ?? panel).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onCloseRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const controls = focusable();
      if (controls.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      for (const [element, wasInert] of inertStates) {
        element.inert = wasInert;
      }
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return createPortal(
    <div
      className={backdropClassName}
      onMouseDown={(event) => {
        if (
          closeOnBackdrop &&
          event.target === event.currentTarget &&
          onCloseRef.current
        ) {
          onCloseRef.current();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={panelClassName}
        style={panelStyle}
      >
        {title && (
          <h2 id={titleId} className={titleClassName}>
            {title}
          </h2>
        )}
        {description && (
          <div id={descriptionId} className={descriptionClassName}>
            {description}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
