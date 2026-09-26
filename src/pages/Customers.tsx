import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { useCustomerStore, type Customer } from "../store/customerStore";
import { useMasterStore } from "../store/masterStore";
import PageHeader from "../components/ui/PageHeader";
import ErrorBanner from "../components/ui/ErrorBanner";
import Spinner from "../components/ui/Spinner";
import EmptyState from "../components/ui/EmptyState";
import Card from "../components/ui/Card";
import CopyButton from "../components/ui/CopyButton";
import Button from "../components/ui/Button";
import { formatCurrency } from "../utils/currency";
import { daysSince, isReorderDue } from "../utils/reorderReminder";
import {
  buildReorderReminderMessage,
  formatWhatsAppNumber,
  getWhatsAppLink,
} from "../utils/whatsapp";

export default function Customers() {
  const { customers, isLoading, error, fetchCustomers } = useCustomerStore();
  const reminderDays = useMasterStore(
    (state) => state.settings.reorder_reminder_days,
  );
  const fetchMasters = useMasterStore((state) => state.fetchSettings);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchCustomers();
    fetchMasters();
  }, [fetchCustomers, fetchMasters]);

  const handleSendReminder = (customer: Customer) => {
    const phone = formatWhatsAppNumber(customer.phone);
    if (!phone) {
      toast.error("No phone number on file for this customer.");
      return;
    }
    const message = buildReorderReminderMessage(
      customer.name,
      daysSince(customer.lastOrderDate),
    );
    const opened = window.open(getWhatsAppLink(phone, message), "_blank");
    if (!opened) {
      toast.error(
        "Your browser blocked the WhatsApp popup — please allow popups for this site and try again.",
      );
    }
  };

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
                  <th
                    style={{
                      padding: "12px 16px",
                      fontWeight: 500,
                      textAlign: "right",
                    }}
                  >
                    Reminder
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => {
                  const due = isReorderDue(customer, reminderDays);
                  return (
                  <tr
                    key={customer.email}
                    style={{
                      borderBottom: "1px solid var(--border-color)",
                      ...(due
                        ? {
                            background: "rgba(197, 160, 40, 0.10)",
                            boxShadow: "inset 3px 0 0 var(--color-brand-gold)",
                          }
                        : {}),
                    }}
                  >
                    <td style={{ padding: "16px", fontWeight: 600 }}>
                      {customer.name}
                    </td>
                    <td style={{ padding: "16px", color: "var(--text-secondary)" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        {customer.email}
                        <CopyButton value={customer.email} label="Email" />
                      </div>
                    </td>
                    <td style={{ padding: "16px", color: "var(--text-secondary)" }}>
                      {customer.phone ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          {customer.phone}
                          <CopyButton value={customer.phone} label="Phone" />
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ padding: "16px" }}>{customer.orderCount}</td>
                    <td style={{ padding: "16px", fontWeight: 600 }}>
                      ₹{formatCurrency(customer.totalSpent)}
                    </td>
                    <td style={{ padding: "16px", color: "var(--text-secondary)" }}>
                      {new Date(customer.lastOrderDate).toLocaleDateString()}
                      {due && (
                        <div
                          className="badge badge-warning"
                          style={{ marginTop: "4px" }}
                        >
                          {daysSince(customer.lastOrderDate)} days ago
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "16px", textAlign: "right" }}>
                      {due && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<MessageCircle size={14} />}
                          disabled={!formatWhatsAppNumber(customer.phone)}
                          onClick={() => handleSendReminder(customer)}
                          data-tooltip={
                            formatWhatsAppNumber(customer.phone)
                              ? undefined
                              : "No phone number on file"
                          }
                        >
                          Send Reminder
                        </Button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
