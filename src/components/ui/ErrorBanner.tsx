interface ErrorBannerProps {
  message: string;
}

export default function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div
      style={{
        padding: "1rem",
        backgroundColor: "var(--danger-light)",
        color: "var(--danger)",
        borderRadius: "var(--radius-md)",
        marginBottom: "1rem",
        fontSize: "0.9rem",
      }}
    >
      {message}
    </div>
  );
}
