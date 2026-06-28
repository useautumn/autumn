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

const plan = (items: ApiPlanItemV1[]): ApiPlanV1 => ({ items }) as ApiPlanV1;

const features = [
	{ id: "messages", name: "Messages" },
	{ id: "dashboard", name: "Dashboard" },
] as Feature[];

const MONTH = ResetInterval.Month as ResetInterval & BillingInterval;
const YEAR = ResetInterval.Year as ResetInterval & BillingInterval;

describe("detectVariantConflicts", () => {
	test("removing a boolean feature from the base is not a conflict", () => {
		const conflicts = detectVariantConflicts({
			// dashboard removed from the edited base
			editedBasePlan: plan([usage("messages", MONTH)]),
			diff: { remove_items: [{ feature_id: "dashboard" }] } as DiffedCustomizePlanV1,
			// variant still holds the boolean
			variantPlan: plan([bool("dashboard"), usage("messages", MONTH)]),
			features,
		});

		expect(conflicts).toHaveLength(0);
	});

	test("adding a feature the variant lacks is a clean add, not a conflict", () => {
		const conflicts = detectVariantConflicts({
			editedBasePlan: plan([usage("messages", MONTH), bool("dashboard")]),
			diff: { add_items: [{ feature_id: "dashboard" }] } as DiffedCustomizePlanV1,
			variantPlan: plan([usage("messages", MONTH)]),
			features,
		});

		expect(conflicts).toHaveLength(0);
	});

	test("modifying a feature the variant shares the interval of is not a conflict", () => {
		const conflicts = detectVariantConflicts({
			editedBasePlan: plan([usage("messages", MONTH, 2000)]),
			diff: {
				add_items: [{ feature_id: "messages" }],
				remove_items: [{ feature_id: "messages", interval: MONTH }],
			} as DiffedCustomizePlanV1,
			variantPlan: plan([usage("messages", MONTH, 5000)]),
			features,
		});

		expect(conflicts).toHaveLength(0);
	});

	test("variant on a different interval than the edit is a different_interval conflict", () => {
		const conflicts = detectVariantConflicts({
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
});
