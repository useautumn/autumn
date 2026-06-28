import { describe, expect, test } from "bun:test";
import {
	type ApiPlanItemV1,
	type ApiPlanV1,
	BillingInterval,
	BillingMethod,
	type DiffedCustomizePlanV1,
	type Feature,
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

const basePrice = (amount: number, interval: BillingInterval) =>
	({ amount, interval }) as ApiPlanV1["price"];

const plan = (
	items: ApiPlanItemV1[],
	price: ApiPlanV1["price"] = null,
): ApiPlanV1 => ({ items, price }) as ApiPlanV1;

const features = [
	{ id: "messages", name: "Messages" },
	{ id: "dashboard", name: "Dashboard" },
] as Feature[];

const MONTH = ResetInterval.Month as ResetInterval & BillingInterval;
const YEAR = ResetInterval.Year as ResetInterval & BillingInterval;

describe("detectVariantConflicts", () => {
	test("removing a boolean feature from the base is not a conflict", () => {
		const conflicts = detectVariantConflicts({
			currentBasePlan: plan([bool("dashboard"), usage("messages", MONTH)]),
			editedBasePlan: plan([usage("messages", MONTH)]),
			diff: { remove_items: [{ feature_id: "dashboard" }] } as DiffedCustomizePlanV1,
			variantPlan: plan([bool("dashboard"), usage("messages", MONTH)]),
			features,
		});

		expect(conflicts).toHaveLength(0);
	});

	test("adding a feature the variant lacks is a clean add, not a conflict", () => {
		const conflicts = detectVariantConflicts({
			currentBasePlan: plan([usage("messages", MONTH)]),
			editedBasePlan: plan([usage("messages", MONTH), bool("dashboard")]),
			diff: { add_items: [{ feature_id: "dashboard" }] } as DiffedCustomizePlanV1,
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
			diff: { add_items: [{ feature_id: "messages" }] } as DiffedCustomizePlanV1,
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
