import { useEffect } from "react";
import { Mail, MailCheck, BellRing } from "lucide-react";
import { useLaunchInterestStore } from "../store/launchInterestStore";
import PageHeader from "../components/ui/PageHeader";
import ErrorBanner from "../components/ui/ErrorBanner";
import Spinner from "../components/ui/Spinner";
import EmptyState from "../components/ui/EmptyState";
import Card from "../components/ui/Card";

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
      <PageHeader
        title="Launch Interest Leads"
        subtitle='Customers waiting on "Launching Soon" products.'
      />

      {error && <ErrorBanner message={error} />}

      <Card>
        <div style={{ overflowX: "auto" }}>
          {isLoading && interests.length === 0 ? (
            <Spinner />
          ) : interests.length === 0 ? (
            <EmptyState icon={BellRing} message="No launch-interest leads yet." />
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
                {interests.map((interest) => (
                    <tr
                      key={interest.id}
                      style={{
                        borderBottom: "1px solid var(--border-color)",
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
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
