import type { ReactNode } from "react";
import CopyButton from "./CopyButton";

interface InfoRowProps {
  label: string;
  value: ReactNode;
  copyValue?: string | null;
  copyLabel?: string;
  mono?: boolean;
  valueColor?: string;
  stacked?: boolean;
}

export default function InfoRow({
  label,
  value,
  copyValue,
  copyLabel,
  mono,
  valueColor,
  stacked = false,
}: InfoRowProps) {
  return (
    <div className={stacked ? "info-row info-row-stacked" : "info-row"}>
      <span className="info-row-label">{label}</span>
      <span
        className="info-row-value"
        style={{
          fontFamily: mono ? "monospace" : undefined,
          color: valueColor,
        }}
      >
        {value}
        {copyValue && (
          <CopyButton value={copyValue} label={copyLabel ?? label} />
        )}
      </span>
    </div>
  );
}
