import { describe, expect, test } from "bun:test";
import {
	type ApiPlanItemV1,
	type ApiPlanV1,
	BillingInterval,
	BillingMethod,
	type DiffedCustomizePlanV1,
	type Feature,
	FeatureType,
	FeatureUsageType,
	ResetInterval,
} from "@autumn/shared";
import { detectVariantConflicts } from "@/internal/product/actions/previewUpdatePlan/detectVariantConflicts";

const bool = (featureId: string): ApiPlanItemV1 =>
	({
		feature_id: featureId,
		included: 0,
		unlimited: true,
		reset: null,
		price: null,
	}) as ApiPlanItemV1;

const usage = (
	featureId: string,
	interval: ResetInterval & BillingInterval,
	included = 1000,
): ApiPlanItemV1 =>
	({
		feature_id: featureId,
		included,
		unlimited: false,
		reset: { interval },
		price: {
			amount: 0.01,
			interval,
			billing_units: 1,
			billing_method: BillingMethod.UsageBased,
			max_purchase: null,
		},
	}) as ApiPlanItemV1;

// Included balance entitlement (month reset, no price) — distinct match key
// from the one-off price item below.
const includedMonthly = (featureId: string, included: number): ApiPlanItemV1 =>
	({
		feature_id: featureId,
		included,
		unlimited: false,
		reset: { interval: ResetInterval.Month },
		price: null,
	}) as ApiPlanItemV1;

const prepaid = (
	featureId: string,
	amount: number,
	interval: BillingInterval,
): ApiPlanItemV1 =>
	({
		feature_id: featureId,
		included: 0,
		unlimited: false,
		reset: null,
		price: {
			amount,
			interval,
			billing_units: 1,
			billing_method: BillingMethod.Prepaid,
			max_purchase: null,
		},
	}) as ApiPlanItemV1;

const oneOffPrepaid = (featureId: string, amount: number): ApiPlanItemV1 =>
	prepaid(featureId, amount, BillingInterval.OneOff);

const includedNoReset = (featureId: string, included: number): ApiPlanItemV1 =>
	({
		feature_id: featureId,
		included,
		unlimited: false,
		reset: null,
		price: null,
	}) as ApiPlanItemV1;

const basePrice = (amount: number, interval: BillingInterval) =>
	({ amount, interval }) as ApiPlanV1["price"];

const plan = (
	items: ApiPlanItemV1[],
	price: ApiPlanV1["price"] = null,
): ApiPlanV1 => ({ items, price }) as ApiPlanV1;

const features = [
	{
		id: "messages",
		name: "Messages",
		type: FeatureType.Metered,
		config: { usage_type: FeatureUsageType.Single },
	},
	{ id: "dashboard", name: "Dashboard", type: FeatureType.Boolean },
	{
		id: "seats",
		name: "Seats",
		type: FeatureType.Metered,
		config: { usage_type: FeatureUsageType.Continuous },
	},
] as Feature[];

const MONTH = ResetInterval.Month as ResetInterval & BillingInterval;
const YEAR = ResetInterval.Year as ResetInterval & BillingInterval;

