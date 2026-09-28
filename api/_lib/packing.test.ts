import { describe, it, expect } from "vitest";
import {
  resolveOrderPackingItems,
  validateScan,
  isPackingComplete,
  hasOrderDrifted,
  isOrderEligibleForPacking,
  type CatalogEntry,
  type OrderCartItem,
  type SessionItemLike,
} from "./packing";

function catalog(entries: CatalogEntry[]): Map<string, CatalogEntry> {
  const map = new Map<string, CatalogEntry>();
  for (const e of entries) {
    map.set(`${e.productId}:${e.variantId ?? ""}`, e);
  }
  return map;
}

function skuIndex(entries: CatalogEntry[]): Map<string, CatalogEntry> {
  const map = new Map<string, CatalogEntry>();
  for (const e of entries) map.set(e.sku, e);
  return map;
}

const rcp200: CatalogEntry = {
  sku: "ANN-RCP-200",
  productId: "11",
  variantId: 101,
  label: "Byadgi Red Chilli Powder — 200 g",
  weight: "200 g",
  isActive: true,
  isBundle: false,
};
const rcp100: CatalogEntry = {
  sku: "ANN-RCP-100",
  productId: "11",
  variantId: 102,
  label: "Byadgi Red Chilli Powder — 100 g",
  weight: "100 g",
  isActive: true,
  isBundle: false,
};
const chia100: CatalogEntry = {
  sku: "ANN-CHIA-100",
  productId: "7",
  variantId: 28,
  label: "Chia Seeds — 100 g",
  weight: "100 g",
  isActive: true,
  isBundle: false,
};

describe("resolveOrderPackingItems", () => {
  it("resolves a plain variant item to one required-qty row", () => {
    const items: OrderCartItem[] = [
      { id: 11, variantId: 101, weight: "200 g", quantity: 2 },
    ];
    const { items: resolved, blockers } = resolveOrderPackingItems(
      items,
      catalog([rcp200]),
      [],
    );
    expect(blockers).toHaveLength(0);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ sku: "ANN-RCP-200", requiredQty: 2 });
  });

  it("blocks an item with no assigned SKU instead of silently dropping it", () => {
    const items: OrderCartItem[] = [
      { id: 999, variantId: 1, weight: "200 g", quantity: 1 },
    ];
    const { items: resolved, blockers } = resolveOrderPackingItems(
      items,
      catalog([rcp200]),
      [],
    );
    expect(resolved).toHaveLength(0);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].reason).toMatch(/No SKU is assigned/);
  });

  it("handles duplicate order lines for the same SKU without merging or double-counting", () => {
    const items: OrderCartItem[] = [
      { id: 11, variantId: 101, weight: "200 g", quantity: 1 },
      { id: 11, variantId: 101, weight: "200 g", quantity: 3 },
    ];
    const { items: resolved } = resolveOrderPackingItems(
      items,
      catalog([rcp200]),
      [],
    );
    expect(resolved).toHaveLength(2);
    expect(resolved[0].requiredQty).toBe(1);
    expect(resolved[1].requiredQty).toBe(3);
    expect(resolved[0].orderItemKey).not.toBe(resolved[1].orderItemKey);
  });

  it("expands a configured bundle into its component SKUs, scaled by quantity", () => {
    const bundle: CatalogEntry = {
      sku: "ANN-GIFT-BOX",
      productId: "50",
      variantId: null,
      label: "Gift Box",
      weight: null,
      isActive: true,
      isBundle: true,
    };
    const items: OrderCartItem[] = [{ id: 50, quantity: 2 }];
    const { items: resolved, blockers } = resolveOrderPackingItems(
      items,
      catalog([bundle]),
      [
        { bundleSku: "ANN-GIFT-BOX", componentSku: "ANN-RCP-100", componentQty: 1 },
        { bundleSku: "ANN-GIFT-BOX", componentSku: "ANN-CHIA-100", componentQty: 1 },
      ],
    );
    expect(blockers).toHaveLength(0);
    expect(resolved).toHaveLength(2);
    expect(resolved.find((r) => r.sku === "ANN-RCP-100")?.requiredQty).toBe(2);
    expect(resolved.find((r) => r.sku === "ANN-CHIA-100")?.requiredQty).toBe(2);
    expect(resolved.every((r) => r.parentBundleSku === "ANN-GIFT-BOX")).toBe(true);
  });

  it("blocks a bundle with no configured components, with a clear message", () => {
    const bundle: CatalogEntry = {
      sku: "ANN-GIFT-BOX",
      productId: "50",
      variantId: null,
      label: "Gift Box",
      weight: null,
      isActive: true,
      isBundle: true,
    };
    const items: OrderCartItem[] = [{ id: 50, quantity: 1 }];
    const { items: resolved, blockers } = resolveOrderPackingItems(
      items,
      catalog([bundle]),
      [],
    );
    expect(resolved).toHaveLength(0);
    expect(blockers[0].reason).toMatch(/no configured components/);
  });
});

