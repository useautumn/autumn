/**
 * PlanItemFilter matching must compare PlanItemInterval | null, never raw
 * EntInterval / ResetInterval / BillingInterval strings.
 *
 * one_off (filter/price) and lifetime (entitlement) both convert to null.
 * month on either side converts to ProductItemInterval.Month.
 */

import { describe, expect, test } from "bun:test";
import {
	BillWhen,
	BillingInterval,
	BillingMethod,
	EntInterval,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	Infinite,
	PriceType,
	type ProductItem,
	ProductItemInterval,
	ResetInterval,
} from "@autumn/shared";
import { planItemFilterMatchesCustomerPair } from "@shared/api/products/items/utils/match/planItemFilterMatchesCustomerPair";
import { matchesPlanItemFilter } from "@shared/utils/productV2Utils/productItemUtils/matchPlanItem";

const FEATURE_ID = "messages";
const OTHER_FEATURE_ID = "words";

const customerEntitlement = ({
	featureId = FEATURE_ID,
	interval = EntInterval.Lifetime,
	intervalCount = 1,
}: {
	featureId?: string;
	interval?: EntInterval | null;
	intervalCount?: number | null;
} = {}) =>
	({
		feature_id: featureId,
		entitlement: {
			interval,
			interval_count: intervalCount,
			feature: { id: featureId },
		},
	}) as FullCustomerEntitlement;

const customerPrice = ({
	featureId = FEATURE_ID,
	interval = BillingInterval.Month,
	intervalCount = 1,
	billWhen = BillWhen.EndOfPeriod,
}: {
	featureId?: string;
	interval?: BillingInterval;
	intervalCount?: number | null;
	billWhen?: BillWhen;
} = {}) =>
	({
		price: {
			config: {
				type: PriceType.Usage,
				bill_when: billWhen,
				billing_units: 1,
				usage_tiers: [{ to: Infinite, amount: 1 }],
				interval,
				interval_count: intervalCount,
				feature_id: featureId,
				internal_feature_id: `internal_${featureId}`,
			},
		},
	}) as FullCustomerPrice;

const match = ({
	filter,
	entitlement,
	price,
}: {
	filter: Parameters<typeof planItemFilterMatchesCustomerPair>[0]["filter"];
	entitlement?: ReturnType<typeof customerEntitlement>;
	price?: ReturnType<typeof customerPrice>;
}) =>
	planItemFilterMatchesCustomerPair({
		filter,
		customerEntitlement: entitlement,
		customerPrice: price,
	});

describe("planItemFilterMatchesCustomerPair — entitlement reset interval", () => {
	const cases: {
		name: string;
		filter: ResetInterval | BillingInterval;
		ent: EntInterval | null;
		expected: boolean;
	}[] = [
		{
			name: "one_off filter matches lifetime entitlement",
			filter: ResetInterval.OneOff,
			ent: EntInterval.Lifetime,
			expected: true,
		},
		{
			name: "BillingInterval.OneOff filter matches lifetime entitlement",
			filter: BillingInterval.OneOff,
			ent: EntInterval.Lifetime,
			expected: true,
		},
		{
			name: "one_off filter matches null entitlement interval",
			filter: ResetInterval.OneOff,
			ent: null,
			expected: true,
		},
		{
			name: "one_off filter does not match monthly entitlement",
			filter: ResetInterval.OneOff,
			ent: EntInterval.Month,
			expected: false,
		},
		{
			name: "month filter matches monthly entitlement",
			filter: ResetInterval.Month,
			ent: EntInterval.Month,
			expected: true,
		},
		{
			name: "month filter does not match lifetime entitlement",
			filter: ResetInterval.Month,
			ent: EntInterval.Lifetime,
			expected: false,
		},
		{
			name: "month filter does not match yearly entitlement",
			filter: ResetInterval.Month,
			ent: EntInterval.Year,
			expected: false,
		},
		{
			name: "year filter matches yearly entitlement",
			filter: ResetInterval.Year,
			ent: EntInterval.Year,
			expected: true,
		},
		{
			name: "week filter matches weekly entitlement",
			filter: ResetInterval.Week,
			ent: EntInterval.Week,
			expected: true,
		},
		{
			name: "quarter filter matches quarterly entitlement",
			filter: ResetInterval.Quarter,
			ent: EntInterval.Quarter,
			expected: true,
		},
		{
			name: "semi_annual filter matches semi-annual entitlement",
			filter: ResetInterval.SemiAnnual,
			ent: EntInterval.SemiAnnual,
			expected: true,
		},
		{
			name: "minute filter matches minute entitlement",
			filter: ResetInterval.Minute,
			ent: EntInterval.Minute,
			expected: true,
		},
		{
			name: "hour filter matches hourly entitlement",
			filter: ResetInterval.Hour,
			ent: EntInterval.Hour,
			expected: true,
		},
		{
			name: "day filter matches daily entitlement",
			filter: ResetInterval.Day,
			ent: EntInterval.Day,
			expected: true,
		},
		{
			name: "day filter does not match monthly entitlement",
			filter: ResetInterval.Day,
			ent: EntInterval.Month,
			expected: false,
		},
	];

	for (const { name, filter, ent, expected } of cases) {
		test(name, () => {
			expect(
				match({
					filter: { interval: filter },
					entitlement: customerEntitlement({ interval: ent }),
				}),
			).toBe(expected);
		});
	}
});

