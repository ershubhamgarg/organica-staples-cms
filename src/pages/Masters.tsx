import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { useMasterStore } from "../store/masterStore";
import PageHeader from "../components/ui/PageHeader";
import ErrorBanner from "../components/ui/ErrorBanner";
import Spinner from "../components/ui/Spinner";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";

export default function Masters() {
  const { settings, isLoading, isSaving, error, fetchSettings, updateSettings } =
    useMasterStore();
  // null = untouched, so the input tracks whatever's saved without syncing
  // store → state in an effect.
  const [draftDays, setDraftDays] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const value = draftDays ?? String(settings.reorder_reminder_days);
  const parsed = Number(value);
  const isValid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 365;
  const isDirty = draftDays !== null && parsed !== settings.reorder_reminder_days;

  const handleSave = async () => {
    if (!isValid) {
      toast.error("Enter a whole number of days between 1 and 365.");
      return;
    }
    try {
      await updateSettings({ reorder_reminder_days: parsed });
      setDraftDays(null);
      toast.success("Masters updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Masters"
        subtitle="Business rules that drive automated highlights and reminders across the CMS."
      />

      {error && <ErrorBanner message={error} />}

      <Card>
        {isLoading ? (
          <Spinner />
        ) : (
          <div style={{ maxWidth: "460px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "1.25rem",
              }}
            >
              <BellRing size={20} color="var(--accent-primary)" />
              <h3 style={{ fontSize: "1.1rem" }}>Reorder reminders</h3>
            </div>

            <div className="form-group">
              <label>Send reminder after (days since last order)</label>
              <input
                type="number"
                min={1}
                max={365}
                step={1}
                value={value}
                onChange={(e) => setDraftDays(e.target.value)}
              />
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-secondary)",
                  marginTop: "6px",
                }}
              >
                Customers whose last order is at least this many days old are
                highlighted on the Customers screen and in the side menu, and
                get a "Send Reminder" WhatsApp button.
              </div>
            </div>

            <div style={{ marginTop: "1.25rem" }}>
              <Button
                onClick={handleSave}
                loading={isSaving}
                disabled={!isDirty || !isValid}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
