import { Loader2 } from "lucide-react";

interface SpinnerProps {
  size?: number;
  padding?: string;
}

export default function Spinner({ size = 32, padding = "2rem" }: SpinnerProps) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding }}>
      <Loader2 className="animate-spin" size={size} color="var(--accent-primary)" />
    </div>
  );
}