describe("planItemFilterMatchesCustomerPair — price billing interval", () => {
	const cases: {
		name: string;
		filter: ResetInterval | BillingInterval;
		price: BillingInterval;
		expected: boolean;
	}[] = [
		{
			name: "one_off filter matches one_off price",
			filter: ResetInterval.OneOff,
			price: BillingInterval.OneOff,
			expected: true,
		},
		{
			name: "one_off filter does not match monthly price",
			filter: ResetInterval.OneOff,
			price: BillingInterval.Month,
			expected: false,
		},
		{
			name: "month filter matches monthly price",
			filter: BillingInterval.Month,
			price: BillingInterval.Month,
			expected: true,
		},
		{
			name: "month filter does not match one_off price",
			filter: BillingInterval.Month,
			price: BillingInterval.OneOff,
			expected: false,
		},
		{
			name: "year filter matches yearly price",
			filter: BillingInterval.Year,
			price: BillingInterval.Year,
			expected: true,
		},
		{
			name: "week filter matches weekly price",
			filter: BillingInterval.Week,
			price: BillingInterval.Week,
			expected: true,
		},
		{
			name: "quarter filter matches quarterly price",
			filter: BillingInterval.Quarter,
			price: BillingInterval.Quarter,
			expected: true,
		},
		{
			name: "semi_annual filter matches semi-annual price",
			filter: BillingInterval.SemiAnnual,
			price: BillingInterval.SemiAnnual,
			expected: true,
		},
	];

	for (const { name, filter, price, expected } of cases) {
		test(name, () => {
			expect(
				match({
					filter: { interval: filter },
					price: customerPrice({ interval: price }),
				}),
			).toBe(expected);
		});
	}
});

describe("planItemFilterMatchesCustomerPair — price OR reset", () => {
	test("one_off filter matches monthly-priced lifetime entitlement (continuous-use)", () => {
		expect(
			match({
				filter: { interval: ResetInterval.OneOff },
				price: customerPrice({ interval: BillingInterval.Month }),
				entitlement: customerEntitlement({ interval: EntInterval.Lifetime }),
			}),
		).toBe(true);
	});

	test("month filter matches monthly-priced lifetime entitlement on the price side", () => {
		expect(
			match({
				filter: { interval: BillingInterval.Month },
				price: customerPrice({ interval: BillingInterval.Month }),
				entitlement: customerEntitlement({ interval: EntInterval.Lifetime }),
			}),
		).toBe(true);
	});

	test("year filter matches neither monthly price nor lifetime entitlement", () => {
		expect(
			match({
				filter: { interval: BillingInterval.Year },
				price: customerPrice({ interval: BillingInterval.Month }),
				entitlement: customerEntitlement({ interval: EntInterval.Lifetime }),
			}),
		).toBe(false);
	});

	test("one_off filter matches one_off price even when entitlement is monthly", () => {
		expect(
			match({
				filter: { interval: ResetInterval.OneOff },
				price: customerPrice({ interval: BillingInterval.OneOff }),
				entitlement: customerEntitlement({ interval: EntInterval.Month }),
			}),
		).toBe(true);
	});
});

