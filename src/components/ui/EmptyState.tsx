import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  message: string;
}

export default function EmptyState({ icon: Icon, message }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.5rem",
        padding: "3rem 1rem",
        color: "var(--text-secondary)",
      }}
    >
      {Icon && <Icon size={28} color="var(--color-brand-gold-light)" />}
      <span>{message}</span>
    </div>
  );
}
