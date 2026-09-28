import { useEffect, useMemo, useState } from "react";
import { Save, Printer, Download, AlertTriangle, Search, X, FileDown, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { useSkuStore, type SkuReviewRow } from "../store/skuStore";
import { useProductStore } from "../store/productStore";
import Button from "../components/ui/Button";
import Spinner from "../components/ui/Spinner";
import PageHeader from "../components/ui/PageHeader";
import Modal from "../components/ui/Modal";
import { generateSkuQrPngDataUrl, generateSkuLabelPngDataUrl } from "../utils/skuQr";
import { generateSkuLabelSheetPdf, LABEL_SHEET_CAPACITY } from "../utils/skuLabelSheet";
import { formatCurrency } from "../utils/currency";
import brandMark from "../assets/annvriksh-mark.png";

type CatalogSkuRow = {
  entityType: "product" | "variant";
  entityId: number;
  sku: string;
  /** Includes the pack size suffix for variants (e.g. "... — 200 gms") —
   * used in the on-screen list/search, where telling two pack sizes of the
   * same product apart at a glance matters. NOT used on the printed/
   * downloaded label, which already shows `weight` as its own line —
   * repeating it in the name there read as the pack size being printed
   * twice. See `productName` for that. */
  name: string;
  /** Bare product name, no pack-size suffix — what the label/PNG uses. */
  productName: string;
  weight: string | null;
  /** MRP — the undiscounted list price, printed on the label rather than
   * the current selling price, since a discount is a temporary promotion
   * and a printed label isn't reprinted every time one starts/ends. */
  price: number;
};

function SkuQrThumb({ sku, onClick }: { sku: string; onClick: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    generateSkuQrPngDataUrl(sku).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [sku]);

  if (!dataUrl) return <div style={{ width: 64, height: 64 }} />;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Enlarge QR for ${sku}`}
      data-tooltip="Click to enlarge"
      style={{
        width: 64,
        height: 64,
        padding: 0,
        border: "none",
        background: "none",
        cursor: "zoom-in",
        flexShrink: 0,
      }}
    >
      <img src={dataUrl} alt={`QR for ${sku}`} width={64} height={64} />
    </button>
  );
}

function AssignRow({ row, onSaved }: { row: SkuReviewRow; onSaved: () => void }) {
  const assignSku = useSkuStore((state) => state.assignSku);
  const [value, setValue] = useState(row.currentSku ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const sku = value.trim().toUpperCase();
    if (!sku) return;
    setIsSaving(true);
    try {
      await assignSku({
        entityType: row.type,
        entityId: row.variantId ?? row.productId,
        sku,
      });
      toast.success(`SKU ${sku} assigned to ${row.name}.`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign SKU.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
        padding: "10px 0",
        borderBottom: "1px solid var(--border-color)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{row.name}</div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
          {row.weight ?? ""} {row.category ? `· ${row.category}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", flex: "1 1 240px" }}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. ANN-RCP-200"
          style={{ flex: 1, minWidth: 0 }}
        />
        <Button size="sm" icon={<Save size={14} />} loading={isSaving} disabled={!value.trim()} onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  );
}

