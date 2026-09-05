import { useState } from "react";
import { ImageOff } from "lucide-react";

interface ProductImageProps {
  src: string | null | undefined;
  alt: string;
  size?: number;
  radius?: string;
}

export default function ProductImage({
  src,
  alt,
  size = 44,
  radius = "10px",
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src || failed;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border-color)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {showPlaceholder ? (
        <ImageOff size={Math.max(size * 0.4, 14)} color="var(--text-secondary)" />
      ) : (
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      )}
    </div>
  );
}
