import type { CustomizePlanV1 } from "@autumn/shared";
import type {
	EntitlementWithFeature,
	Price,
	Product,
} from "@autumn/shared";

/**
 * Mutually exclusive write targets. Protect only exists on update —
 * invalid combinations are unrepresentable.
 */
export type EntitlementPricesPlanMode =
	| { type: "update"; protectReferencedRows: boolean }
	| { type: "version" }
	| { type: "custom" };

/** Items/price slice of CustomizePlanV1 — not free_trial / billing_controls / licenses. */
export type EntitlementPricesCustomize = Pick<
	CustomizePlanV1,
	"price" | "items" | "add_items" | "remove_items"
>;

export type ComputeEntitlementPricesPlanParams = {
	mode: EntitlementPricesPlanMode;
	/** Stamp only — org_id / internal_id / env / version. */
	product: Product;
	/**
	 * PUT (`items`) and/or PATCH (`price` / `add_items` / `remove_items`).
	 * Omit a lane = leave that lane's current rows alone.
	 */
	customize: EntitlementPricesCustomize;
	/** Omitted = create (everything mints new). */
	currentRows?: {
		prices: Price[];
		entitlements: EntitlementWithFeature[];
	};
};
