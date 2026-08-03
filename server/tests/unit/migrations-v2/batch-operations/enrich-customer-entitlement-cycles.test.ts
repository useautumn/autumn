import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	EntInterval,
	type EntitlementWithFeature,
	FeatureType,
	getCycleEnd,
} from "@autumn/shared";
import {
	type CycleEnrichmentCandidate,
	enrichCustomerEntitlementCycles,
} from "@/internal/migrations/v2/batchOperations/utils/enrichCustomerEntitlementCycles.js";

const NOW = Date.UTC(2026, 6, 15); // 2026-07-15

const meteredEntitlement = ({
	interval = EntInterval.Month,
	intervalCount = 1,
}: {
	interval?: EntInterval;
	intervalCount?: number;
} = {}) =>
	({
		id: "ent_test",
		interval,
		interval_count: intervalCount,
		allowance: 10,
		feature: { id: "workflows", type: FeatureType.Metered },
	}) as unknown as EntitlementWithFeature;

const candidate = (
	overrides: Partial<CycleEnrichmentCandidate> = {},
): CycleEnrichmentCandidate => ({
	customerProductId: "cp_1",
	internalCustomerId: "cus_internal_1",
	customerId: "cus_1",
	entityId: null,
	status: CusProductStatus.Active,
	startsAt: Date.UTC(2026, 4, 10),
	canceledAt: null,
	endedAt: null,
	trialEndsAt: null,
	isPaidRecurring: false,
	billingCycleAnchor: null,
	subscriptionCycleAnchor: null,
	siblingResetCycleAnchor: null,
	...overrides,
});

const monthlyCycleEnd = (anchor: number) =>
	getCycleEnd({
		anchor,
		interval: EntInterval.Month,
		intervalCount: 1,
		now: NOW,
	});

describe("enrichCustomerEntitlementCycles", () => {
	test("sibling anchor wins over cp and subscription anchors", () => {
		const siblingAnchor = Date.UTC(2026, 2, 5);
		const result = enrichCustomerEntitlementCycles({
			candidates: [
				candidate({
					siblingResetCycleAnchor: siblingAnchor,
					billingCycleAnchor: Date.UTC(2026, 3, 1),
					subscriptionCycleAnchor: Date.UTC(2026, 3, 2),
				}),
			],
			entitlement: meteredEntitlement(),
			now: NOW,
		});

		expect(result.rows[0].resetCycleAnchor).toBe(siblingAnchor);
		expect(result.rows[0].nextResetAt).toBe(monthlyCycleEnd(siblingAnchor));
	});

	test("cp anchor rung: month-end anchor steps via getCycleEnd", () => {
		const monthEndAnchor = Date.UTC(2026, 0, 31);
		const result = enrichCustomerEntitlementCycles({
			candidates: [candidate({ billingCycleAnchor: monthEndAnchor })],
			entitlement: meteredEntitlement(),
			now: NOW,
		});

		const expected = monthlyCycleEnd(monthEndAnchor);
		expect(result.rows[0].resetCycleAnchor).toBe(monthEndAnchor);
		expect(result.rows[0].nextResetAt).toBe(expected);
		expect(expected).toBeGreaterThan(NOW);
	});

	test("subscription anchor rung applies when cp anchor is null", () => {
		const subAnchor = Date.UTC(2026, 5, 20);
		const result = enrichCustomerEntitlementCycles({
			candidates: [candidate({ subscriptionCycleAnchor: subAnchor })],
			entitlement: meteredEntitlement(),
			now: NOW,
		});

		expect(result.rows[0].resetCycleAnchor).toBe(subAnchor);
	});

	test("free/one-off cusProduct falls back to starts_at", () => {
		const startsAt = Date.UTC(2026, 4, 10);
		const result = enrichCustomerEntitlementCycles({
			candidates: [candidate({ startsAt })],
			entitlement: meteredEntitlement(),
			now: NOW,
		});

		expect(result.rows[0].resetCycleAnchor).toBe(startsAt);
		expect(result.rows[0].nextResetAt).toBe(monthlyCycleEnd(startsAt));
	});

	test("paid recurring cusProduct with no anchor falls back to now", () => {
		const result = enrichCustomerEntitlementCycles({
			candidates: [candidate({ isPaidRecurring: true })],
			entitlement: meteredEntitlement(),
			now: NOW,
		});

		expect(result.rows[0].resetCycleAnchor).toBe(NOW);
		expect(result.rows[0].nextResetAt).toBe(monthlyCycleEnd(NOW));
	});

	test("free cusProduct without starts_at falls back to now", () => {
		const result = enrichCustomerEntitlementCycles({
			candidates: [candidate({ startsAt: null })],
			entitlement: meteredEntitlement(),
			now: NOW,
		});

		expect(result.rows[0].resetCycleAnchor).toBe(NOW);
	});

	test("credit system entitlement with a reset interval enriches like a consumable", () => {
		const anchor = Date.UTC(2026, 3, 1);
		const creditEntitlement = {
			id: "ent_credits",
			interval: EntInterval.Month,
			interval_count: 1,
			allowance: 100,
			feature: { id: "credits", type: FeatureType.CreditSystem },
		} as unknown as EntitlementWithFeature;

		const result = enrichCustomerEntitlementCycles({
			candidates: [candidate({ billingCycleAnchor: anchor })],
			entitlement: creditEntitlement,
			now: NOW,
		});

		expect(result.rows[0].resetCycleAnchor).toBe(anchor);
		expect(result.rows[0].nextResetAt).toBe(monthlyCycleEnd(anchor));
	});

	test("annual interval steps a full year", () => {
		const anchor = Date.UTC(2026, 0, 15);
		const result = enrichCustomerEntitlementCycles({
			candidates: [candidate({ billingCycleAnchor: anchor })],
			entitlement: meteredEntitlement({ interval: EntInterval.Year }),
			now: NOW,
		});

		expect(result.rows[0].nextResetAt).toBe(
			getCycleEnd({
				anchor,
				interval: EntInterval.Year,
				intervalCount: 1,
				now: NOW,
			}),
		);
	});
});
