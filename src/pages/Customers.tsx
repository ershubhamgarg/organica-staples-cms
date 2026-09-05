import { useEffect, useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { useCustomerStore } from "../store/customerStore";
import PageHeader from "../components/ui/PageHeader";
import ErrorBanner from "../components/ui/ErrorBanner";
import Spinner from "../components/ui/Spinner";
import EmptyState from "../components/ui/EmptyState";
import Card from "../components/ui/Card";

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
      <PageHeader
        title="Customers"
        subtitle="Everyone who has placed an order, aggregated from your order history."
        action={
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
        }
      />

      {error && <ErrorBanner message={error} />}

      <Card>
        <div style={{ overflowX: "auto" }}>
          {isLoading && customers.length === 0 ? (
            <Spinner />
          ) : filteredCustomers.length === 0 ? (
            <EmptyState
              icon={Users}
              message={
                search ? "No customers match your search." : "No customers found."
              }
            />
          ) : (
            <table style={{ width: "100%", textAlign: "left" }}>
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
                {filteredCustomers.map((customer) => (
                  <tr
                    key={customer.email}
                    style={{ borderBottom: "1px solid var(--border-color)" }}
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
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
