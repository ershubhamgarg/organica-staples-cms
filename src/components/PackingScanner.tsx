import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, type CameraDevice } from "html5-qrcode";
import {
  Camera,
  X,
  RotateCcw,
  Volume2,
  VolumeX,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import Button from "./ui/Button";
import { isScanSoundEnabled, setScanSoundEnabled } from "../utils/packingFeedback";

const READER_ELEMENT_ID = "packing-scan-reader";
// How long the same decoded text has to be *absent* before we consider the
// QR to have left the camera's view, and are willing to accept it again —
// this is what stops one physical pack held in frame for a second or two
// from being decoded (and counted) dozens of times across video frames,
// while still letting an intentional second pack of the same SKU be scanned
// right after.
const SAME_SKU_COOLDOWN_MS = 1500;

export type ScanResultBanner = { ok: boolean; message: string } | null;

interface PackingScannerProps {
  /** Fired immediately on every camera decode or manual/USB-scanner submit
   * — there's no confirmation step, by design: it needs to feel like a
   * normal retail barcode scan, not a multi-tap flow. Right/wrong feedback
   * comes back via `resultBanner`, shown right on the camera view. */
  onDecode: (text: string) => void;
  /** The outcome of the most recent scan — rendered as a banner over the
   * live camera feed (never conveyed by color/sound alone: an icon + text
   * always come with it). */
  resultBanner?: ScanResultBanner;
  disabled?: boolean;
}

/**
 * Camera scanning + manual fallback for Scan & Pack. A USB/Bluetooth barcode
 * scanner needs no special integration here — those act as a keyboard,
 * typing the SKU followed by Enter, which the manual-entry input already
 * handles as long as it's focused; staff can just leave it focused and scan
 * with the external device instead of the camera.
 *
 * While the camera is running, it takes over the full screen (a fixed
 * overlay, not the browser's native Fullscreen API — which iOS Safari
 * doesn't support for an arbitrary element) so the packing desk can hold a
 * phone/tablet up and scan without the rest of the page competing for space.
 */
export default function PackingScanner({ onDecode, resultBanner, disabled }: PackingScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastDecodedRef = useRef<{ text: string; at: number } | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  // Set synchronously (before the async .start() call below even begins),
  // so the full-screen container is already visible — and therefore has a
  // real, non-zero size for html5-qrcode to measure — at the exact moment
  // .start() runs, not only after it resolves and isCameraActive flips.
  // Without this the container is display:none while .start() measures it,
  // reintroducing the broken/invisible-feed bug this was built to avoid.
  const [isOpening, setIsOpening] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(isScanSoundEnabled());
  const manualInputRef = useRef<HTMLInputElement>(null);
  const fullscreenManualInputRef = useRef<HTMLInputElement>(null);

  const handleDetected = useCallback(
    (text: string) => {
      const now = Date.now();
      const last = lastDecodedRef.current;
      if (last && last.text === text && now - last.at < SAME_SKU_COOLDOWN_MS) {
        // Same visible QR, still in frame — not a new physical pack.
        lastDecodedRef.current = { text, at: now };
        return;
      }
      lastDecodedRef.current = { text, at: now };
      onDecode(text);
    },
    [onDecode],
  );

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    if (scanner) {
      try {
        await scanner.stop();
      } catch {
        // Already stopped — fine.
      }
      try {
        scanner.clear();
      } catch {
        // No-op if never rendered.
      }
    }
    setIsCameraActive(false);
    setIsOpening(false);
  }, []);

  const startCamera = useCallback(
    async (cameraId: string) => {
      setCameraError(null);
      setIsOpening(true);
      // A plain setState doesn't paint before the next line of this
      // function runs — without waiting a frame, .start() below would still
      // measure the container before React has actually made it visible.
      // Two rAFs (rather than one) reliably land after the browser's next
      // layout/paint, which one alone isn't guaranteed to.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(READER_ELEMENT_ID);
      }
      try {
        await scannerRef.current.start(
          cameraId,
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (decodedText) => handleDetected(decodedText),
          () => {
            // Fires continuously while no QR is in frame — not an error
            // worth surfacing, just the normal "still looking" state.
          },
        );
        setIsCameraActive(true);
      } catch (err) {
        setIsCameraActive(false);
        setCameraError(
          err instanceof Error
            ? `Could not start the camera: ${err.message}`
            : "Could not start the camera. Check permissions and try again.",
        );
      } finally {
        setIsOpening(false);
      }
    },
    [handleDetected],
  );

  useEffect(() => {
    let cancelled = false;
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (cancelled) return;
        setCameras(devices);
        if (devices.length > 0) {
          const back = devices.find((d) => /back|rear|environment/i.test(d.label));
          setSelectedCameraId((back ?? devices[0]).id);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setCameraError(
          err instanceof Error
            ? `Camera permission was denied or unavailable: ${err.message}`
            : "Camera permission was denied or unavailable.",
        );
      });

    return () => {
      cancelled = true;
      void stopCamera();
    };
    // Runs once on mount; stopCamera is stable (no external deps) and
    // deliberately not re-run when it changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    manualInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (isCameraActive) fullscreenManualInputRef.current?.focus();
  }, [isCameraActive]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setScanSoundEnabled(next);
  };

  const submitManual = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onDecode(trimmed);
  };

  const resultOverlay = resultBanner && (
    <div
      role="status"
      aria-live="assertive"
      style={{
        position: "absolute",
        top: "16px",
        left: "16px",
        right: "16px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "12px 16px",
        borderRadius: "var(--radius-md)",
        background: resultBanner.ok ? "rgba(22, 163, 74, 0.92)" : "rgba(220, 38, 38, 0.92)",
        color: "#fff",
        fontWeight: 600,
        fontSize: "0.95rem",
      }}
    >
      {resultBanner.ok ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
      {resultBanner.message}
    </div>
  );

  return (
    <>
      <div className="card" style={{ padding: "1rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.75rem",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <strong>Scan a pack</strong>
          <Button
            variant="secondary"
            size="sm"
            icon={<Camera size={14} />}
            disabled={!selectedCameraId || disabled}
            onClick={() => selectedCameraId && startCamera(selectedCameraId)}
          >
            Open Camera
          </Button>
        </div>

        {cameraError && (
          <div
            role="alert"
            style={{
              background: "var(--danger-bg, #fdecea)",
              color: "var(--danger)",
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              fontSize: "0.85rem",
              marginBottom: "0.75rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              justifyContent: "space-between",
            }}
          >
            {cameraError}
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={14} />}
              onClick={() => selectedCameraId && startCamera(selectedCameraId)}
            >
              Retry
            </Button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitManual(manualValue);
            setManualValue("");
          }}
        >
          <label
            htmlFor="manual-sku-input"
            style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}
          >
            Type or scan with a USB/Bluetooth scanner (auto-submits on Enter)
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              id="manual-sku-input"
              ref={manualInputRef}
              type="text"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder="ANN-RCP-200"
              autoComplete="off"
              style={{ flex: 1, fontSize: "1.1rem", padding: "12px 14px" }}
              disabled={disabled}
            />
            <Button type="submit" disabled={!manualValue.trim() || disabled}>
              Submit
            </Button>
          </div>
        </form>
      </div>

      {/*
        The camera reader element must exist in the DOM (never
        conditionally rendered/display:none) whenever we might call
        .start() on it — html5-qrcode measures its container to size the
        <video> it inserts, and starting into a hidden/zero-size element
        produces a broken or invisible feed even though the camera stream is
        genuinely running. It lives permanently in this full-screen overlay,
        which itself is only mounted while the camera is meant to be active.
      */}
      {(isCameraActive || cameras.length > 0) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "#000",
            display: isCameraActive || isOpening ? "flex" : "none",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              zIndex: 2,
            }}
          >
            <strong>Scan a pack</strong>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {cameras.length > 1 && (
                <select
                  value={selectedCameraId ?? ""}
                  onChange={(e) => {
                    setSelectedCameraId(e.target.value);
                    void stopCamera().then(() => startCamera(e.target.value));
                  }}
                  style={{ fontSize: "0.85rem", padding: "6px 8px" }}
                >
                  {cameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.label || cam.id}
                    </option>
                  ))}
                </select>
              )}
              <Button
                variant="ghost"
                size="sm"
                icon={soundEnabled ? <Volume2 size={16} color="#fff" /> : <VolumeX size={16} color="#fff" />}
                onClick={toggleSound}
              />
              <Button variant="ghost" size="sm" icon={<X size={18} color="#fff" />} onClick={() => void stopCamera()}>
                Close
              </Button>
            </div>
          </div>

          <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
            <div id={READER_ELEMENT_ID} style={{ width: "100%", height: "100%" }} />
            {isOpening && !isCameraActive && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                }}
              >
                Opening camera…
              </div>
            )}
            {resultOverlay}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitManual(manualValue);
              setManualValue("");
            }}
            style={{ padding: "12px 16px", background: "rgba(0,0,0,0.6)" }}
          >
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                ref={fullscreenManualInputRef}
                type="text"
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder="Or type/USB-scan a SKU"
                autoComplete="off"
                style={{ flex: 1, fontSize: "1rem", padding: "10px 12px" }}
                disabled={disabled}
              />
              <Button type="submit" disabled={!manualValue.trim() || disabled}>
                Submit
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
