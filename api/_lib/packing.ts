// Scan & Pack — pure resolution/validation logic.
//
// Deliberately framework- and DB-free: every function here takes plain data
// in and returns plain data out, so it can be unit tested (see
// api/_lib/packing.test.ts) without a database or an Edge runtime. The only
// DB-touching code is in api/orders/packing/*.ts, which calls these
// functions and then persists their results.

export type OrderCartItem = {
  id: number | string;
  name?: string;
  weight?: string;
  quantity: number;
  variantId?: string | number;
  sku?: string | null;
  [key: string]: unknown;
};

/** One row of the product/variant SKU catalog, as needed to resolve and
 * validate a scan — a deliberately narrow projection of products/
 * product_variants, not the full row shape used elsewhere in the app. */
export type CatalogEntry = {
  sku: string;
  productId: string;
  variantId: number | null;
  label: string;
  weight: string | null;
  isActive: boolean;
  isBundle: boolean;
};

export type BundleComponent = {
  bundleSku: string;
  componentSku: string;
  componentQty: number;
};

export type ResolvedPackItem = {
  orderItemKey: string;
  sku: string;
  productId: string | null;
  variantId: number | null;
  label: string;
  weight: string | null;
  parentBundleSku: string | null;
  requiredQty: number;
};

export type ResolutionBlocker = {
  orderItemKey: string;
  reason: string;
};

export type ResolutionResult = {
  items: ResolvedPackItem[];
  blockers: ResolutionBlocker[];
};

/**
 * Resolves an order's line items into the flat list of SKU requirements
 * Scan & Pack needs to track — one row per physical pack. A plain item
 * becomes one row (or is skipped/blocked); a bundle (`isBundle` on its
 * catalog entry) expands into one row per configured component, tagged with
 * `parentBundleSku` so completion logic can tell a component apart from an
 * identical SKU ordered on its own (see validateScan's bundle notes).
 *
 * Never silently drops a line it can't resolve — anything it can't match to
 * an active catalog SKU (or, for a bundle, can't find components for) comes
 * back as a `blocker` instead, and the caller is expected to refuse to start
 * a packing session until every blocker is resolved (assign the missing SKU,
 * configure the bundle, etc.) — see the "one unresolved item blocks the
 * whole order" decision in the staff guide.
 */
export function resolveOrderPackingItems(
  items: OrderCartItem[],
  catalogByProductVariant: Map<string, CatalogEntry>,
  bundleComponents: BundleComponent[],
): ResolutionResult {
  const resolved: ResolvedPackItem[] = [];
  const blockers: ResolutionBlocker[] = [];
  const componentsByBundle = new Map<string, BundleComponent[]>();
  for (const c of bundleComponents) {
    const list = componentsByBundle.get(c.bundleSku) ?? [];
    list.push(c);
    componentsByBundle.set(c.bundleSku, list);
  }

  items.forEach((item, index) => {
    const productId = String(item.id);
    const variantId =
      item.variantId != null && item.variantId !== ""
        ? Number(item.variantId)
        : null;
    const catalogKey = `${productId}:${variantId ?? ""}`;
    const orderItemKey = `${index}:${catalogKey}`;
    const qty = Math.max(0, Math.floor(item.quantity ?? 0));

    if (qty <= 0) return;

    const entry = catalogByProductVariant.get(catalogKey);

    if (!entry) {
      blockers.push({
        orderItemKey,
        reason: `No SKU is assigned yet for "${item.name ?? productId}"${
          item.weight ? ` (${item.weight})` : ""
        } — assign one from Manage SKUs before this order can be packed.`,
      });
      return;
    }

    if (!entry.isActive) {
      blockers.push({
        orderItemKey,
        reason: `SKU ${entry.sku} ("${entry.label}") is marked inactive — reactivate it or correct the order before packing.`,
      });
      return;
    }

    if (entry.isBundle) {
      const components = componentsByBundle.get(entry.sku) ?? [];
      if (components.length === 0) {
        blockers.push({
          orderItemKey,
          reason: `Bundle SKU ${entry.sku} ("${entry.label}") has no configured components — configure it under Manage SKUs before packing.`,
        });
        return;
      }
      for (const component of components) {
        resolved.push({
          orderItemKey: `${orderItemKey}:${component.componentSku}`,
          sku: component.componentSku,
          productId,
          variantId,
          label: `${entry.label} — component ${component.componentSku}`,
          weight: entry.weight,
          parentBundleSku: entry.sku,
          requiredQty: component.componentQty * qty,
        });
      }
      return;
    }

    resolved.push({
      orderItemKey,
      sku: entry.sku,
      productId,
      variantId,
      label: entry.label,
      weight: entry.weight,
      parentBundleSku: null,
      requiredQty: qty,
    });
  });

  return { items: resolved, blockers };
}

