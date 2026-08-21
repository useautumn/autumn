import type { EntitlementPrice } from "@autumn/shared";
import type { CustomerProductTransition } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeCustomerProductTransition.js";
import type { EntitlementPriceFilter } from "./entitlementPriceFilter.js";

export type PatchProductTransition = {
	added: EntitlementPrice[];
	removed: { filter: EntitlementPriceFilter }[];
	replaced: { from: EntitlementPriceFilter; to: EntitlementPrice }[];
	customerProduct: CustomerProductTransition | undefined;
};
