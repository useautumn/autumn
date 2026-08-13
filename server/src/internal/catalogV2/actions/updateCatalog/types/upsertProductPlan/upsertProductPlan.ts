import type {
	CatalogPlanVersioningStrategy,
	FullProduct,
} from "@autumn/shared";
import type { EntitlementPricesPlan } from "@/internal/products/actions/computeEntitlementPricesPlan";
import type { FreeTrialPlan } from "./freeTrialPlan";
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
	/** Resolved versioning strategy for this write (params default → existing). */
	versioning: CatalogPlanVersioningStrategy;
	/** Baseline row at this version; null on create / mint. */
	currentFullProduct: FullProduct | null;
	/** Set only on `new_version` mint — the latest row cloned from. */
	baseFullProduct: FullProduct | null;
	/** Projected row after this op applies — feeds the state fold. */
	nextFullProduct: FullProduct;
};

/**
 * One write intent per product ROW (plan_id @ version).
 * Flat list on UpdateCatalogPlan = execute order.
 * Future facets (billing controls, links…) enter as optional keys.
 */
export type UpsertProductPlan = {
	row: UpsertProductRow;

	details?: ProductDetailsPlan;
	/** Absent = items/price facet not run. */
	entitlementPricesPlan?: EntitlementPricesPlan;
	/** Absent = free-trial facet unchanged (or omitted). */
	freeTrialPlan?: FreeTrialPlan;

	state: { hasCustomers: boolean };
};