export type SessionItemLike = {
  id: number;
  sku: string;
  productId: string | null;
  requiredQty: number;
  packedQty: number;
};

export type ScanOutcome =
  | "accepted"
  | "rejected_unknown_sku"
  | "rejected_not_ordered"
  | "rejected_wrong_variant"
  | "rejected_overpack"
  | "rejected_ineligible_order";

export type ScanValidation = {
  outcome: ScanOutcome;
  message: string;
  /** The session item this scan matches, when the outcome is one that
   * identifies a specific line ("accepted" or "rejected_overpack"). */
  matchedItem: SessionItemLike | null;
};

/**
 * Validates one scanned SKU against this session's remaining requirements.
 * Pure decision logic — the caller (api/orders/packing/scan.ts) is
 * responsible for actually incrementing packed_qty (atomically, via the
 * packing_increment_item DB function) when this returns "accepted".
 *
 * SKUs are compared case-sensitively, as stored — this system has no
 * existing case-folding convention for any other identifier (order IDs,
 * product IDs, coupon codes are all compared as-is), so a scanned SKU is
 * trimmed of surrounding whitespace only, never re-cased.
 */
export function validateScan(
  rawInput: string,
  isOrderEligible: boolean,
  sessionItems: SessionItemLike[],
  catalogSkuIndex: Map<string, CatalogEntry>,
): ScanValidation {
  const sku = rawInput.trim();

  if (!isOrderEligible) {
    return {
      outcome: "rejected_ineligible_order",
      message: "This order is no longer eligible for packing (cancelled or already packed).",
      matchedItem: null,
    };
  }

  const catalogEntry = catalogSkuIndex.get(sku);
  if (!catalogEntry || !catalogEntry.isActive) {
    return {
      outcome: "rejected_unknown_sku",
      message: `"${sku}" is not a recognized, active SKU.`,
      matchedItem: null,
    };
  }

  // Duplicate order lines for the same SKU (e.g. two separate lines that
  // both happen to resolve to ANN-RCP-200) are treated as one shared pool —
  // whichever matching line still has remaining capacity is credited first,
  // deterministically, so a physical pack is never counted against a line
  // that's already full while a sibling line still needs it.
  const candidates = sessionItems.filter((i) => i.sku === sku);
  const matchingLine =
    candidates.find((i) => i.packedQty < i.requiredQty) ??
    candidates[candidates.length - 1];

  if (!matchingLine) {
    // Valid SKU, but is it a different pack size of a product that *is*
    // required on this order? That's a more actionable message than a bare
    // "not ordered".
    const sameProductLine = sessionItems.find(
      (i) => i.productId && i.productId === catalogEntry.productId,
    );
    if (sameProductLine) {
      return {
        outcome: "rejected_wrong_variant",
        message: `Wrong pack size — this order needs ${sameProductLine.sku}, not ${sku}.`,
        matchedItem: null,
      };
    }
    return {
      outcome: "rejected_not_ordered",
      message: `${sku} is not part of this order.`,
      matchedItem: null,
    };
  }

  if (matchingLine.packedQty >= matchingLine.requiredQty) {
    return {
      outcome: "rejected_overpack",
      message: `Already have the required ${matchingLine.requiredQty} pack(s) of ${sku} — this scan wasn't counted.`,
      matchedItem: matchingLine,
    };
  }

  return {
    outcome: "accepted",
    message: `Pack ${matchingLine.packedQty + 1} of ${matchingLine.requiredQty} for ${sku} confirmed.`,
    matchedItem: matchingLine,
  };
}

/** Order statuses eligible to be packed. Kept narrow and separate from the
 * existing Orders.status logic elsewhere in the app rather than reusing it,
 * since "packable" is a Scan & Pack–specific concept, not a general order
 * state. */
export const PACKING_ELIGIBLE_ORDER_STATUSES = ["pending", "processing"];

export function isOrderEligibleForPacking(status: string): boolean {
  return PACKING_ELIGIBLE_ORDER_STATUSES.includes(status);
}

/**
 * True when every resolved item's packed_qty exactly equals its required
 * quantity — the only state "Complete Packing" is allowed to succeed from.
 */
export function isPackingComplete(sessionItems: SessionItemLike[]): boolean {
  return (
    sessionItems.length > 0 &&
    sessionItems.every((i) => i.packedQty === i.requiredQty)
  );
}

/**
 * Detects an order that changed underneath an active packing session (items
 * edited, or the order no longer eligible) — completion must be blocked and
 * the session reconciled rather than silently trusting stale requirements.
 */
export function hasOrderDrifted(
  snapshotItems: OrderCartItem[],
  snapshotStatus: string,
  liveItems: OrderCartItem[],
  liveStatus: string,
): boolean {
  if (snapshotStatus !== liveStatus) return true;
  return JSON.stringify(snapshotItems) !== JSON.stringify(liveItems);
}
