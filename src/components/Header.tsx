import { Search } from "lucide-react";
import { useAuthStore } from "../store/authStore";

export default function Header() {
  const user = useAuthStore((state) => state.user);

  return (
    <header
      style={{
        height: "70px",
        borderBottom: "1px solid var(--border-color)",
        background: "var(--bg-primary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 2rem",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ position: "relative", width: "300px" }}>
        <Search
          size={18}
          style={{
            position: "absolute",
            left: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-secondary)",
          }}
        />
        <input
          type="text"
          placeholder="Search products, orders..."
          className="input-field"
          style={{
            paddingLeft: "38px",
            borderRadius: "var(--radius-full)",
            background: "var(--bg-secondary)",
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "50%",
            background: "var(--color-brand-gold-light)",
            color: "var(--color-brand-green)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: "0.95rem",
          }}
        >
          {(user?.email?.[0] || "A").toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: "0.88rem", fontWeight: 600 }}>Admin</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            {user?.email}
          </div>
        </div>
      </div>
    </header>
  );
}