describe("validateScan", () => {
  const items: OrderCartItem[] = [
    { id: 11, variantId: 101, weight: "200 g", quantity: 1 },
  ];
  const { items: resolved } = resolveOrderPackingItems(
    items,
    catalog([rcp200, rcp100]),
    [],
  );
  const sessionItems: SessionItemLike[] = resolved.map((r, id) => ({
    id,
    sku: r.sku,
    label: r.label,
    productId: r.productId,
    requiredQty: r.requiredQty,
    packedQty: 0,
  }));
  const index = skuIndex([rcp200, rcp100, chia100]);

  it("accepts the correct SKU and increments exactly once", () => {
    const result = validateScan("ANN-RCP-200", true, sessionItems, index);
    expect(result.outcome).toBe("accepted");
    expect(result.matchedItem?.sku).toBe("ANN-RCP-200");
  });

  it("names the product, not just the SKU, in scan messages (unreadable at the packing desk otherwise)", () => {
    const result = validateScan("ANN-RCP-200", true, sessionItems, index);
    expect(result.message).toContain(rcp200.label);
  });

  it("rejects a 100 g scan when the order needs 200 g, naming the expected product and size", () => {
    const result = validateScan("ANN-RCP-100", true, sessionItems, index);
    expect(result.outcome).toBe("rejected_wrong_variant");
    expect(result.message).toContain(rcp200.label);
    expect(result.message).toMatch(/ANN-RCP-200/);
  });

  it("rejects an unknown SKU", () => {
    const result = validateScan("NOT-A-REAL-SKU", true, sessionItems, index);
    expect(result.outcome).toBe("rejected_unknown_sku");
  });

  it("rejects a valid but unordered SKU", () => {
    const result = validateScan("ANN-CHIA-100", true, sessionItems, index);
    expect(result.outcome).toBe("rejected_not_ordered");
  });

  it("rejects once the required quantity is already reached (overpacking)", () => {
    const full: SessionItemLike[] = [
      { id: 0, sku: "ANN-RCP-200", label: rcp200.label, productId: "11", requiredQty: 1, packedQty: 1 },
    ];
    const result = validateScan("ANN-RCP-200", true, full, index);
    expect(result.outcome).toBe("rejected_overpack");
  });

  it("rejects any scan against an ineligible (e.g. cancelled) order", () => {
    const result = validateScan("ANN-RCP-200", false, sessionItems, index);
    expect(result.outcome).toBe("rejected_ineligible_order");
  });

  it("trims whitespace but does not change SKU case", () => {
    const result = validateScan("  ANN-RCP-200  ", true, sessionItems, index);
    expect(result.outcome).toBe("accepted");
    const caseResult = validateScan("ann-rcp-200", true, sessionItems, index);
    expect(caseResult.outcome).toBe("rejected_unknown_sku");
  });

  it("allows multiple required packs of the same SKU to be scanned intentionally, filling duplicate lines deterministically", () => {
    const twoLines: SessionItemLike[] = [
      { id: 0, sku: "ANN-RCP-200", label: rcp200.label, productId: "11", requiredQty: 1, packedQty: 0 },
      { id: 1, sku: "ANN-RCP-200", label: rcp200.label, productId: "11", requiredQty: 2, packedQty: 0 },
    ];
    const first = validateScan("ANN-RCP-200", true, twoLines, index);
    expect(first.outcome).toBe("accepted");
    expect(first.matchedItem?.id).toBe(0);
    twoLines[0].packedQty = 1; // simulate the atomic DB increment

    const second = validateScan("ANN-RCP-200", true, twoLines, index);
    expect(second.outcome).toBe("accepted");
    expect(second.matchedItem?.id).toBe(1);
    twoLines[1].packedQty = 1;

    const third = validateScan("ANN-RCP-200", true, twoLines, index);
    expect(third.outcome).toBe("accepted");
    expect(third.matchedItem?.id).toBe(1);
    twoLines[1].packedQty = 2;

    const fourth = validateScan("ANN-RCP-200", true, twoLines, index);
    expect(fourth.outcome).toBe("rejected_overpack");
  });
});

describe("isPackingComplete", () => {
  it("is false until every line matches exactly", () => {
    expect(
      isPackingComplete([
        { id: 0, sku: "A", label: "A", productId: "1", requiredQty: 2, packedQty: 1 },
      ]),
    ).toBe(false);
  });

  it("is true only when every required quantity is met exactly, none over", () => {
    expect(
      isPackingComplete([
        { id: 0, sku: "A", label: "A", productId: "1", requiredQty: 2, packedQty: 2 },
        { id: 1, sku: "B", label: "B", productId: "2", requiredQty: 1, packedQty: 1 },
      ]),
    ).toBe(true);
  });

  it("is false for an empty (unresolved) session", () => {
    expect(isPackingComplete([])).toBe(false);
  });
});

describe("hasOrderDrifted", () => {
  it("detects a status change", () => {
    expect(hasOrderDrifted([], "pending", [], "cancelled")).toBe(true);
  });

  it("detects an item change", () => {
    const a: OrderCartItem[] = [{ id: 1, quantity: 1 }];
    const b: OrderCartItem[] = [{ id: 1, quantity: 2 }];
    expect(hasOrderDrifted(a, "pending", b, "pending")).toBe(true);
  });

  it("is false when nothing changed", () => {
    const a: OrderCartItem[] = [{ id: 1, quantity: 1 }];
    expect(hasOrderDrifted(a, "pending", a, "pending")).toBe(false);
  });
});

describe("isOrderEligibleForPacking", () => {
  it("allows pending and processing", () => {
    expect(isOrderEligibleForPacking("pending")).toBe(true);
    expect(isOrderEligibleForPacking("processing")).toBe(true);
  });

  it("rejects cancelled, shipped, delivered", () => {
    expect(isOrderEligibleForPacking("cancelled")).toBe(false);
    expect(isOrderEligibleForPacking("shipped")).toBe(false);
    expect(isOrderEligibleForPacking("delivered")).toBe(false);
  });
});
