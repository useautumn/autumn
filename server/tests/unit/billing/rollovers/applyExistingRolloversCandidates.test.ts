/**
 * Candidate ordering for rollover carry: same-feature candidates are ranked by
 * billing kind, then reset interval/interval_count, then whether the bucket's
 * effective max can hold a balance (zero-cap buckets rank last).
 */

import { describe, expect, test } from "bun:test";
import {
	BillingType,
	EntInterval,
	type ExistingRollover,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	type RolloverConfig,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { applyExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/applyExistingRollovers";

const FEATURE_ID = "messages";
const INTERNAL_FEATURE_ID = "int_messages";

const pctRollover: RolloverConfig = {
	max_percentage: 50,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};

const buildCusEnt = ({
	entitlementId,
	allowance,
	interval = EntInterval.Month,
	intervalCount = 1,
	rollover = pctRollover,
}: {
	entitlementId: string;
	allowance: number;
	interval?: EntInterval;
	intervalCount?: number;
	rollover?: RolloverConfig | null;
}): FullCustomerEntitlement =>
	customerEntitlements.create({
		entitlementId,
		featureId: FEATURE_ID,
		internalFeatureId: INTERNAL_FEATURE_ID,
		featureName: "Messages",
		allowance,
		balance: allowance,
		interval,
		intervalCount,
		rollover,
	});

const buildExistingRollover = ({
	balance = 50,
	sourceBillingType = BillingType.UsageInAdvance,
	sourceInterval = EntInterval.Month,
	sourceIntervalCount = 1,
}: {
	balance?: number;
	sourceBillingType?: BillingType | null;
	sourceInterval?: string | null;
	sourceIntervalCount?: number | null;
} = {}): ExistingRollover => ({
	id: "roll_source",
	cus_ent_id: "cus_ent_source",
	balance,
	usage: 0,
	expires_at: null,
	entities: {},
	internal_feature_id: INTERNAL_FEATURE_ID,
	source_billing_type: sourceBillingType,
	source_interval: sourceInterval,
	source_interval_count: sourceIntervalCount,
});

const buildCusProduct = ({
	customerEntitlements: cusEnts,
	customerPrices,
}: {
	customerEntitlements: FullCustomerEntitlement[];
	customerPrices: FullCustomerPrice[];
}) =>
	customerProducts.create({
		customerEntitlements: cusEnts,
		customerPrices,
	});

describe("applyExistingRollovers candidate ordering", () => {
	test("prepaid rollover skips zero-cap overage bucket listed first (kind match wins)", () => {
		// Mirrors the Mintlify growth shape: zero-allowance overage with a pct
		// rollover config (effective max 0) sits before the prepaid bucket.
		const overage = buildCusEnt({ entitlementId: "ent_overage", allowance: 0 });
		const prepaid = buildCusEnt({
			entitlementId: "ent_prepaid",
			allowance: 100,
		});

		const cusProduct = buildCusProduct({
			customerEntitlements: [overage, prepaid],
			customerPrices: [
				prices.createCustomer({
					price: prices.createConsumable({
						id: "pr_overage",
						featureId: FEATURE_ID,
						internalFeatureId: INTERNAL_FEATURE_ID,
						entitlementId: "ent_overage",
					}),
				}),
				prices.createCustomer({
					price: prices.createPrepaid({
						id: "pr_prepaid",
						featureId: FEATURE_ID,
						internalFeatureId: INTERNAL_FEATURE_ID,
						entitlementId: "ent_prepaid",
					}),
				}),
			],
		});

		applyExistingRollovers({
			customerProduct: cusProduct,
			existingRollovers: [buildExistingRollover()],
		});

		expect(prepaid.rollovers.length).toBe(1);
		expect(prepaid.rollovers[0].balance).toBe(50);
		expect(overage.rollovers.length).toBe(0);
	});

	test("interval match disambiguates two same-kind candidates", () => {
		const monthlyPrepaid = buildCusEnt({
			entitlementId: "ent_prepaid_month",
			allowance: 100,
			interval: EntInterval.Month,
		});
		const yearlyPrepaid = buildCusEnt({
			entitlementId: "ent_prepaid_year",
			allowance: 100,
			interval: EntInterval.Year,
		});

		const cusProduct = buildCusProduct({
			customerEntitlements: [monthlyPrepaid, yearlyPrepaid],
			customerPrices: [
				prices.createCustomer({
					price: prices.createPrepaid({
						id: "pr_prepaid_month",
						featureId: FEATURE_ID,
						internalFeatureId: INTERNAL_FEATURE_ID,
						entitlementId: "ent_prepaid_month",
					}),
				}),
				prices.createCustomer({
					price: prices.createPrepaid({
						id: "pr_prepaid_year",
						featureId: FEATURE_ID,
						internalFeatureId: INTERNAL_FEATURE_ID,
						entitlementId: "ent_prepaid_year",
					}),
				}),
			],
		});

		applyExistingRollovers({
			customerProduct: cusProduct,
			existingRollovers: [
				buildExistingRollover({ sourceInterval: EntInterval.Year }),
			],
		});

		expect(yearlyPrepaid.rollovers.length).toBe(1);
		expect(monthlyPrepaid.rollovers.length).toBe(0);
	});

	test("capacity breaks ties between identical candidates", () => {
		// Both prepaid + monthly; the zero-cap one is listed first.
		const zeroCapPrepaid = buildCusEnt({
			entitlementId: "ent_prepaid_zero",
			allowance: 0,
		});
		const prepaid = buildCusEnt({
			entitlementId: "ent_prepaid_ok",
			allowance: 100,
		});

		const cusProduct = buildCusProduct({
			customerEntitlements: [zeroCapPrepaid, prepaid],
			customerPrices: [
				prices.createCustomer({
					price: prices.createPrepaid({
						id: "pr_prepaid_zero",
						featureId: FEATURE_ID,
						internalFeatureId: INTERNAL_FEATURE_ID,
						entitlementId: "ent_prepaid_zero",
					}),
				}),
				prices.createCustomer({
					price: prices.createPrepaid({
						id: "pr_prepaid_ok",
						featureId: FEATURE_ID,
						internalFeatureId: INTERNAL_FEATURE_ID,
						entitlementId: "ent_prepaid_ok",
					}),
				}),
			],
		});

		applyExistingRollovers({
			customerProduct: cusProduct,
			existingRollovers: [buildExistingRollover()],
		});

		expect(prepaid.rollovers.length).toBe(1);
		expect(zeroCapPrepaid.rollovers.length).toBe(0);
	});

	test("falls back to the only candidate even when nothing matches", () => {
		const overage = buildCusEnt({
			entitlementId: "ent_overage_only",
			allowance: 100,
			interval: EntInterval.Year,
		});

		const cusProduct = buildCusProduct({
			customerEntitlements: [overage],
			customerPrices: [
				prices.createCustomer({
					price: prices.createConsumable({
						id: "pr_overage_only",
						featureId: FEATURE_ID,
						internalFeatureId: INTERNAL_FEATURE_ID,
						entitlementId: "ent_overage_only",
					}),
				}),
			],
		});

		applyExistingRollovers({
			customerProduct: cusProduct,
			existingRollovers: [buildExistingRollover()],
		});

		expect(overage.rollovers.length).toBe(1);
		expect(overage.rollovers[0].balance).toBe(50);
	});
});
