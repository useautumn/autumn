import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	findPriceSuccessor,
	type FixedPriceConfig,
	type Price,
	type UsagePriceConfig,
} from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";

const usage = (
	configOverrides: Record<string, unknown> = {},
	overrides: Record<string, unknown> = {},
) =>
	prices.buildUsage({
		configOverrides: configOverrides as Partial<UsagePriceConfig>,
		overrides: overrides as Partial<Price>,
	});

const fixed = (
	configOverrides: Record<string, unknown> = {},
	overrides: Record<string, unknown> = {},
) =>
	prices.buildFixed({
		configOverrides: configOverrides as Partial<FixedPriceConfig>,
		overrides: overrides as Partial<Price>,
	});

describe("findPriceSuccessor", () => {
	describe("identity key (feature | billing type | interval | count)", () => {
		test("unique key match returns the candidate", () => {
			const candidate = usage({}, { id: "cand" });
			expect(
				findPriceSuccessor({
					sourcePrice: usage(),
					candidatePrices: [candidate],
				}),
			).toBe(candidate);
		});

		test("amounts, tiers, currencies, and stripe ids are not identity", () => {
			const candidate = usage(
				{
					usage_tiers: [{ to: "inf", amount: 999 }],
					stripe_price_id: "different",
					currencies: { eur: { amount: 5 } },
				},
				{ id: "cand" },
			);
			expect(
				findPriceSuccessor({
					sourcePrice: usage(),
					candidatePrices: [candidate],
				}),
			).toBe(candidate);
		});

		test("different feature_id breaks identity", () => {
			expect(
				findPriceSuccessor({
					sourcePrice: usage({ feature_id: "messages" }),
					candidatePrices: [usage({ feature_id: "seats" }, { id: "cand" })],
				}),
			).toBeUndefined();
		});

		test("internal_feature_id is NOT part of identity (feature_id only)", () => {
			const candidate = usage({ internal_feature_id: "other" }, { id: "cand" });
			expect(
				findPriceSuccessor({
					sourcePrice: usage(),
					candidatePrices: [candidate],
				}),
			).toBe(candidate);
		});

		test("different interval breaks identity", () => {
			expect(
				findPriceSuccessor({
					sourcePrice: usage({ interval: BillingInterval.Month }),
					candidatePrices: [
						usage({ interval: BillingInterval.Year }, { id: "cand" }),
					],
				}),
			).toBeUndefined();
		});

		test("interval_count unset equals 1 (successor-only coalescing)", () => {
			const candidate = usage({ interval_count: 1 }, { id: "cand" });
			expect(
				findPriceSuccessor({
					sourcePrice: usage({ interval_count: undefined }),
					candidatePrices: [candidate],
				}),
			).toBe(candidate);
			expect(
				findPriceSuccessor({
					sourcePrice: usage({ interval_count: 2 }),
					candidatePrices: [candidate],
				}),
			).toBeUndefined();
		});

		test("fixed prices key by billing type: one_off vs fixed_cycle differ", () => {
			expect(
				findPriceSuccessor({
					sourcePrice: fixed({ interval: BillingInterval.OneOff }),
					candidatePrices: [
						fixed({ interval: BillingInterval.Month }, { id: "cand" }),
					],
				}),
			).toBeUndefined();
		});

		test("fixed match ignores amount", () => {
			const candidate = fixed({ amount: 999 }, { id: "cand" });
			expect(
				findPriceSuccessor({
					sourcePrice: fixed({ amount: 50 }),
					candidatePrices: [candidate],
				}),
			).toBe(candidate);
		});
	});

	describe("billing type collapsing (derived, not stored)", () => {
		test("in_advance and start_of_period share identity (both usage_in_advance)", () => {
			const candidate = usage({ bill_when: BillWhen.StartOfPeriod }, { id: "cand" });
			expect(
				findPriceSuccessor({
					sourcePrice: usage({ bill_when: BillWhen.InAdvance }),
					candidatePrices: [candidate],
				}),
			).toBe(candidate);
		});

		test("end_of_period prorated vs non-prorated are different identities", () => {
			expect(
				findPriceSuccessor({
					sourcePrice: usage({
						bill_when: BillWhen.EndOfPeriod,
						should_prorate: true,
					}),
					candidatePrices: [
						usage(
							{ bill_when: BillWhen.EndOfPeriod, should_prorate: false },
							{ id: "cand" },
						),
					],
				}),
			).toBeUndefined();
		});

		test("should_prorate unset equals false for identity", () => {
			const candidate = usage(
				{ bill_when: BillWhen.EndOfPeriod, should_prorate: false },
				{ id: "cand" },
			);
			expect(
				findPriceSuccessor({
					sourcePrice: usage({
						bill_when: BillWhen.EndOfPeriod,
						should_prorate: undefined,
					}),
					candidatePrices: [candidate],
				}),
			).toBe(candidate);
		});

		test("usage vs fixed never share identity", () => {
			expect(
				findPriceSuccessor({
					sourcePrice: usage(),
					candidatePrices: [fixed({}, { id: "cand" })],
				}),
			).toBeUndefined();
		});
	});

	describe("unique-match ambiguity rule", () => {
		test("zero matches return undefined", () => {
			expect(
				findPriceSuccessor({
					sourcePrice: usage(),
					candidatePrices: [],
				}),
			).toBeUndefined();
		});

		test("two candidates with the same key are ambiguous — undefined", () => {
			expect(
				findPriceSuccessor({
					sourcePrice: usage(),
					candidatePrices: [usage({}, { id: "a" }), usage({}, { id: "b" })],
				}),
			).toBeUndefined();
		});

		test("exclusion can restore uniqueness", () => {
			const kept = usage({}, { id: "kept" });
			expect(
				findPriceSuccessor({
					sourcePrice: usage(),
					candidatePrices: [usage({}, { id: "excluded" }), kept],
					excludedPriceIds: new Set(["excluded"]),
				}),
			).toBe(kept);
		});

		test("excluding the only match returns undefined", () => {
			expect(
				findPriceSuccessor({
					sourcePrice: usage(),
					candidatePrices: [usage({}, { id: "only" })],
					excludedPriceIds: new Set(["only"]),
				}),
			).toBeUndefined();
		});

		test("excluding both ambiguous matches returns undefined", () => {
			expect(
				findPriceSuccessor({
					sourcePrice: usage(),
					candidatePrices: [usage({}, { id: "a" }), usage({}, { id: "b" })],
					excludedPriceIds: new Set(["a", "b"]),
				}),
			).toBeUndefined();
		});
	});
});
