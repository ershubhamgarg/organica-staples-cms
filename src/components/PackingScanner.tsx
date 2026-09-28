import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, type CameraDevice } from "html5-qrcode";
import { Camera, CameraOff, RotateCcw, Volume2, VolumeX, ScanLine } from "lucide-react";
import Button from "./ui/Button";
import {
  isScanSoundEnabled,
  setScanSoundEnabled,
} from "../utils/packingFeedback";

const READER_ELEMENT_ID = "packing-scan-reader";
// How long the same decoded text has to be *absent* before we consider the
// QR to have left the camera's view, and are willing to accept it again —
// this is what stops one physical pack held in frame for a second or two
// from being decoded (and counted) dozens of times across video frames.
const SAME_SKU_COOLDOWN_MS = 1500;

interface PackingScannerProps {
  onDecode: (text: string) => void;
  disabled?: boolean;
}

/**
 * Camera scanning + manual fallback for Scan & Pack. A USB/Bluetooth barcode
 * scanner needs no special integration here — those act as a keyboard,
 * typing the SKU followed by Enter, which the manual-entry input already
 * handles as long as it's focused; staff can just leave it focused and scan
 * with the external device instead of the camera.
 */
export default function PackingScanner({ onDecode, disabled }: PackingScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastDecodedRef = useRef<{ text: string; at: number } | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(isScanSoundEnabled());
  const manualInputRef = useRef<HTMLInputElement>(null);

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
  }, []);

  const startCamera = useCallback(
    async (cameraId: string) => {
      setCameraError(null);
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(READER_ELEMENT_ID);
      }
      try {
        await scannerRef.current.start(
          cameraId,
          { fps: 10, qrbox: { width: 240, height: 240 } },
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

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setScanSoundEnabled(next);
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const value = manualValue.trim();
    if (!value) return;
    onDecode(value);
    setManualValue("");
  };

  return (
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
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <ScanLine size={18} color="var(--accent-primary)" />
          <strong>Scan a pack</strong>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {cameras.length > 1 && (
            <select
              value={selectedCameraId ?? ""}
              onChange={(e) => {
                setSelectedCameraId(e.target.value);
                if (isCameraActive) {
                  void stopCamera().then(() => startCamera(e.target.value));
                }
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
            icon={soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            onClick={toggleSound}
            data-tooltip={soundEnabled ? "Mute scan sounds" : "Unmute scan sounds"}
          >
            {soundEnabled ? "Sound on" : "Sound off"}
          </Button>
          {isCameraActive ? (
            <Button variant="ghost" size="sm" icon={<CameraOff size={14} />} onClick={() => void stopCamera()}>
              Stop camera
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              icon={<Camera size={14} />}
              disabled={!selectedCameraId || disabled}
              onClick={() => selectedCameraId && startCamera(selectedCameraId)}
            >
              Start camera
            </Button>
          )}
          {cameraError && (
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw size={14} />}
              onClick={() => selectedCameraId && startCamera(selectedCameraId)}
            >
              Retry
            </Button>
          )}
        </div>
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
          }}
        >
          {cameraError}
        </div>
      )}

      <div
        id={READER_ELEMENT_ID}
        style={{
          width: "100%",
          maxWidth: "360px",
          margin: "0 auto",
          display: isCameraActive ? "block" : "none",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
        }}
      />

      <form onSubmit={submitManual} style={{ marginTop: "1rem" }}>
        <label
          htmlFor="manual-sku-input"
          style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}
        >
          Or type/scan with a USB/Bluetooth scanner (auto-submits on Enter)
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
  );
}
