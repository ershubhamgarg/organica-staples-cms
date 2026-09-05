import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  iconColor?: string;
  maxWidth?: string;
  children: ReactNode;
  closeDisabled?: boolean;
}

// Rendered via a portal directly into document.body. The rest of the app
// wraps every page in `.animate-fade-in`, which uses
// `animation-fill-mode: forwards` — that permanently leaves a non-`none`
// `transform` on the page wrapper after the fade-in finishes, and a
// transformed ancestor becomes a new containing block for
// `position: fixed` descendants. A modal nested inside that wrapper would
// position itself relative to the scrollable content column instead of
// the viewport (needing a scroll to even see it). Escaping to `body` via
// a portal sidesteps that entirely, regardless of any ancestor's
// transform/overflow.
export default function Modal({
  onClose,
  title,
  icon,
  iconColor = "var(--danger)",
  maxWidth = "440px",
  children,
  closeDisabled = false,
}: ModalProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !closeDisabled) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, closeDisabled]);

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !closeDisabled) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: "90%",
          maxWidth,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "2rem",
          position: "relative",
        }}
      >
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          disabled={closeDisabled}
          aria-label="Close"
          style={{ position: "absolute", top: "1rem", right: "1rem" }}
        >
          <X size={20} />
        </button>
        <h2
          style={{
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            paddingRight: "2rem",
          }}
        >
          {icon && <span style={{ color: iconColor, display: "flex" }}>{icon}</span>}
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
