import { useEffect } from "react";
import { Loader2, Mail, MailCheck } from "lucide-react";
import { useLaunchInterestStore } from "../store/launchInterestStore";

export default function LaunchInterests() {
  const { interests, isLoading, error, fetchInterests, updateEmailSent } =
    useLaunchInterestStore();

  useEffect(() => {
    fetchInterests();
  }, [fetchInterests]);

  const handleToggleEmailSent = async (id: string, current: boolean) => {
    try {
      await updateEmailSent(id, !current);
    } catch (err) {
      console.error("Failed to update lead:", err);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: "2rem" }}>
        <h1 className="page-title">Launch Interest Leads</h1>
        <p className="page-subtitle">
          Customers waiting on "Launching Soon" products.
        </p>
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
          {isLoading && interests.length === 0 ? (
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
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>Product</th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>Customer</th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>Email</th>
                  <th style={{ padding: "12px 16px", fontWeight: 500 }}>
                    Submitted
                  </th>
                  <th
                    style={{
                      padding: "12px 16px",
                      fontWeight: 500,
                      textAlign: "right",
                    }}
                  >
                    Follow-up
                  </th>
                </tr>
              </thead>
              <tbody>
                {interests.length > 0 ? (
                  interests.map((interest) => (
                    <tr
                      key={interest.id}
                      style={{
                        borderBottom: "1px solid var(--border-color)",
                        transition: "background 0.2s",
                      }}
                    >
                      <td style={{ padding: "16px", fontWeight: 600 }}>
                        {interest.products?.name || `#${interest.product_id}`}
                      </td>
                      <td style={{ padding: "16px" }}>{interest.customer_name}</td>
                      <td style={{ padding: "16px", color: "var(--text-secondary)" }}>
                        {interest.customer_email}
                      </td>
                      <td style={{ padding: "16px", color: "var(--text-secondary)" }}>
                        {new Date(interest.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: "16px", textAlign: "right" }}>
                        <button
                          className="btn-ghost"
                          onClick={() =>
                            handleToggleEmailSent(
                              interest.id,
                              interest.email_sent,
                            )
                          }
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            marginLeft: "auto",
                          }}
                        >
                          {interest.email_sent ? (
                            <span className="badge badge-success">
                              <MailCheck size={12} style={{ marginRight: "4px" }} />
                              Notified
                            </span>
                          ) : (
                            <span className="badge badge-warning">
                              <Mail size={12} style={{ marginRight: "4px" }} />
                              Pending
                            </span>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        padding: "2rem",
                        textAlign: "center",
                        color: "var(--text-secondary)",
                      }}
                    >
                      No launch-interest leads yet.
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
