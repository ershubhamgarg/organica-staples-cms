import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  PackageCheck,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Undo2,
  RotateCw,
  LockOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useOrderStore, type Order } from "../store/orderStore";
import { usePackingStore, type PackingSessionItem } from "../store/packingStore";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import Spinner from "../components/ui/Spinner";
import ErrorBanner from "../components/ui/ErrorBanner";
import PackingScanner from "../components/PackingScanner";
import { playScanRejected, playScanSuccess, vibrateRejected, vibrateSuccess } from "../utils/packingFeedback";

function itemStateLabel(item: PackingSessionItem): { label: string; color: string } {
  if (item.packed_qty === 0) return { label: "Pending", color: "var(--text-secondary)" };
  if (item.packed_qty < item.required_qty) return { label: "Partial", color: "var(--warning, #b58900)" };
  return { label: "Complete", color: "var(--success)" };
}

export default function ScanAndPack() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const getOrderById = useOrderStore((state) => state.getOrderById);

  const {
    session,
    items,
    recentScans,
    blockers,
    isLoading,
    error,
    fetchStatus,
    startOrResume,
    scan,
    undoLast,
    complete,
    reopen,
    resync,
    reset,
  } = usePackingStore();

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(true);
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [undoReason, setUndoReason] = useState("");
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [driftDetected, setDriftDetected] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; message: string } | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    reset();

    (async () => {
      if (!id) return;
      const fetchedOrder = await getOrderById(id);
      if (cancelled) return;
      setOrder(fetchedOrder);
      setIsLoadingOrder(false);

      await fetchStatus(id);
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
    };
    // Intentionally runs once per order id — fetchStatus/getOrderById/reset
    // are store actions recreated per render and deliberately excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleStart = async () => {
    if (!id) return;
    try {
      await startOrResume(id);
    } catch {
      // Blockers/error are already reflected in store state.
    }
  };

  const showFlash = (ok: boolean, message: string) => {
    setFlash({ ok, message });
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    flashTimeout.current = setTimeout(() => setFlash(null), 3500);
  };

  // A camera decode doesn't submit immediately — it's held here until the
  // user confirms it's the pack they meant to scan (the camera can misread,
  // or a neighboring pack's QR can drift into frame). Manual/USB-scanner
  // entry skips this, since typing a SKU and pressing Enter (or a scanner
  // doing the same) is already a deliberate action.
  const [pendingScan, setPendingScan] = useState<string | null>(null);
  const [isSubmittingScan, setIsSubmittingScan] = useState(false);

  const pendingScanMatch = pendingScan
    ? items.find((i) => i.sku === pendingScan) ?? null
    : null;

  const submitScan = async (rawInput: string) => {
    if (!id) return;
    setIsSubmittingScan(true);
    try {
      const result = await scan(id, rawInput);
      const ok = result.outcome === "accepted";
      showFlash(ok, result.message);
      if (ok) {
        playScanSuccess();
        vibrateSuccess();
      } else {
        playScanRejected();
        vibrateRejected();
        toast.error(result.message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scan failed.";
      showFlash(false, message);
      playScanRejected();
      vibrateRejected();
      toast.error(message);
    } finally {
      setIsSubmittingScan(false);
    }
  };

  const handleDecode = (rawInput: string, source: "camera" | "manual") => {
    if (source === "manual") {
      void submitScan(rawInput);
      return;
    }
    // Camera: hold for confirmation instead of submitting right away.
    setPendingScan(rawInput);
  };

  const handleConfirmPendingScan = async () => {
    if (!pendingScan) return;
    const value = pendingScan;
    setPendingScan(null);
    await submitScan(value);
  };

  const handleCancelPendingScan = () => {
    setPendingScan(null);
  };

  const totalRequired = items.reduce((sum, i) => sum + i.required_qty, 0);
  const totalPacked = items.reduce((sum, i) => sum + Math.min(i.packed_qty, i.required_qty), 0);
  const allComplete = items.length > 0 && items.every((i) => i.packed_qty === i.required_qty);
  const isActiveSession = session && (session.status === "in_progress" || session.status === "reopened");

  const handleComplete = async () => {
    if (!id) return;
    setIsCompleting(true);
    setDriftDetected(false);
    const result = await complete(id);
    setIsCompleting(false);
    if (result.ok) {
      toast.success("Packing completed — order is ready to ship.");
      await fetchStatus(id);
    } else if (result.driftDetected) {
      setDriftDetected(true);
      toast.error(result.error ?? "Order changed since packing started.");
    } else {
      toast.error(result.error ?? "Could not complete packing.");
    }
  };

  const handleResync = async () => {
    if (!id) return;
    try {
      await resync(id);
      setDriftDetected(false);
      toast.success("Packing requirements updated to match the latest order.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resync.");
    }
  };

  const handleUndo = async () => {
    if (!id || !undoReason.trim()) return;
    try {
      await undoLast(id, undoReason.trim());
      setShowUndoModal(false);
      setUndoReason("");
      toast.success("Last scan undone.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not undo the last scan.");
    }
  };

  const handleReopen = async () => {
    if (!id || !reopenReason.trim()) return;
    try {
      await reopen(id, reopenReason.trim());
      setShowReopenModal(false);
      setReopenReason("");
      toast.success("Packing session reopened.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reopen this session.");
    }
  };

  if (isLoadingOrder) return <Spinner />;
  if (!order) return <ErrorBanner message="Order not found." />;

  return (
    <div className="animate-fade-in" style={{ maxWidth: "760px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1rem" }}>
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} />} onClick={() => navigate(`/orders/${id}`)}>
          Back to order
        </Button>
      </div>

      <div className="card" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "0.5rem" }}>
          <PackageCheck size={22} color="var(--accent-primary)" />
          <h2 style={{ fontSize: "1.2rem" }}>Scan &amp; Pack — Order #{order.id.slice(0, 8)}</h2>
        </div>
        <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
          {order.delivery_address?.name} · {order.delivery_address?.city}, {order.delivery_address?.state}
          {" · "}
          {order.delivery_address?.phone}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {blockers.length > 0 && (
        <div className="card" style={{ padding: "1.25rem", marginBottom: "1rem", borderColor: "var(--danger)" }}>
          <strong style={{ color: "var(--danger)" }}>This order can't be packed yet</strong>
          <ul style={{ marginTop: "0.5rem", paddingLeft: "1.2rem", fontSize: "0.9rem" }}>
            {blockers.map((b) => (
              <li key={b.orderItemKey}>{b.reason}</li>
            ))}
          </ul>
          <Link to="/skus" style={{ display: "inline-block", marginTop: "0.75rem" }}>
            <Button variant="secondary" size="sm">
              Go to Manage SKUs
            </Button>
          </Link>
        </div>
      )}

      {!session && blockers.length === 0 && (
        <div className="card" style={{ padding: "1.5rem", textAlign: "center" }}>
          <p style={{ marginBottom: "1rem", color: "var(--text-secondary)" }}>
            No packing session yet for this order.
          </p>
          <Button icon={<PackageCheck size={16} />} loading={isLoading} onClick={handleStart}>
            Start Packing
          </Button>
        </div>
      )}

      {session && (
        <>
          {session.status === "completed" && (
            <div className="card" style={{ padding: "1rem", marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <strong style={{ color: "var(--success)" }}>Packing complete</strong>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  Packed by {session.completed_by} on{" "}
                  {session.completed_at ? new Date(session.completed_at).toLocaleString() : ""}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<LockOpen size={14} />}
                onClick={() => setShowReopenModal(true)}
              >
                Reopen
              </Button>
            </div>
          )}

          {driftDetected && (
            <div className="card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--warning, #b58900)" }}>
              <strong>This order changed since packing started.</strong>
              <p style={{ fontSize: "0.9rem", margin: "0.5rem 0" }}>
                Resync to update requirements to the latest order before completing.
              </p>
              <Button size="sm" icon={<RotateCw size={14} />} onClick={handleResync}>
                Resync Now
              </Button>
            </div>
          )}

          <div className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <strong>
                {totalPacked} of {totalRequired} packs verified
              </strong>
              <span style={{ color: allComplete ? "var(--success)" : "var(--text-secondary)" }}>
                {allComplete ? "Ready to complete" : "In progress"}
              </span>
            </div>
            <div
              style={{
                height: "10px",
                borderRadius: "999px",
                background: "var(--bg-secondary)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: totalRequired > 0 ? `${(totalPacked / totalRequired) * 100}%` : "0%",
                  background: allComplete ? "var(--success)" : "var(--accent-primary)",
                  transition: "width 0.2s ease",
                }}
              />
            </div>
          </div>

          {isActiveSession && (
            <>
              {flash && (
                <div
                  role="status"
                  aria-live="assertive"
                  className="card"
                  style={{
                    padding: "1rem",
                    marginBottom: "1rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    borderColor: flash.ok ? "var(--success)" : "var(--danger)",
                    background: flash.ok ? "var(--success-bg, #eafaf1)" : "var(--danger-bg, #fdecea)",
                  }}
                >
                  {flash.ok ? (
                    <CheckCircle2 size={22} color="var(--success)" />
                  ) : (
                    <XCircle size={22} color="var(--danger)" />
                  )}
                  <strong style={{ color: flash.ok ? "var(--success)" : "var(--danger)" }}>
                    {flash.message}
                  </strong>
                </div>
              )}

              {pendingScan && (
                <div
                  className="card"
                  style={{
                    padding: "1rem",
                    marginBottom: "1rem",
                    borderColor: "var(--accent-primary)",
                  }}
                >
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                    Confirm this pack
                  </div>
                  <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: "2px" }}>
                    {pendingScanMatch ? pendingScanMatch.label : "Not part of this order"}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                    SKU: <code>{pendingScan}</code>
                    {pendingScanMatch?.weight ? ` · ${pendingScanMatch.weight}` : ""}
                    {pendingScanMatch
                      ? ` · ${pendingScanMatch.packed_qty} of ${pendingScanMatch.required_qty} packed so far`
                      : ""}
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <Button variant="secondary" onClick={handleCancelPendingScan}>
                      Cancel — rescan
                    </Button>
                    <Button loading={isSubmittingScan} onClick={handleConfirmPendingScan}>
                      Confirm — count this pack
                    </Button>
                  </div>
                </div>
              )}

              <PackingScanner onDecode={handleDecode} paused={Boolean(pendingScan)} disabled={isCompleting} />
            </>
          )}

          <div className="card" style={{ padding: "1rem", marginTop: "1rem" }}>
            <strong style={{ display: "block", marginBottom: "0.75rem" }}>Order Items</strong>
            {items.map((item) => {
              const state = itemStateLabel(item);
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      SKU: <code>{item.sku}</code>
                      {item.weight ? ` · ${item.weight}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 600 }}>
                      {item.packed_qty} / {item.required_qty}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: state.color }}>{state.label}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {isActiveSession && (
            <div style={{ display: "flex", gap: "10px", marginTop: "1rem", flexWrap: "wrap" }}>
              <Button
                variant="ghost"
                icon={<Undo2 size={16} />}
                disabled={recentScans.every((s) => s.outcome !== "accepted" || s.undone)}
                onClick={() => setShowUndoModal(true)}
              >
                Undo Last Scan
              </Button>
              <Button
                icon={<PackageCheck size={16} />}
                disabled={!allComplete}
                loading={isCompleting}
                onClick={handleComplete}
              >
                Complete Packing
              </Button>
            </div>
          )}

          {recentScans.length > 0 && (
            <div className="card" style={{ padding: "1rem", marginTop: "1rem" }}>
              <strong style={{ display: "block", marginBottom: "0.5rem" }}>Recent Scans</strong>
              {recentScans.slice(0, 10).map((scanEvent) => (
                <div
                  key={scanEvent.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.85rem",
                    padding: "6px 0",
                    borderBottom: "1px solid var(--border-color)",
                    opacity: scanEvent.undone ? 0.5 : 1,
                  }}
                >
                  <span>
                    {scanEvent.raw_input} —{" "}
                    <span style={{ color: scanEvent.outcome === "accepted" ? "var(--success)" : "var(--danger)" }}>
                      {scanEvent.outcome.replace(/_/g, " ")}
                    </span>
                    {scanEvent.undone ? " (undone)" : ""}
                  </span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {new Date(scanEvent.scanned_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showUndoModal && (
        <Modal onClose={() => setShowUndoModal(false)} title="Undo Last Scan" icon={<Undo2 size={20} />} maxWidth="420px">
          <div className="form-group">
            <label>Reason (required)</label>
            <textarea
              rows={3}
              value={undoReason}
              onChange={(e) => setUndoReason(e.target.value)}
              placeholder="e.g. scanned the wrong pack by mistake"
              autoFocus
            />
          </div>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
            <Button variant="secondary" onClick={() => setShowUndoModal(false)}>
              Cancel
            </Button>
            <Button disabled={!undoReason.trim()} onClick={handleUndo}>
              Undo Scan
            </Button>
          </div>
        </Modal>
      )}

      {showReopenModal && (
        <Modal onClose={() => setShowReopenModal(false)} title="Reopen Packing" icon={<LockOpen size={20} />} maxWidth="420px">
          <div className="form-group">
            <label>Reason (required)</label>
            <textarea
              rows={3}
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="e.g. customer requested a size change after packing"
              autoFocus
            />
          </div>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
            <Button variant="secondary" onClick={() => setShowReopenModal(false)}>
              Cancel
            </Button>
            <Button disabled={!reopenReason.trim()} onClick={handleReopen}>
              Reopen
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
