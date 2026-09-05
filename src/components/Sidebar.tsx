import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  Users,
  LogOut,
  Percent,
  Bell,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import logoMark from "../assets/annvriksh-mark.png";

export default function Sidebar() {
  const navigate = useNavigate();
  const { signOut, user } = useAuthStore();
  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Package, label: "Products", path: "/products" },
    { icon: Boxes, label: "Inventory", path: "/inventory" },
    { icon: ShoppingCart, label: "Orders", path: "/orders" },
    { icon: Percent, label: "Coupons", path: "/coupons" },
    { icon: Bell, label: "Launch Interests", path: "/launch-interests" },
    { icon: Users, label: "Customers", path: "/customers" },
  ];

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <aside
      style={{
        width: "260px",
        backgroundColor: "var(--color-brand-green)",
        display: "flex",
        flexDirection: "column",
        padding: "1.5rem",
        gap: "2rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <img
          src={logoMark}
          alt="ANNVRIKSH"
          style={{ width: "36px", height: "36px", objectFit: "contain" }}
        />
        <div>
          <h2
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: "1.15rem",
              fontWeight: 600,
              letterSpacing: "0.03em",
              color: "var(--color-brand-cream)",
              lineHeight: 1.1,
            }}
          >
            ANNVRIKSH
          </h2>
          <span
            style={{
              fontSize: "0.65rem",
              fontWeight: 600,
              letterSpacing: "0.15em",
              color: "var(--color-brand-gold-light)",
            }}
          >
            CMS
          </span>
        </div>
      </div>

      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.35rem",
          flex: 1,
        }}
      >
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              borderRadius: "var(--radius-md)",
              color: isActive
                ? "var(--color-brand-green)"
                : "rgba(253, 251, 247, 0.65)",
              backgroundColor: isActive
                ? "var(--color-brand-gold-light)"
                : "transparent",
              textDecoration: "none",
              fontWeight: isActive ? 600 : 500,
              fontSize: "0.92rem",
              transition: "all 0.2s ease",
            })}
          >
            <item.icon size={19} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div
        style={{
          borderTop: "1px solid rgba(253, 251, 247, 0.12)",
          paddingTop: "1.5rem",
          marginTop: "auto",
        }}
      >
        <div style={{ marginBottom: "1rem", padding: "0 0.5rem" }}>
          <div
            style={{
              fontSize: "0.75rem",
              color: "rgba(253, 251, 247, 0.5)",
              marginBottom: "4px",
            }}
          >
            Signed in as
          </div>
          <div
            style={{
              fontSize: "0.88rem",
              fontWeight: 600,
              color: "var(--color-brand-cream)",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {user?.email}
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            color: "rgba(253, 251, 247, 0.65)",
            justifyContent: "flex-start",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "0.92rem",
            fontWeight: 500,
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(253, 251, 247, 0.08)";
            e.currentTarget.style.color = "var(--color-brand-cream)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
            e.currentTarget.style.color = "rgba(253, 251, 247, 0.65)";
          }}
        >
          <LogOut size={19} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
