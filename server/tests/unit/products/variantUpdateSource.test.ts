import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	customizePlanV1DiffsEqual,
	FreeTrialDuration,
	ResetInterval,
	TierBehavior,
} from "@autumn/shared";
import { resolveVariantUpdateSource } from "@/internal/product/actions/common/variantUpdateSource.js";

test("variant update source is direct when customize changes", () => {
	expect(
		resolveVariantUpdateSource({
			currentCustomize: {
				price: { amount: 100, interval: BillingInterval.Month },
			},
			incomingCustomize: {
				price: { interval: BillingInterval.Month, amount: 200 },
			},
			hasPreviewDiff: true,
		}),
	).toBe("direct");
});

test("variant update source is propagated when unchanged customize applies a diff", () => {
	expect(
		resolveVariantUpdateSource({
			currentCustomize: {
				price: { amount: 100, interval: BillingInterval.Month },
			},
			incomingCustomize: {
				price: { interval: BillingInterval.Month, amount: 100 },
			},
			hasPreviewDiff: true,
		}),
	).toBe("propagated");
});

test("variant update source treats normalized item defaults as unchanged", () => {
	expect(
		resolveVariantUpdateSource({
			currentCustomize: {
				add_items: [
					{
						feature_id: "messages",
						included: 1200,
						unlimited: false,
						reset: { interval: ResetInterval.Year },
					},
				],
			},
			incomingCustomize: {
				add_items: [
					{
						feature_id: "messages",
						included: 1200,
						reset: { interval: ResetInterval.Year },
					},
				],
			},
			hasPreviewDiff: true,
		}),
	).toBe("propagated");
});

test("customize equality ignores add/remove item ordering", () => {
	expect(
		customizePlanV1DiffsEqual({
			left: {
				add_items: [
					{ feature_id: "messages", included: 1200 },
					{ feature_id: "admin_rights" },
				],
				remove_items: [
					{ feature_id: "messages", interval: ResetInterval.Month },
					{ feature_id: "admin_rights" },
				],
			},
			right: {
				add_items: [
					{ feature_id: "admin_rights" },
					{ feature_id: "messages", included: 1200 },
				],
				remove_items: [
					{ feature_id: "admin_rights" },
					{ feature_id: "messages", interval: ResetInterval.Month },
				],
			},
		}),
	).toBe(true);
});

test("customize equality normalizes free trial defaults", () => {
	expect(
		customizePlanV1DiffsEqual({
			left: {
				free_trial: {
					duration_length: 14,
					duration_type: FreeTrialDuration.Month,
					card_required: true,
					on_end: "bill",
				},
			},
			right: {
				free_trial: {
					duration_length: 14,
				} as never,
			},
		}),
	).toBe(true);
});

test("customize equality normalizes tier and price defaults", () => {
	expect(
		customizePlanV1DiffsEqual({
			left: {
				add_items: [
					{
						feature_id: "messages",
						included: 100,
						reset: { interval: ResetInterval.Month, interval_count: 1 },
						price: {
							tiers: [{ to: 1000, amount: 1 }],
							tier_behavior: TierBehavior.Graduated,
							interval: BillingInterval.Month,
							interval_count: 1,
							billing_units: 1,
							billing_method: BillingMethod.UsageBased,
							max_purchase: null,
						},
					},
				],
			},
			right: {
				add_items: [
					{
						feature_id: "messages",
						included: 100,
						reset: { interval: ResetInterval.Month },
						price: {
							tiers: [{ to: 1000, amount: 1 }],
							interval: BillingInterval.Month,
							billing_method: BillingMethod.UsageBased,
						},
					},
				],
			},
		}),
	).toBe(true);
});

test("variant update source is empty when unchanged customize has no diff", () => {
	expect(
		resolveVariantUpdateSource({
			currentCustomize: {},
			incomingCustomize: {},
			hasPreviewDiff: false,
		}),
	).toBeNull();
});

test("variant update source ignores stored customize without an incoming variant update", () => {
	expect(
		resolveVariantUpdateSource({
			currentCustomize: {
				price: { amount: 100, interval: BillingInterval.Month },
			},
			hasPreviewDiff: false,
		}),
	).toBeNull();
});

test("variant update source is propagated for candidate base diffs", () => {
	expect(
		resolveVariantUpdateSource({
			currentCustomize: {},
			incomingCustomize: {},
			hasPreviewDiff: true,
		}),
	).toBe("propagated");
});
