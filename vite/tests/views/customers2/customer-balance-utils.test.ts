import { expect, test } from "bun:test";
import {
	EntInterval,
	FeatureType,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { getCustomerBalanceSourceLabel } from "@/views/customers2/components/table/customer-balance/customerBalanceUtils";

test("uses a standalone balance id as its source label", () => {
	const balance = {
		external_id: "goodwill",
		customer_product: null,
		pooled_balance_id: null,
		pooled_balance: null,
		entitlement: {
			interval: EntInterval.Lifetime,
			interval_count: 1,
			feature: { type: FeatureType.Metered },
		},
	} as unknown as FullCusEntWithFullCusProduct;

	expect(getCustomerBalanceSourceLabel({ balance, entities: [] })).toBe(
		"goodwill · Lifetime",
	);
});