describe("planItemFilterMatchesCustomerPair — interval_count", () => {
	test("count 1 matches missing entitlement interval_count", () => {
		expect(
			match({
				filter: { interval_count: 1 },
				entitlement: customerEntitlement({ intervalCount: null }),
			}),
		).toBe(true);
	});

	test("count 1 matches explicit 1", () => {
		expect(
			match({
				filter: { interval_count: 1 },
				entitlement: customerEntitlement({ intervalCount: 1 }),
			}),
		).toBe(true);
	});

	test("count 2 matches 2", () => {
		expect(
			match({
				filter: { interval_count: 2 },
				entitlement: customerEntitlement({ intervalCount: 2 }),
			}),
		).toBe(true);
	});

	test("count 2 does not match 1", () => {
		expect(
			match({
				filter: { interval_count: 2 },
				entitlement: customerEntitlement({ intervalCount: 1 }),
			}),
		).toBe(false);
	});

	test("one_off + count 1 matches lifetime entitlement", () => {
		expect(
			match({
				filter: { interval: ResetInterval.OneOff, interval_count: 1 },
				entitlement: customerEntitlement({
					interval: EntInterval.Lifetime,
					intervalCount: 1,
				}),
			}),
		).toBe(true);
	});

	test("one_off + count 2 does not match lifetime count 1", () => {
		expect(
			match({
				filter: { interval: ResetInterval.OneOff, interval_count: 2 },
				entitlement: customerEntitlement({
					interval: EntInterval.Lifetime,
					intervalCount: 1,
				}),
			}),
		).toBe(false);
	});
});

describe("planItemFilterMatchesCustomerPair — feature_id and billing_method", () => {
	test("feature_id matches entitlement feature", () => {
		expect(
			match({
				filter: { feature_id: FEATURE_ID },
				entitlement: customerEntitlement({ featureId: FEATURE_ID }),
			}),
		).toBe(true);
	});

	test("feature_id does not match a different entitlement feature", () => {
		expect(
			match({
				filter: { feature_id: FEATURE_ID },
				entitlement: customerEntitlement({ featureId: OTHER_FEATURE_ID }),
			}),
		).toBe(false);
	});

	test("feature_id matches price feature when there is no entitlement", () => {
		expect(
			match({
				filter: { feature_id: FEATURE_ID },
				price: customerPrice({ featureId: FEATURE_ID }),
			}),
		).toBe(true);
	});

	test("prepaid filter matches in-advance price", () => {
		expect(
			match({
				filter: { billing_method: BillingMethod.Prepaid },
				price: customerPrice({ billWhen: BillWhen.InAdvance }),
			}),
		).toBe(true);
	});

	test("prepaid filter does not match entitlement-only pair", () => {
		expect(
			match({
				filter: { billing_method: BillingMethod.Prepaid },
				entitlement: customerEntitlement(),
			}),
		).toBe(false);
	});

	test("usage_based filter matches end-of-period price", () => {
		expect(
			match({
				filter: { billing_method: BillingMethod.UsageBased },
				price: customerPrice({ billWhen: BillWhen.EndOfPeriod }),
			}),
		).toBe(true);
	});

	test("feature_id AND one_off does not match the right interval on the wrong feature", () => {
		expect(
			match({
				filter: { feature_id: FEATURE_ID, interval: ResetInterval.OneOff },
				entitlement: customerEntitlement({
					featureId: OTHER_FEATURE_ID,
					interval: EntInterval.Lifetime,
				}),
			}),
		).toBe(false);
	});

	test("feature_id AND month does not match lifetime entitlement on that feature", () => {
		expect(
			match({
				filter: { feature_id: FEATURE_ID, interval: ResetInterval.Month },
				entitlement: customerEntitlement({
					featureId: FEATURE_ID,
					interval: EntInterval.Lifetime,
				}),
			}),
		).toBe(false);
	});
});

describe("matchesPlanItemFilter — convert to planItemInterval", () => {
	const featureItem = ({
		interval = null,
		intervalCount = 1,
		featureId = FEATURE_ID,
	}: {
		interval?: ProductItem["interval"];
		intervalCount?: number;
		featureId?: string;
	} = {}) =>
		({
			feature_id: featureId,
			interval,
			interval_count: intervalCount,
		}) as ProductItem;

	test("one_off filter matches a lifetime feature item (interval null)", () => {
		expect(
			matchesPlanItemFilter({
				item: featureItem({ interval: null }),
				filter: { interval: ResetInterval.OneOff },
			}),
		).toBe(true);
	});

	test("one_off filter does not match a monthly feature item", () => {
		expect(
			matchesPlanItemFilter({
				item: featureItem({ interval: ProductItemInterval.Month }),
				filter: { interval: ResetInterval.OneOff },
			}),
		).toBe(false);
	});

	test("month filter matches a monthly feature item", () => {
		expect(
			matchesPlanItemFilter({
				item: featureItem({ interval: ProductItemInterval.Month }),
				filter: { interval: ResetInterval.Month },
			}),
		).toBe(true);
	});

	test("month filter does not match a lifetime feature item", () => {
		expect(
			matchesPlanItemFilter({
				item: featureItem({ interval: null }),
				filter: { interval: ResetInterval.Month },
			}),
		).toBe(false);
	});
});