export default function SkuManagement() {
  const { missing, duplicates, isLoading, fetchReview } = useSkuStore();
  const products = useProductStore((state) => state.products);
  const fetchProducts = useProductStore((state) => state.fetchProducts);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printRows, setPrintRows] = useState<CatalogSkuRow[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewRow, setPreviewRow] = useState<CatalogSkuRow | null>(null);
  const [isGeneratingSheet, setIsGeneratingSheet] = useState(false);
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchReview();
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catalogRows: CatalogSkuRow[] = useMemo(() => {
    const rows: CatalogSkuRow[] = [];
    for (const p of products) {
      if (p.sku && (!p.variants || p.variants.length === 0)) {
        rows.push({
          entityType: "product",
          entityId: Number(p.id),
          sku: p.sku,
          name: p.name,
          productName: p.name,
          weight: p.weight,
          price: p.price,
        });
      }
      for (const v of p.variants ?? []) {
        if (v.sku) {
          rows.push({
            entityType: "variant",
            entityId: v.id!,
            sku: v.sku,
            name: `${p.name} — ${v.label}`,
            productName: p.name,
            weight: v.weight,
            price: v.price,
          });
        }
      }
    }
    return rows.sort((a, b) => a.sku.localeCompare(b.sku));
  }, [products]);

  const filteredCatalogRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalogRows;
    return catalogRows.filter(
      (row) => row.sku.toLowerCase().includes(q) || row.name.toLowerCase().includes(q),
    );
  }, [catalogRows, searchQuery]);

  const toggleSelected = (sku: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  const allFilteredSelected =
    filteredCatalogRows.length > 0 && filteredCatalogRows.every((r) => selected.has(r.sku));

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (allFilteredSelected) {
        // Deselect only what's currently visible under the search filter —
        // a selection made while filtered shouldn't vanish for rows the
        // filter is just hiding right now.
        const next = new Set(prev);
        for (const r of filteredCatalogRows) next.delete(r.sku);
        return next;
      }
      const next = new Set(prev);
      for (const r of filteredCatalogRows) next.add(r.sku);
      return next;
    });
  };

  const handlePrintSelected = () => {
    const rows = catalogRows.filter((r) => selected.has(r.sku));
    if (rows.length === 0) {
      toast.error("Select at least one SKU to print.");
      return;
    }
    setPrintRows(rows);
    setTimeout(() => {
      window.print();
      setPrintRows(null);
    }, 200);
  };

  const handleDownload = async (row: CatalogSkuRow) => {
    const dataUrl = await generateSkuLabelPngDataUrl({ ...row, name: row.productName });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${row.sku}.png`;
    a.click();
  };

  const generateSheet = async (rows: CatalogSkuRow[]) => {
    setIsGeneratingSheet(true);
    try {
      const doc = await generateSkuLabelSheetPdf(
        rows.map((row) => ({ ...row, name: row.productName })),
      );
      doc.save("annvriksh-sku-labels-a4.pdf");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate the label sheet.");
    } finally {
      setIsGeneratingSheet(false);
    }
  };

  // Falls back to every assigned SKU when nothing is checked — a sheet
  // maker is more often "give me everything to print" than "print my
  // current selection," and an empty sheet would otherwise be a confusing
  // silent no-op the first time someone tries this without having selected
  // anything yet. There's nothing to ask a quantity for in that case (no
  // explicit selection to attach a count to), so it downloads directly —
  // one of each. Any actual selection always goes through the quantity
  // modal below instead of guessing.
  const handleDownloadA4Sheet = async () => {
    if (selected.size === 0) {
      if (catalogRows.length === 0) {
        toast.error("No SKUs to include on a sheet yet.");
        return;
      }
      await generateSheet(catalogRows);
      return;
    }

    const selectedRows = catalogRows.filter((r) => selected.has(r.sku));

    // Defaults to filling one sheet evenly (as before), just as a starting
    // point in the modal rather than applied silently — the admin can
    // change any of these before generating.
    const base = Math.floor(LABEL_SHEET_CAPACITY / selectedRows.length);
    const remainder = LABEL_SHEET_CAPACITY % selectedRows.length;
    setQuantities(
      Object.fromEntries(
        selectedRows.map((r, i) => [r.sku, Math.max(1, base + (i < remainder ? 1 : 0))]),
      ),
    );
    setShowQuantityModal(true);
  };

  const handleConfirmQuantities = async () => {
    const selectedRows = catalogRows.filter((r) => selected.has(r.sku));
    const expanded: CatalogSkuRow[] = [];
    for (const row of selectedRows) {
      const copies = Math.max(0, Math.floor(quantities[row.sku] ?? 0));
      for (let c = 0; c < copies; c++) expanded.push(row);
    }
    if (expanded.length === 0) {
      toast.error("Enter at least one copy for at least one SKU.");
      return;
    }
    setShowQuantityModal(false);
    await generateSheet(expanded);
  };

  if (isLoading && catalogRows.length === 0) return <Spinner />;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Manage SKUs"
        subtitle="Assign SKUs, print pack labels, and resolve anything Scan & Pack needs before an order can be packed."
      />

      {(missing.length > 0 || duplicates.length > 0) && (
        <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.75rem" }}>
            <AlertTriangle size={18} color="var(--danger)" />
            <strong>Needs Attention ({missing.length + duplicates.length})</strong>
          </div>
          {missing.map((row) => (
            <AssignRow key={`${row.type}-${row.productId}-${row.variantId ?? ""}`} row={row} onSaved={fetchReview} />
          ))}
          {duplicates.map((row) => (
            <div key={`dup-${row.type}-${row.productId}-${row.variantId ?? ""}`} style={{ padding: "10px 0", borderBottom: "1px solid var(--border-color)" }}>
              <strong style={{ color: "var(--danger)" }}>Duplicate SKU {row.sku}</strong> — {row.name}
              <AssignRow row={row} onSaved={fetchReview} />
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <strong>
            All SKUs ({filteredCatalogRows.length}
            {filteredCatalogRows.length !== catalogRows.length ? ` of ${catalogRows.length}` : ""})
          </strong>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Button
              variant="secondary"
              size="sm"
              icon={allFilteredSelected ? <Square size={14} /> : <CheckSquare size={14} />}
              disabled={filteredCatalogRows.length === 0}
              onClick={toggleSelectAll}
            >
              {allFilteredSelected ? "Deselect All" : "Select All"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Printer size={14} />}
              disabled={selected.size === 0}
              onClick={handlePrintSelected}
            >
              Print Selected Labels ({selected.size})
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<FileDown size={14} />}
              loading={isGeneratingSheet}
              onClick={handleDownloadA4Sheet}
              data-tooltip="30 labels per A4 sheet (3 columns x 10 rows), ready to print onto sticker sheets"
            >
              Download A4 Sheet (3×10){selected.size > 0 ? ` — Selected (${selected.size})` : " — All"}
            </Button>
          </div>
        </div>

        <div style={{ position: "relative", marginBottom: "1rem" }}>
          <Search
            size={16}
            style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)" }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by SKU or product name…"
            style={{ width: "100%", padding: "10px 36px" }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-secondary)",
                display: "flex",
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {catalogRows.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>No SKUs assigned yet.</p>
        ) : filteredCatalogRows.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>No SKUs match "{searchQuery}".</p>
        ) : (
          filteredCatalogRows.map((row) => (
            <div
              key={row.sku}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 0",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(row.sku)}
                onChange={() => toggleSelected(row.sku)}
              />
              <SkuQrThumb sku={row.sku} onClick={() => setPreviewRow(row)} />
              {/* min-width: 0 is required here, not optional — a flex item's
                  default min-width is `auto` (its content's intrinsic
                  width), which silently defeats `flex: 1` and pushes the
                  Download button off the edge of a narrow phone screen
                  instead of letting this text wrap/shrink. */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflowWrap: "break-word" }}>{row.name}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  <code>{row.sku}</code> {row.weight ? `· ${row.weight}` : ""} · MRP ₹{formatCurrency(row.price)}
                </div>
              </div>
              <Button variant="ghost" size="sm" icon={<Download size={14} />} onClick={() => handleDownload(row)}>
                PNG
              </Button>
            </div>
          ))
        )}
      </div>

      {printRows && (
        <div className="print-only-labels">
          {printRows.map((row) => (
            <PrintLabel key={row.sku} row={row} />
          ))}
        </div>
      )}

      {previewRow && (
        <QrPreviewModal
          row={previewRow}
          onClose={() => setPreviewRow(null)}
          onDownload={() => handleDownload(previewRow)}
        />
      )}

      {showQuantityModal && (
        <Modal
          onClose={() => setShowQuantityModal(false)}
          title="How many of each?"
          icon={<FileDown size={20} />}
          maxWidth="480px"
        >
          <p style={{ color: "var(--text-secondary)", marginBottom: "1.25rem", fontSize: "0.9rem" }}>
            Set how many copies of each of your {selected.size} selected SKU
            {selected.size === 1 ? "" : "s"} to print — pre-filled to fill one
            sheet ({LABEL_SHEET_CAPACITY} labels) evenly, but change any of them.
            They'll be split across as many A4 sheets as the total needs.
          </p>
          <div style={{ maxHeight: "45vh", overflowY: "auto", marginBottom: "1.25rem" }}>
            {catalogRows
              .filter((r) => selected.has(r.sku))
              .map((row) => (
                <div
                  key={row.sku}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--border-color)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{row.name}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                      <code>{row.sku}</code>
                    </div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={quantities[row.sku] ?? 1}
                    onChange={(e) =>
                      setQuantities((prev) => ({
                        ...prev,
                        [row.sku]: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    style={{ width: "70px", flexShrink: 0 }}
                  />
                </div>
              ))}
          </div>
          {(() => {
            const totalQty = Object.values(quantities).reduce(
              (sum, n) => sum + Math.max(0, n || 0),
              0,
            );
            const sheetCount = totalQty === 0 ? 0 : Math.ceil(totalQty / LABEL_SHEET_CAPACITY);
            const lastSheetFilled =
              totalQty === 0
                ? 0
                : totalQty % LABEL_SHEET_CAPACITY === 0
                  ? LABEL_SHEET_CAPACITY
                  : totalQty % LABEL_SHEET_CAPACITY;
            const isFull = totalQty > 0 && lastSheetFilled === LABEL_SHEET_CAPACITY;
            const remainingToFill = isFull ? 0 : LABEL_SHEET_CAPACITY - lastSheetFilled;

            return (
              <div
                style={{
                  fontSize: "0.85rem",
                  marginBottom: "1rem",
                  color: isFull ? "var(--success)" : "var(--warning)",
                  fontWeight: 600,
                }}
              >
                {totalQty} label{totalQty === 1 ? "" : "s"} total — {sheetCount || 0} sheet
                {sheetCount === 1 ? "" : "s"}, last sheet {lastSheetFilled} of {LABEL_SHEET_CAPACITY} filled
                {!isFull && totalQty > 0 && ` (add ${remainingToFill} more to fill it completely)`}
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setShowQuantityModal(false)}>
              Cancel
            </Button>
            <Button loading={isGeneratingSheet} onClick={handleConfirmQuantities}>
              Generate PDF
            </Button>
          </div>
        </Modal>
      )}

      <style>{`
        .print-only-labels { display: none; }
        @media print {
          body > *:not(.print-only-labels) { display: none !important; }
          .print-only-labels {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
}

function QrPreviewModal({
  row,
  onClose,
  onDownload,
}: {
  row: CatalogSkuRow;
  onClose: () => void;
  onDownload: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    generateSkuLabelPngDataUrl({ ...row, name: row.productName }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [row]);

  return (
    <Modal onClose={onClose} title={row.productName} maxWidth="560px">
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={`Label for ${row.sku}`}
            style={{ width: "100%", maxWidth: "480px", height: "auto" }}
          />
        ) : (
          <Spinner />
        )}
      </div>
      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button icon={<Download size={16} />} onClick={onDownload}>
          Download PNG
        </Button>
      </div>
    </Modal>
  );
}

function PrintLabel({ row }: { row: CatalogSkuRow }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    generateSkuQrPngDataUrl(row.sku).then(setDataUrl);
  }, [row.sku]);

  return (
    <div
      style={{
        border: "1px solid #000",
        padding: "8px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        breakInside: "avoid",
      }}
    >
      {dataUrl && <img src={dataUrl} alt="" width={72} height={72} />}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2px" }}>
          <img src={brandMark} alt="" width={14} height={14} />
          <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", color: "#555" }}>
            ANNVRIKSH
          </span>
        </div>
        <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{row.productName}</div>
        {row.weight && <div style={{ fontSize: "0.75rem" }}>{row.weight}</div>}
        <div style={{ fontSize: "0.75rem" }}>MRP ₹{formatCurrency(row.price)}</div>
        <div style={{ fontSize: "0.8rem", fontFamily: "monospace" }}>{row.sku}</div>
      </div>
    </div>
  );
}
