import type { Entitlement, Price } from "@autumn/shared";

export type ReusePricesAndEntitlements = {
	pricesById: Map<string, Price>;
	entitlementsById: Map<string, Entitlement>;
};
