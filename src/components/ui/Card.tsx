import type { CSSProperties, ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  padding?: string;
}

export default function Card({ children, style, padding = "1.5rem" }: CardProps) {
  return (
    <div className="card" style={{ padding, ...style }}>
      {children}
    </div>
  );
}
