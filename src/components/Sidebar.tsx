import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Settings,
  Leaf,
  LogOut,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";

export default function Sidebar() {
  const navigate = useNavigate();
  const { signOut, user } = useAuthStore();
  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Package, label: "Products", path: "/products" },
    { icon: ShoppingCart, label: "Orders", path: "/orders" },
    { icon: Users, label: "Customers", path: "/customers" },
    { icon: Settings, label: "Settings", path: "/settings" },
  ];

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <aside
      style={{
        width: "260px",
        backgroundColor: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        padding: "1.5rem",
        gap: "2rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div
          style={{
            background: "var(--accent-light)",
            padding: "8px",
            borderRadius: "var(--radius-md)",
            color: "var(--accent-primary)",
          }}
        >
          <Leaf size={24} />
        </div>
        <h2
          style={{
            fontSize: "1.1rem",
            fontWeight: 700,
            letterSpacing: "-0.3px",
            color: "var(--text-primary)",
          }}
        >
          Amritya Organics <span style={{ color: "var(--accent-primary)" }}>CMS</span>
        </h2>
      </div>

      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
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
                ? "var(--accent-primary)"
                : "var(--text-secondary)",
              backgroundColor: isActive ? "var(--accent-light)" : "transparent",
              textDecoration: "none",
              fontWeight: isActive ? 600 : 500,
              transition: "all 0.2s ease",
            })}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div
        style={{
          borderTop: "1px solid var(--border-color)",
          paddingTop: "1.5rem",
          marginTop: "auto",
        }}
      >
        <div style={{ marginBottom: "1rem", padding: "0 0.5rem" }}>
          <div
            style={{
              fontSize: "0.8rem",
              color: "var(--text-secondary)",
              marginBottom: "4px",
            }}
          >
            Signed in as
          </div>
          <div
            style={{
              fontSize: "0.9rem",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {user?.email}
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="btn-ghost"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            color: "var(--danger)",
            justifyContent: "flex-start",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "inherit",
          }}
        >
          <LogOut size={20} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
