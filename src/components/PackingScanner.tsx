import { useEffect, useRef, useState } from "react";
import { Camera, Volume2, VolumeX, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import Button from "./ui/Button";
import { isScanSoundEnabled, setScanSoundEnabled } from "../utils/packingFeedback";
import { decodeQrFromImageFile } from "../utils/decodeQrPhoto";

export type ScanResultBanner = { ok: boolean; message: string } | null;

interface PackingScannerProps {
  /** Fired once per decoded photo or manual/USB-scanner submit. */
  onDecode: (text: string) => void;
  /** The outcome of the most recent scan — shown as a banner (never
   * conveyed by color/sound alone: an icon + text always come with it). */
  resultBanner?: ScanResultBanner;
  disabled?: boolean;
}

/**
 * Scanning for Scan & Pack. "Open Camera" launches the device's own native
 * camera app via `<input type="file" capture="environment">` rather than an
 * embedded live-video preview — the previous embedded-camera approach fought
 * the CSS/layout stack across several rounds (hidden-container sizing,
 * aspect-ratio letterboxing, a transformed ancestor breaking
 * position:fixed) and still didn't feel like a real camera. Handing the
 * whole capture UI to the OS sidesteps all of that: staff get the actual
 * native camera they already know, and this only has to decode whatever
 * photo comes back (see utils/decodeQrPhoto.ts, via jsQR).
 *
 * A USB/Bluetooth barcode scanner needs no special integration — those act
 * as a keyboard, typing the SKU followed by Enter, which the manual-entry
 * input handles as long as it's focused.
 */
export default function PackingScanner({ onDecode, resultBanner, disabled }: PackingScannerProps) {
  const [isDecoding, setIsDecoding] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(isScanSoundEnabled());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    manualInputRef.current?.focus();
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setScanSoundEnabled(next);
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow capturing the same-looking shot again immediately
    if (!file) return;

    setCaptureError(null);
    setIsDecoding(true);
    try {
      const text = await decodeQrFromImageFile(file);
      if (!text) {
        setCaptureError("No QR code found in that photo — get closer, hold steady, and make sure it's well lit, then try again.");
        return;
      }
      onDecode(text);
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : "Could not read that photo.");
    } finally {
      setIsDecoding(false);
    }
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
        <strong>Scan a pack</strong>
        <Button
          variant="ghost"
          size="sm"
          icon={soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          onClick={toggleSound}
          data-tooltip={soundEnabled ? "Mute scan sounds" : "Unmute scan sounds"}
        >
          {soundEnabled ? "Sound on" : "Sound off"}
        </Button>
      </div>

      {resultBanner && (
        <div
          role="status"
          aria-live="assertive"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            marginBottom: "0.75rem",
            background: resultBanner.ok ? "var(--success-bg, #eafaf1)" : "var(--danger-bg, #fdecea)",
            color: resultBanner.ok ? "var(--success)" : "var(--danger)",
            fontWeight: 600,
          }}
        >
          {resultBanner.ok ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
          {resultBanner.message}
        </div>
      )}

      {captureError && (
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
          {captureError}
        </div>
      )}

      {/*
        capture="environment" is what makes a mobile browser launch the
        actual native camera app (rear camera preselected) instead of a
        photo-library picker; desktop browsers fall back to a normal file
        picker (or a webcam snapshot dialog on some), which is a reasonable
        degradation since there's no "native camera app" to hand off to there.
      */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhoto}
        style={{ display: "none" }}
      />
      <Button
        icon={isDecoding ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
        disabled={disabled || isDecoding}
        onClick={() => fileInputRef.current?.click()}
        style={{ width: "100%", padding: "16px", fontSize: "1.05rem", marginBottom: "1rem" }}
      >
        {isDecoding ? "Reading photo…" : "Open Camera"}
      </Button>

      <form onSubmit={submitManual}>
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
