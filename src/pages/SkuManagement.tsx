import { useEffect, useMemo, useState } from "react";
import { Save, Printer, Download, AlertTriangle, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useSkuStore, type SkuReviewRow } from "../store/skuStore";
import { useProductStore } from "../store/productStore";
import Button from "../components/ui/Button";
import Spinner from "../components/ui/Spinner";
import PageHeader from "../components/ui/PageHeader";
import { generateSkuQrPngDataUrl, generateSkuLabelPngDataUrl } from "../utils/skuQr";
import { formatCurrency } from "../utils/currency";

type CatalogSkuRow = {
  entityType: "product" | "variant";
  entityId: number;
  sku: string;
  name: string;
  weight: string | null;
  /** Selling price after any variant/product-level discount — what a
   * customer actually pays, same as everywhere else in the CMS shows price. */
  price: number;
};

function SkuQrThumb({ sku }: { sku: string }) {
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
  return <img src={dataUrl} alt={`QR for ${sku}`} width={64} height={64} />;
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
      <div>
        <div style={{ fontWeight: 600 }}>{row.name}</div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
          {row.weight ?? ""} {row.category ? `· ${row.category}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. ANN-RCP-200"
          style={{ width: "200px" }}
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
          weight: p.weight,
          price: p.price * (1 - (p.discount ?? 0) / 100),
        });
      }
      for (const v of p.variants ?? []) {
        if (v.sku) {
          rows.push({
            entityType: "variant",
            entityId: v.id!,
            sku: v.sku,
            name: `${p.name} — ${v.label}`,
            weight: v.weight,
            price: v.price * (1 - (v.discount_percent ?? 0) / 100),
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
    const dataUrl = await generateSkuLabelPngDataUrl(row);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${row.sku}.png`;
    a.click();
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
          <Button
            variant="secondary"
            size="sm"
            icon={<Printer size={14} />}
            disabled={selected.size === 0}
            onClick={handlePrintSelected}
          >
            Print Selected Labels ({selected.size})
          </Button>
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
              <SkuQrThumb sku={row.sku} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{row.name}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  <code>{row.sku}</code> {row.weight ? `· ${row.weight}` : ""} · ₹{formatCurrency(row.price)}
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
        <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{row.name}</div>
        {row.weight && <div style={{ fontSize: "0.75rem" }}>{row.weight}</div>}
        <div style={{ fontSize: "0.75rem" }}>₹{formatCurrency(row.price)}</div>
        <div style={{ fontSize: "0.8rem", fontFamily: "monospace" }}>{row.sku}</div>
      </div>
    </div>
  );
}
