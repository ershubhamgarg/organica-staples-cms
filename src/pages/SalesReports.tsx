import { useMemo, useState } from "react";
import { FileSpreadsheet, FileText, FileDown, Receipt } from "lucide-react";
import { useOrderStore } from "../store/orderStore";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import { formatCurrency } from "../utils/currency";
import { formatWeight } from "../utils/weight";
import {
  type DatePreset,
  type Granularity,
  getDateRangeForPreset,
  filterOrdersByRange,
  computeSalesSummary,
  groupOrdersByPeriod,
  ordersToCSV,
  downloadCSV,
} from "../utils/salesReport";
import { SELLER, computeGstSummary, computeOrderTax } from "../utils/gst";

const presetOptions: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 Days" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_year", label: "This Year" },
  { value: "this_fy", label: "This Financial Year" },
  { value: "last_fy", label: "Last Financial Year" },
  { value: "custom", label: "Custom Range" },
];

const granularityOptions: { value: Granularity; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

function StatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <Card padding="1rem 1.25rem">
      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: "1.4rem",
          fontFamily: "'Fraunces', Georgia, serif",
          color: color ?? "var(--text-primary)",
          marginTop: "2px",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--text-secondary)",
            marginTop: "2px",
          }}
        >
          {sub}
        </div>
      )}
    </Card>
  );
}

