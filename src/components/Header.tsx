import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ShoppingBag, Menu } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { useProductStore } from "../store/productStore";
import { useOrderStore, type Order } from "../store/orderStore";
import { type Product } from "../types/product";
import ProductImage from "./ui/ProductImage";
import IconButton from "./ui/IconButton";
import { getProductThumbnail } from "../utils/productImage";
import { formatCurrency } from "../utils/currency";

interface HeaderProps {
  onMenuClick: () => void;
}

const MAX_RESULTS = 5;

function normalizeHex(input: string): string {
  return input
    .replace(/^ord-?/i, "")
    .replace(/[^a-f0-9]/gi, "")
    .toLowerCase();
}

function matchesOrder(order: Order, query: string, hexQuery: string): boolean {
  if (hexQuery.length >= 4 && order.id.toLowerCase().startsWith(hexQuery)) {
    return true;
  }

  const address = order.delivery_address;
  if (!address) return false;

  return Boolean(
    address.name?.toLowerCase().includes(query) ||
      address.email?.toLowerCase().includes(query) ||
      address.phone?.toLowerCase().includes(query),
  );
}

export default function Header({ onMenuClick }: HeaderProps) {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const products = useProductStore((state) => state.products);
  const fetchProducts = useProductStore((state) => state.fetchProducts);
  const orders = useOrderStore((state) => state.orders);

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (products.length === 0) {
      fetchProducts();
    }
    // Only needs to run once — a lazy top-up for whichever page loads first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const trimmed = query.trim();
  const normalized = trimmed.toLowerCase();
  const hexQuery = normalizeHex(trimmed);

  const matchedProducts = useMemo(() => {
    if (normalized.length < 2) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(normalized))
      .slice(0, MAX_RESULTS);
  }, [products, normalized]);

  const matchedOrders = useMemo(() => {
    if (normalized.length < 2 && hexQuery.length < 4) return [];
    return orders
      .filter((o) => matchesOrder(o, normalized, hexQuery))
      .slice(0, MAX_RESULTS);
  }, [orders, normalized, hexQuery]);

  const hasResults = matchedProducts.length > 0 || matchedOrders.length > 0;
  const showDropdown = isOpen && trimmed.length >= 2;

  const goToProduct = (product: Product) => {
    navigate(`/products?highlight=${product.id}`);
    setQuery("");
    setIsOpen(false);
  };

  const goToOrder = (order: Order) => {
    navigate(`/orders/${order.id}`);
    setQuery("");
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      e.currentTarget.blur();
      return;
    }
    if (e.key === "Enter") {
      if (matchedOrders[0]) {
        goToOrder(matchedOrders[0]);
      } else if (matchedProducts[0]) {
        goToProduct(matchedProducts[0]);
      }
    }
  };

  return (
    <header
      className="app-header"
      style={{
        height: "70px",
        borderBottom: "1px solid var(--border-color)",
        background: "var(--bg-primary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1, minWidth: 0 }}>
        <IconButton
          icon={<Menu size={20} />}
          tooltip="Menu"
          className="header-hamburger"
          onClick={onMenuClick}
        />
        <div
          ref={containerRef}
          className="header-search"
          style={{ position: "relative", width: "340px" }}
        >
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
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search products, orders..."
          className="input-field"
          style={{
            paddingLeft: "38px",
            borderRadius: "var(--radius-full)",
            background: "var(--bg-secondary)",
          }}
        />
        {showDropdown && (
          <div className="search-dropdown">
            {!hasResults && (
              <div className="search-dropdown-empty">
                No matches for &ldquo;{trimmed}&rdquo;
              </div>
            )}
            {matchedProducts.length > 0 && (
              <div className="search-dropdown-group">
                <div className="search-dropdown-label">Products</div>
                {matchedProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className="search-dropdown-item"
                    onClick={() => goToProduct(product)}
                  >
                    <ProductImage
                      src={getProductThumbnail(product)}
                      alt={product.name}
                      size={32}
                    />
                    <div className="search-dropdown-item-text">
                      <div className="search-dropdown-item-title">
                        {product.name}
                      </div>
                      <div className="search-dropdown-item-sub">
                        ₹{formatCurrency(product.price)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {matchedOrders.length > 0 && (
              <div className="search-dropdown-group">
                <div className="search-dropdown-label">Orders</div>
                {matchedOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    className="search-dropdown-item"
                    onClick={() => goToOrder(order)}
                  >
                    <div className="search-dropdown-item-icon">
                      <ShoppingBag size={16} />
                    </div>
                    <div className="search-dropdown-item-text">
                      <div className="search-dropdown-item-title">
                        #ORD-{order.id.slice(0, 8).toUpperCase()} —{" "}
                        {order.delivery_address?.name || "Guest"}
                      </div>
                      <div className="search-dropdown-item-sub">
                        ₹{formatCurrency(order.total_amount)} · {order.status}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
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
            flexShrink: 0,
          }}
        >
          {(user?.email?.[0] || "A").toUpperCase()}
        </div>
        <div className="header-user-text">
          <div style={{ fontSize: "0.88rem", fontWeight: 600 }}>Admin</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            {user?.email}
          </div>
        </div>
      </div>
    </header>
  );
}
