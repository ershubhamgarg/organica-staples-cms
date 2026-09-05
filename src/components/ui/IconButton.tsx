import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  tooltip: string;
  danger?: boolean;
}

export default function IconButton({
  icon,
  tooltip,
  danger = false,
  className = "",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={["icon-btn", danger ? "danger" : "", className]
        .filter(Boolean)
        .join(" ")}
      data-tooltip={tooltip}
      aria-label={tooltip}
      {...rest}
    >
      {icon}
    </button>
  );
}
