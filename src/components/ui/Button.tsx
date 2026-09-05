import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "default" | "sm";
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "default",
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    `btn-${variant}`,
    size === "sm" ? "btn-sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="animate-spin" size={18} /> : icon}
      {children}
    </button>
  );
}