export default function SalesReports() {
  const orders = useOrderStore((state) => state.orders);
  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);

  const range = useMemo(
    () =>
      getDateRangeForPreset(preset, { start: customStart, end: customEnd }),
    [preset, customStart, customEnd],
  );

  const filteredOrders = useMemo(() => {
    return filterOrdersByRange(orders, range).slice().sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [orders, range]);

  const summary = useMemo(
    () => computeSalesSummary(filteredOrders),
    [filteredOrders],
  );

  const breakdown = useMemo(
    () => groupOrdersByPeriod(filteredOrders, granularity),
    [filteredOrders, granularity],
  );

  const gstSummary = useMemo(
    () => computeGstSummary(filteredOrders),
    [filteredOrders],
  );

  // Shared by the PDF and Excel exports — both are the same tax report,
  // just in different formats.
  const orderTaxBreakdowns = useMemo(
    () =>
      filteredOrders
        .filter((order) => order.status !== "cancelled")
        .map((order) => computeOrderTax(order)),
    [filteredOrders],
  );

  const rangeLabel = `${range.start.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })} – ${range.end.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`;

  const handleExportCSV = () => {
    const csv = ordersToCSV(filteredOrders);
    downloadCSV(
      csv,
      `sales-orders-${range.start.toISOString().slice(0, 10)}_to_${range.end.toISOString().slice(0, 10)}.csv`,
    );
  };

  const handleExportPDF = async () => {
    try {
      setIsGeneratingPdf(true);
      // jsPDF + jspdf-autotable pull in a fair amount of code (and, via
      // jsPDF's optional features, html2canvas/dompurify) — none of which
      // any other page needs, so it's loaded on demand here rather than
      // bundled into the app's main chunk.
      const { downloadSalesReportPDF } = await import("../utils/salesReportPdf");
      downloadSalesReportPDF({
        rangeLabel,
        totalOrders: summary.totalOrders,
        activeOrders: summary.activeOrders,
        cancelledOrders: summary.cancelledOrders,
        gstSummary,
        orderTaxBreakdowns,
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setIsGeneratingExcel(true);
      // Same reasoning as the PDF import below — xlsx is a sizeable library
      // no other page needs, so it's only loaded when this button is used.
      const { downloadSalesReportExcel } = await import(
        "../utils/salesReportExcel"
      );
      downloadSalesReportExcel({
        rangeLabel,
        totalOrders: summary.totalOrders,
        activeOrders: summary.activeOrders,
        cancelledOrders: summary.cancelledOrders,
        gstSummary,
        orderTaxBreakdowns,
      });
    } finally {
      setIsGeneratingExcel(false);
    }
  };

  const hasOrders = filteredOrders.length > 0;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Sales Reports"
        subtitle="Analyze revenue and export sales data by day, week, month, or a custom range."
        action={
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Button
              variant="secondary"
              icon={<FileText size={16} />}
              onClick={handleExportCSV}
              disabled={!hasOrders}
            >
              Export CSV
            </Button>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet size={16} />}
              onClick={handleExportExcel}
              disabled={!hasOrders}
              loading={isGeneratingExcel}
            >
              Export Excel
            </Button>
            <Button
              icon={<FileDown size={16} />}
              onClick={handleExportPDF}
              disabled={!hasOrders}
              loading={isGeneratingPdf}
            >
              Export PDF
            </Button>
          </div>
        }
      />

      <Card style={{ marginBottom: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {presetOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setPreset(option.value)}
                className={
                  preset === option.value ? "btn btn-secondary" : "btn-ghost"
                }
                style={{
                  padding: "6px 14px",
                  fontSize: "0.85rem",
                  borderRadius: "var(--radius-full)",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {granularityOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setGranularity(option.value)}
                className={
                  granularity === option.value
                    ? "btn btn-secondary"
                    : "btn-ghost"
                }
                style={{
                  padding: "6px 14px",
                  fontSize: "0.85rem",
                  borderRadius: "var(--radius-full)",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {preset === "custom" && (
          <div
            style={{
              display: "flex",
              gap: "1rem",
              flexWrap: "wrap",
              marginTop: "1rem",
              paddingTop: "1rem",
              borderTop: "1px solid var(--border-color)",
            }}
          >
            <div className="form-group" style={{ marginBottom: 0, minWidth: "180px" }}>
              <label>Start Date</label>
              <input
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: "180px" }}>
              <label>End Date</label>
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: "1rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border-color)",
            fontSize: "0.85rem",
            color: "var(--text-secondary)",
          }}
        >
          Showing <strong style={{ color: "var(--text-primary)" }}>{rangeLabel}</strong>
          {" · "}
          {filteredOrders.length} order{filteredOrders.length === 1 ? "" : "s"}
        </div>
      </Card>

      {!hasOrders ? (
        <Card>
          <EmptyState
            icon={Receipt}
            message="No orders in this date range."
          />
        </Card>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            <StatCard
              label="Total Orders"
              value={String(summary.totalOrders)}
              sub={`${summary.cancelledOrders} cancelled`}
            />
            <StatCard
              label="Net Revenue"
              value={`₹${formatCurrency(summary.netRevenue)}`}
              color="var(--success)"
            />
            <StatCard
              label="Gross Revenue"
              value={`₹${formatCurrency(summary.grossRevenue)}`}
            />
            <StatCard
              label="Total Discount"
              value={`₹${formatCurrency(summary.totalDiscount)}`}
              color="var(--danger)"
            />
            <StatCard
              label="Total Profit"
              value={`₹${formatCurrency(summary.totalProfit)}`}
              color={summary.totalProfit >= 0 ? "var(--success)" : "var(--danger)"}
            />
            <StatCard
              label="Avg Order Value"
              value={`₹${formatCurrency(summary.avgOrderValue)}`}
            />
            <StatCard
              label="Refunds"
              value={`₹${formatCurrency(summary.refundedAmount)}`}
              sub={`${summary.refundedCount} processed`}
              color="var(--warning)"
            />
            <StatCard
              label="Items Sold"
              value={String(summary.totalItemsSold)}
              sub={formatWeight(summary.totalWeightKg)}
            />
          </div>

          <Card style={{ marginBottom: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.5rem",
                marginBottom: "1.25rem",
              }}
            >
              <h3 style={{ fontSize: "1.05rem" }}>GST / Tax Summary</h3>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Seller GSTIN:{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {SELLER.gstin}
                </strong>{" "}
                · {SELLER.state} ({SELLER.stateCode})
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <StatCard
                label="Taxable Value"
                value={`₹${formatCurrency(gstSummary.taxableValue)}`}
              />
              <StatCard
                label="CGST"
                value={`₹${formatCurrency(gstSummary.cgst)}`}
              />
              <StatCard
                label="SGST"
                value={`₹${formatCurrency(gstSummary.sgst)}`}
              />
              <StatCard
                label="IGST"
                value={`₹${formatCurrency(gstSummary.igst)}`}
              />
              <StatCard
                label="Total GST Collected"
                value={`₹${formatCurrency(gstSummary.totalTax)}`}
                color="var(--accent-primary)"
              />
              <StatCard
                label="Intra / Inter-State Orders"
                value={`${gstSummary.intraStateOrders} / ${gstSummary.interStateOrders}`}
              />
            </div>

            <div
              className="responsive-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1.5rem",
              }}
            >
              <div>
                <h4
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--text-secondary)",
                    marginBottom: "0.75rem",
                  }}
                >
                  HSN/SAC-wise Tax Summary
                </h4>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", textAlign: "left" }}>
                    <thead>
                      <tr
                        style={{
                          borderBottom: "1px solid var(--border-color)",
                          color: "var(--text-secondary)",
                          fontSize: "0.85rem",
                        }}
                      >
                        <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                          HSN
                        </th>
                        <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                          Description
                        </th>
                        <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                          Qty
                        </th>
                        <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                          Taxable
                        </th>
                        <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                          CGST
                        </th>
                        <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                          SGST
                        </th>
                        <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                          IGST
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {gstSummary.hsnSummary.map((row) => (
                        <tr
                          key={row.hsn}
                          style={{ borderBottom: "1px solid var(--border-color)" }}
                        >
                          <td
                            style={{
                              padding: "8px 12px",
                              fontWeight: 500,
                              fontFamily: "monospace",
                            }}
                          >
                            {row.hsn}
                          </td>
                          <td
                            style={{
                              padding: "8px 12px",
                              color: "var(--text-secondary)",
                              maxWidth: "220px",
                            }}
                          >
                            {row.description}
                          </td>
                          <td style={{ padding: "8px 12px" }}>{row.quantity}</td>
                          <td style={{ padding: "8px 12px" }}>
                            ₹{formatCurrency(row.taxableValue)}
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            ₹{formatCurrency(row.cgst)}
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            ₹{formatCurrency(row.sgst)}
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            ₹{formatCurrency(row.igst)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--text-secondary)",
                    marginBottom: "0.75rem",
                  }}
                >
                  Place of Supply (State-wise)
                </h4>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", textAlign: "left" }}>
                    <thead>
                      <tr
                        style={{
                          borderBottom: "1px solid var(--border-color)",
                          color: "var(--text-secondary)",
                          fontSize: "0.85rem",
                        }}
                      >
                        <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                          State
                        </th>
                        <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                          Orders
                        </th>
                        <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                          Taxable
                        </th>
                        <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                          Tax
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {gstSummary.stateSummary.map((row) => (
                        <tr
                          key={row.state}
                          style={{ borderBottom: "1px solid var(--border-color)" }}
                        >
                          <td style={{ padding: "8px 12px", fontWeight: 500 }}>
                            {row.state}
                            {row.stateCode ? ` (${row.stateCode})` : ""}
                          </td>
                          <td style={{ padding: "8px 12px" }}>{row.orders}</td>
                          <td style={{ padding: "8px 12px" }}>
                            ₹{formatCurrency(row.taxableValue)}
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            ₹{formatCurrency(row.totalTax)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </Card>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: "1.5rem",
              marginBottom: "1.5rem",
            }}
            className="responsive-grid"
          >
            <Card>
              <h3 style={{ fontSize: "1.05rem", marginBottom: "1rem" }}>
                Revenue by{" "}
                {granularity === "day"
                  ? "Day"
                  : granularity === "week"
                    ? "Week"
                    : "Month"}
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", textAlign: "left" }}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid var(--border-color)",
                        color: "var(--text-secondary)",
                        fontSize: "0.85rem",
                      }}
                    >
                      <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                        Period
                      </th>
                      <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                        Orders
                      </th>
                      <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                        Revenue
                      </th>
                      <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                        Discount
                      </th>
                      <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                        Profit
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((row) => (
                      <tr
                        key={row.periodLabel}
                        style={{ borderBottom: "1px solid var(--border-color)" }}
                      >
                        <td style={{ padding: "8px 12px", fontWeight: 500 }}>
                          {row.periodLabel}
                        </td>
                        <td style={{ padding: "8px 12px" }}>{row.activeOrders}</td>
                        <td style={{ padding: "8px 12px" }}>
                          ₹{formatCurrency(row.netRevenue)}
                        </td>
                        <td style={{ padding: "8px 12px", color: "var(--danger)" }}>
                          ₹{formatCurrency(row.totalDiscount)}
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            color:
                              row.totalProfit >= 0
                                ? "var(--success)"
                                : "var(--danger)",
                          }}
                        >
                          ₹{formatCurrency(row.totalProfit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <h3 style={{ fontSize: "1.05rem", marginBottom: "1rem" }}>
                Payment Methods
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {Object.entries(summary.paymentMethodBreakdown).map(
                  ([method, data]) => (
                    <div
                      key={method}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "8px 0",
                        borderBottom: "1px solid var(--border-color)",
                        fontSize: "0.9rem",
                      }}
                    >
                      <span style={{ textTransform: "uppercase" }}>{method}</span>
                      <span>
                        {data.count} · ₹{formatCurrency(data.amount)}
                      </span>
                    </div>
                  ),
                )}
              </div>

              <h3
                style={{
                  fontSize: "1.05rem",
                  marginTop: "1.5rem",
                  marginBottom: "1rem",
                }}
              >
                Order Status
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {Object.entries(summary.statusBreakdown).map(([status, count]) => (
                  <div
                    key={status}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 0",
                      borderBottom: "1px solid var(--border-color)",
                      fontSize: "0.9rem",
                    }}
                  >
                    <span style={{ textTransform: "capitalize" }}>{status}</span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card style={{ marginBottom: "1.5rem" }}>
            <h3 style={{ fontSize: "1.05rem", marginBottom: "1rem" }}>
              Top Products
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", textAlign: "left" }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border-color)",
                      color: "var(--text-secondary)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>Product</th>
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                      Qty Sold
                    </th>
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topProducts.map((product) => (
                    <tr
                      key={product.name}
                      style={{ borderBottom: "1px solid var(--border-color)" }}
                    >
                      <td style={{ padding: "8px 12px", fontWeight: 500 }}>
                        {product.name}
                      </td>
                      <td style={{ padding: "8px 12px" }}>{product.quantity}</td>
                      <td style={{ padding: "8px 12px" }}>
                        ₹{formatCurrency(product.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <h3 style={{ fontSize: "1.05rem", marginBottom: "1rem" }}>
              Orders ({filteredOrders.length})
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", textAlign: "left" }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border-color)",
                      color: "var(--text-secondary)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>Order</th>
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>Date</th>
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                      Customer
                    </th>
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>Items</th>
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>Total</th>
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>
                      Payment
                    </th>
                    <th style={{ padding: "8px 12px", fontWeight: 500 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders
                    .slice()
                    .reverse()
                    .map((order) => (
                      <tr
                        key={order.id}
                        style={{ borderBottom: "1px solid var(--border-color)" }}
                      >
                        <td
                          style={{
                            padding: "8px 12px",
                            fontWeight: 600,
                            fontFamily: "monospace",
                            fontSize: "0.85rem",
                          }}
                        >
                          ORD-{order.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          {new Date(order.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          {order.delivery_address?.name ?? "Guest"}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          {(order.items ?? []).reduce(
                            (sum, item) => sum + item.quantity,
                            0,
                          )}
                        </td>
                        <td style={{ padding: "8px 12px", fontWeight: 500 }}>
                          ₹{formatCurrency(order.total_amount)}
                        </td>
                        <td style={{ padding: "8px 12px", textTransform: "uppercase" }}>
                          {order.payment_method}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <span
                            className={`badge badge-${
                              order.status === "delivered"
                                ? "success"
                                : order.status === "cancelled"
                                  ? "danger"
                                  : "secondary"
                            }`}
                          >
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
