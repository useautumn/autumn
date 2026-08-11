import type { BasePriceParams } from "@autumn/shared/api/products/components/basePrice/basePrice";
import type { CreatePlanItemParamsV1 } from "@autumn/shared/api/products/items/crud/createPlanItemParamsV1";
import type { ApiPlanItemV1 } from "@autumn/shared/api/products/items/apiPlanItemV1";
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

export type ComputeEntitlementPricesPlanParams = {
	mode: EntitlementPricesPlanMode;
	/** Stamp only — org_id / internal_id / env / version. */
	product: Product;
	/** Absent = the plan has no base price (PUT semantics). */
	basePrice?: BasePriceParams | null;
	/** Full desired set — required; callers with no item changes don't call. */
	planItems: ApiPlanItemV1[] | CreatePlanItemParamsV1[];
	/** Omitted = create (everything mints new). */
	currentRows?: {
		prices: Price[];
		entitlements: EntitlementWithFeature[];
	};
};
