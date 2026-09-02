import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useCustomerStore } from "../store/customerStore";

export default function Customers() {
  const { customers, isLoading, error, fetchCustomers } = useCustomerStore();
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.email.toLowerCase().includes(query) ||
        c.phone.includes(query),
    );
  }, [customers, search]);

  return (
    <div className="animate-fade-in">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "2rem",
          gap: "1rem",
        }}
      >
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">
            Everyone who has placed an order, aggregated from your order
            history.
          </p>
        </div>
        <div style={{ position: "relative", minWidth: "260px" }}>
          <Search
            size={16}
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
            placeholder="Search name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field"
            style={{ paddingLeft: "36px" }}
          />
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "1rem",
            backgroundColor: "var(--danger-light)",
            color: "var(--danger)",
            borderRadius: "8px",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      <div className="glass-card" style={{ padding: "1.5rem" }}>
        <div style={{ overflowX: "auto" }}>
          {isLoading && customers.length === 0 ? (
            <div
              style={{ display: "flex", justifyContent: "center", padding: "2rem" }}
            >
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <table
              style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border-color)",
                    color: "var(--text-secondary)",
                    fontSize: "0.9rem",
                  }}
                >
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>Name</th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>Email</th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>Phone</th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>Orders</th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Total Spent
                  </th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Last Order
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((customer) => (
                    <tr
                      key={customer.email}
                      style={{
                        borderBottom: "1px solid var(--border-color)",
                        transition: "background 0.2s",
                      }}
                    >
                      <td style={{ padding: "16px", fontWeight: 600 }}>
                        {customer.name}
                      </td>
                      <td style={{ padding: "16px", color: "var(--text-secondary)" }}>
                        {customer.email}
                      </td>
                      <td style={{ padding: "16px", color: "var(--text-secondary)" }}>
                        {customer.phone || "—"}
                      </td>
                      <td style={{ padding: "16px" }}>{customer.orderCount}</td>
                      <td style={{ padding: "16px", fontWeight: 600 }}>
                        ₹{customer.totalSpent.toLocaleString()}
                      </td>
                      <td style={{ padding: "16px", color: "var(--text-secondary)" }}>
                        {new Date(customer.lastOrderDate).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: "2rem",
                        textAlign: "center",
                        color: "var(--text-secondary)",
                      }}
                    >
                      No customers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
