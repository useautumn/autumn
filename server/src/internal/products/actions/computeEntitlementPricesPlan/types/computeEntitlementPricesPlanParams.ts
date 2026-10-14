import type { CustomizePlanV1 } from "@autumn/shared";
import type {
	Entitlement,
	EntitlementWithFeature,
	Price,
	Product,
} from "@autumn/shared";

export type EntitlementPricesPlanMode =
	| { type: "update"; protectReferencedRows: boolean }
	| { type: "version" }
	| { type: "custom" };

export type EntitlementPricesCustomize = Pick<
	CustomizePlanV1,
	"price" | "items" | "add_items" | "remove_items"
>;

export type ComputeEntitlementPricesPlanParams = {
	mode: EntitlementPricesPlanMode;
	product: Product;
	customize: EntitlementPricesCustomize;
	currentRows?: {
		prices: Price[];
		entitlements: EntitlementWithFeature[];
	};
	stripeCandidates?: {
		prices: Price[];
		entitlements: Entitlement[];
	};
};
