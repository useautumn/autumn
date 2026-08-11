import type { FullProduct } from "@autumn/shared";
import type { EntitlementPricesPlan } from "@/internal/products/actions/computeEntitlementPricesPlan";
import type { ProductDetailsPlan } from "./productDetailsPlan";

export type UpsertProductOp = "create" | "update" | "none";

export type UpsertProductSource =
	| "direct"
	| "all_versions"
	| "variant_propagation"
	| "variant_link"
	| "license_pin"
	| "license_adopt"
	| "repoint";

/** Which product row this plan writes, and its before/after FullProduct. */
export type UpsertProductRow = {
	planId: string;
	/** Existing version to update, or the version this op mints. */
	version: number;
	op: UpsertProductOp;
	source: UpsertProductSource;
	/** Baseline row; null on first create. */
	currentFullProduct: FullProduct | null;
	/** Projected row after this op applies — feeds the state fold. */
	nextFullProduct: FullProduct;
};

/**
 * One write intent per product ROW (plan_id @ version).
 * Flat list on UpdateCatalogPlan = execute order.
 * Future facets (trial, billing controls, links…) enter as optional keys.
 */
export type UpsertProductPlan = {
	row: UpsertProductRow;

	details?: ProductDetailsPlan;
	/** Absent = items/price facet not run. */
	entitlementPricesPlan?: EntitlementPricesPlan;

	state: { hasCustomers: boolean };
};