describe("detectVariantConflicts", () => {
	test("removing a boolean feature from the base is not a conflict", () => {
		const conflicts = detectVariantConflicts({
			currentBasePlan: plan([bool("dashboard"), usage("messages", MONTH)]),
			editedBasePlan: plan([usage("messages", MONTH)]),
			diff: {
				remove_items: [{ feature_id: "dashboard" }],
			} as DiffedCustomizePlanV1,
			variantPlan: plan([bool("dashboard"), usage("messages", MONTH)]),
			features,
		});

		expect(conflicts).toHaveLength(0);
	});

	test("adding a feature the variant lacks is a clean add, not a conflict", () => {
		const conflicts = detectVariantConflicts({
			currentBasePlan: plan([usage("messages", MONTH)]),
			editedBasePlan: plan([usage("messages", MONTH), bool("dashboard")]),
			diff: {
				add_items: [{ feature_id: "dashboard" }],
			} as DiffedCustomizePlanV1,
			variantPlan: plan([usage("messages", MONTH)]),
			features,
		});

		expect(conflicts).toHaveLength(0);
	});

	test("variant tracking the base value (same interval) is not a conflict", () => {
		const conflicts = detectVariantConflicts({
			currentBasePlan: plan([usage("messages", MONTH, 1000)]),
			editedBasePlan: plan([usage("messages", MONTH, 2000)]),
			diff: {
				add_items: [{ feature_id: "messages" }],
				remove_items: [{ feature_id: "messages", interval: MONTH }],
			} as DiffedCustomizePlanV1,
			// variant matches the base it forked from → propagation just updates it
			variantPlan: plan([usage("messages", MONTH, 1000)]),
			features,
		});

		expect(conflicts).toHaveLength(0);
	});

	test("variant on a different interval than the edit is a different_interval conflict", () => {
		const conflicts = detectVariantConflicts({
			currentBasePlan: plan([usage("messages", MONTH)]),
			editedBasePlan: plan([usage("messages", MONTH)]),
			diff: {
				add_items: [{ feature_id: "messages" }],
			} as DiffedCustomizePlanV1,
			variantPlan: plan([usage("messages", YEAR)]),
			features,
		});

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]).toMatchObject({
			reason: "different_interval",
			feature_name: "Messages",
			item_filter: { feature_id: "messages" },
		});
	});

	test("priced non-consumable on a different interval is a different_interval conflict", () => {
		// Propagation would append the $12/month item next to the variant's
		// $100/year item — a silent duplicate — so it must be flagged.
		const conflicts = detectVariantConflicts({
			currentBasePlan: plan([prepaid("seats", 10, BillingInterval.Month)]),
			editedBasePlan: plan([prepaid("seats", 12, BillingInterval.Month)]),
			diff: {
				add_items: [{ feature_id: "seats" }],
				remove_items: [{ feature_id: "seats", interval: MONTH }],
			} as DiffedCustomizePlanV1,
			variantPlan: plan([prepaid("seats", 100, BillingInterval.Year)]),
			features,
		});

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]).toMatchObject({
			reason: "different_interval",
			feature_name: "Seats",
			item_filter: { feature_id: "seats" },
		});
	});

	test("priced non-consumable edit against an unpriced variant entitlement is a different_interval conflict", () => {
		const conflicts = detectVariantConflicts({
			currentBasePlan: plan([prepaid("seats", 10, BillingInterval.Month)]),
			editedBasePlan: plan([prepaid("seats", 12, BillingInterval.Month)]),
			diff: {
				add_items: [{ feature_id: "seats" }],
				remove_items: [{ feature_id: "seats", interval: MONTH }],
			} as DiffedCustomizePlanV1,
			variantPlan: plan([includedNoReset("seats", 5)]),
			features,
		});

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]).toMatchObject({ reason: "different_interval" });
	});

	test("variant with a customized value (same interval) is a value_divergence conflict", () => {
		const conflicts = detectVariantConflicts({
			currentBasePlan: plan([usage("messages", MONTH, 1000)]),
			editedBasePlan: plan([usage("messages", MONTH, 2000)]),
			diff: {
				add_items: [{ feature_id: "messages" }],
				remove_items: [{ feature_id: "messages", interval: MONTH }],
			} as DiffedCustomizePlanV1,
			// variant diverged from the base (5000 vs base's 1000)
			variantPlan: plan([usage("messages", MONTH, 5000)]),
			features,
		});

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]).toMatchObject({
			reason: "value_divergence",
			feature_name: "Messages",
			item_filter: { feature_id: "messages" },
		});
	});

	test("editing only the one-off price ignores a customized included amount on the same feature", () => {
		const conflicts = detectVariantConflicts({
			currentBasePlan: plan([
				includedMonthly("messages", 403),
				oneOffPrepaid("messages", 1),
			]),
			editedBasePlan: plan([
				includedMonthly("messages", 403),
				oneOffPrepaid("messages", 3),
			]),
			diff: {
				add_items: [{ feature_id: "messages" }],
				remove_items: [{ feature_id: "messages" }],
			} as DiffedCustomizePlanV1,
			// variant customized its included amount (5003) but tracks the one-off
			// price ($1) the edit touches — propagation leaves the included alone.
			variantPlan: plan([
				includedMonthly("messages", 5003),
				oneOffPrepaid("messages", 1),
			]),
			features,
		});

		expect(conflicts).toHaveLength(0);
	});

	test("editing the included amount flags a variant that customized it", () => {
		const conflicts = detectVariantConflicts({
			currentBasePlan: plan([includedMonthly("messages", 403)]),
			editedBasePlan: plan([includedMonthly("messages", 1000)]),
			diff: {
				add_items: [{ feature_id: "messages" }],
				remove_items: [{ feature_id: "messages" }],
			} as DiffedCustomizePlanV1,
			variantPlan: plan([includedMonthly("messages", 5003)]),
			features,
		});

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]).toMatchObject({ reason: "value_divergence" });
	});

	test("editing the base price when the variant has a different price is a base_price_divergence conflict", () => {
		const conflicts = detectVariantConflicts({
			currentBasePlan: plan([], basePrice(20, BillingInterval.Month)),
			editedBasePlan: plan([], basePrice(25, BillingInterval.Month)),
			diff: {
				price: { amount: 25, interval: BillingInterval.Month },
			} as DiffedCustomizePlanV1,
			variantPlan: plan([], basePrice(200, BillingInterval.Year)),
			features,
		});

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]).toMatchObject({ reason: "base_price_divergence" });
	});

	test("editing the base price when the variant tracks it is not a conflict", () => {
		const conflicts = detectVariantConflicts({
			currentBasePlan: plan([], basePrice(20, BillingInterval.Month)),
			editedBasePlan: plan([], basePrice(25, BillingInterval.Month)),
			diff: {
				price: { amount: 25, interval: BillingInterval.Month },
			} as DiffedCustomizePlanV1,
			variantPlan: plan([], basePrice(20, BillingInterval.Month)),
			features,
		});

		expect(conflicts).toHaveLength(0);
	});
});
