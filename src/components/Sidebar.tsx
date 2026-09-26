import { useEffect, useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  Users,
  LogOut,
  Percent,
  Blocks,
  Bell,
  BarChart3,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useCustomerStore } from "../store/customerStore";
import { useMasterStore } from "../store/masterStore";
import { isReorderDue } from "../utils/reorderReminder";
import logoMark from "../assets/annvriksh-mark.png";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const navigate = useNavigate();
  const { signOut, user } = useAuthStore();
  const customers = useCustomerStore((state) => state.customers);
  const fetchCustomers = useCustomerStore((state) => state.fetchCustomers);
  const reminderDays = useMasterStore(
    (state) => state.settings.reorder_reminder_days,
  );
  const fetchMasters = useMasterStore((state) => state.fetchSettings);

  useEffect(() => {
    fetchCustomers();
    fetchMasters();
  }, [fetchCustomers, fetchMasters]);

  // Customers due a reorder reminder — surfaced as a badge on the menu item
  // so it's noticeable without opening the Customers screen.
  const dueCustomerCount = useMemo(
    () => customers.filter((c) => isReorderDue(c, reminderDays)).length,
    [customers, reminderDays],
  );

  const navItems: {
    icon: typeof Users;
    label: string;
    path: string;
    badge?: number;
  }[] = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Package, label: "Products", path: "/products" },
    { icon: Boxes, label: "Inventory", path: "/inventory" },
    { icon: ShoppingCart, label: "Orders", path: "/orders" },
    { icon: BarChart3, label: "Sales Reports", path: "/sales-reports" },
    { icon: Percent, label: "Coupons", path: "/coupons" },
    { icon: Blocks, label: "Combos", path: "/combos" },
    { icon: Bell, label: "Launch Interests", path: "/launch-interests" },
    { icon: Users, label: "Customers", path: "/customers", badge: dueCustomerCount },
    { icon: SlidersHorizontal, label: "Masters", path: "/masters" },
  ];

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <aside
      className={isOpen ? "sidebar sidebar-open" : "sidebar"}
      style={{
        width: "260px",
        backgroundColor: "var(--color-brand-green)",
        display: "flex",
        flexDirection: "column",
        padding: "1.5rem",
        gap: "2rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
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
        <button
          type="button"
          className="sidebar-close"
          onClick={onClose}
          aria-label="Close menu"
          style={{
            background: "none",
            border: "none",
            color: "var(--color-brand-cream)",
            cursor: "pointer",
            padding: "4px",
          }}
        >
          <X size={22} />
        </button>
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
            onClick={onClose}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              borderRadius: "var(--radius-md)",
              color: isActive
                ? "var(--color-brand-green)"
                : item.badge
                  ? "var(--color-brand-gold-light)"
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
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.badge ? (
              <span
                title={`${item.badge} customer${item.badge === 1 ? "" : "s"} due a reorder reminder`}
                style={{
                  minWidth: "22px",
                  padding: "1px 7px",
                  borderRadius: "var(--radius-full)",
                  background: "var(--color-brand-gold)",
                  color: "var(--color-brand-green)",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  textAlign: "center",
                  boxShadow: "0 0 0 3px rgba(197, 160, 40, 0.25)",
                }}
              >
                {item.badge}
              </span>
            ) : null}
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
