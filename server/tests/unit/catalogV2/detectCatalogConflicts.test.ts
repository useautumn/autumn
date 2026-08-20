import { describe, expect, test } from "bun:test";
import {
	type ApiPlanItemV1,
	type ApiPlanV1,
	BillingInterval,
	BillingMethod,
	type Feature,
	FeatureType,
	FeatureUsageType,
	ResetInterval,
} from "@autumn/shared";
import { detectCatalogConflicts } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/conflicts/detectCatalogConflicts";

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

const detect = ({
	currentPlan,
	nextPlan,
	relativePlan,
}: {
	currentPlan: ApiPlanV1;
	nextPlan: ApiPlanV1;
	relativePlan: ApiPlanV1;
}) =>
	detectCatalogConflicts({
		currentPlan,
		nextPlan,
		relativePlan,
		features,
	});

describe("detectCatalogConflicts", () => {
	test("relative tracking the edited plan's current value is not a conflict", () => {
		// sibling that still has 100, or uncustomized license follow — same relative
		expect(
			detect({
				currentPlan: plan([usage("messages", MONTH, 100)]),
				nextPlan: plan([usage("messages", MONTH, 200)]),
				relativePlan: plan([usage("messages", MONTH, 100)]),
			}),
		).toEqual([]);
	});

	test("adding a feature the relative lacks is a clean add", () => {
		expect(
			detect({
				currentPlan: plan([usage("messages", MONTH)]),
				nextPlan: plan([usage("messages", MONTH), bool("dashboard")]),
				relativePlan: plan([usage("messages", MONTH)]),
			}),
		).toEqual([]);
	});

	test("removing a feature entirely from the edited plan is not a conflict", () => {
		expect(
			detect({
				currentPlan: plan([bool("dashboard"), usage("messages", MONTH)]),
				nextPlan: plan([usage("messages", MONTH)]),
				relativePlan: plan([bool("dashboard"), usage("messages", MONTH)]),
			}),
		).toEqual([]);
	});

	test("editing only an item the relative did not customize is not a conflict", () => {
		expect(
			detect({
				currentPlan: plan([
					includedMonthly("messages", 500),
					oneOffPrepaid("messages", 1),
				]),
				nextPlan: plan([
					includedMonthly("messages", 500),
					oneOffPrepaid("messages", 3),
				]),
				relativePlan: plan([
					includedMonthly("messages", 500),
					oneOffPrepaid("messages", 1),
				]),
			}),
		).toEqual([]);
	});

	test("editing an unrelated feature ignores a relative that diverged on messages", () => {
		expect(
			detect({
				currentPlan: plan([
					usage("messages", MONTH, 100),
					prepaid("seats", 10, BillingInterval.Month),
				]),
				nextPlan: plan([
					usage("messages", MONTH, 100),
					prepaid("seats", 12, BillingInterval.Month),
				]),
				relativePlan: plan([
					usage("messages", MONTH, 500),
					prepaid("seats", 10, BillingInterval.Month),
				]),
			}),
		).toEqual([]);
	});

	test("unpriced non-consumable with no real interval is not different_interval", () => {
		expect(
			detect({
				currentPlan: plan([includedNoReset("seats", 5)]),
				nextPlan: plan([includedNoReset("seats", 8)]),
				relativePlan: plan([includedMonthly("seats", 5)]),
			}),
		).toEqual([]);
	});

	test("same interval, relative included 500 vs edited 100→200 is value_divergence", () => {
		const conflicts = detect({
			currentPlan: plan([usage("messages", MONTH, 100)]),
			nextPlan: plan([usage("messages", MONTH, 200)]),
			relativePlan: plan([usage("messages", MONTH, 500)]),
		});

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]).toMatchObject({
			reason: "value_divergence",
			feature_name: "Messages",
			item_filter: { feature_id: "messages" },
		});
	});

	test("two features edited; relative only diverged on messages → only messages", () => {
		const conflicts = detect({
			currentPlan: plan([
				usage("messages", MONTH, 100),
				prepaid("seats", 10, BillingInterval.Month),
			]),
			nextPlan: plan([
				usage("messages", MONTH, 200),
				prepaid("seats", 12, BillingInterval.Month),
			]),
			relativePlan: plan([
				usage("messages", MONTH, 500),
				prepaid("seats", 10, BillingInterval.Month),
			]),
		});

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]).toMatchObject({
			reason: "value_divergence",
			item_filter: { feature_id: "messages" },
		});
	});

	test("sibling v1 drifted, v2 is the edited row — same detector with relative = v1", () => {
		const conflicts = detect({
			currentPlan: plan([usage("messages", MONTH, 100)]),
			nextPlan: plan([usage("messages", MONTH, 200)]),
			relativePlan: plan([usage("messages", MONTH, 500)]),
		});

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]?.reason).toBe("value_divergence");
	});

	test("relative holds messages yearly; edit is monthly usage → different_interval", () => {
		const conflicts = detect({
			currentPlan: plan([usage("messages", MONTH, 100)]),
			nextPlan: plan([usage("messages", MONTH, 200)]),
			relativePlan: plan([usage("messages", YEAR, 100)]),
		});

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]).toMatchObject({
			reason: "different_interval",
			feature_name: "Messages",
			item_filter: { feature_id: "messages", interval: YEAR },
		});
	});

	test("priced non-consumable monthly vs yearly is different_interval", () => {
		const conflicts = detect({
			currentPlan: plan([prepaid("seats", 10, BillingInterval.Month)]),
			nextPlan: plan([prepaid("seats", 12, BillingInterval.Month)]),
			relativePlan: plan([prepaid("seats", 100, BillingInterval.Year)]),
		});

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]).toMatchObject({
			reason: "different_interval",
			feature_name: "Seats",
			item_filter: { feature_id: "seats" },
		});
	});

	test("priced edit vs unpriced relative entitlement is different_interval", () => {
		const conflicts = detect({
			currentPlan: plan([prepaid("seats", 10, BillingInterval.Month)]),
			nextPlan: plan([prepaid("seats", 12, BillingInterval.Month)]),
			relativePlan: plan([includedNoReset("seats", 5)]),
		});

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]).toMatchObject({ reason: "different_interval" });
	});

	test("relative base price $200/year vs edited $20→$25/mo is base_price_divergence", () => {
		const conflicts = detect({
			currentPlan: plan([], basePrice(20, BillingInterval.Month)),
			nextPlan: plan([], basePrice(25, BillingInterval.Month)),
			relativePlan: plan([], basePrice(200, BillingInterval.Year)),
		});

		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]).toEqual({ reason: "base_price_divergence" });
		expect(conflicts[0]?.item_filter).toBeUndefined();
	});

	test("relative tracking the current base price is not a conflict", () => {
		expect(
			detect({
				currentPlan: plan([], basePrice(20, BillingInterval.Month)),
				nextPlan: plan([], basePrice(25, BillingInterval.Month)),
				relativePlan: plan([], basePrice(20, BillingInterval.Month)),
			}),
		).toEqual([]);
	});

	test("item_filter carries interval when needed to disambiguate", () => {
		const conflicts = detect({
			currentPlan: plan([usage("messages", MONTH, 100)]),
			nextPlan: plan([usage("messages", MONTH, 200)]),
			relativePlan: plan([usage("messages", YEAR, 100)]),
		});

		expect(conflicts[0]?.item_filter?.interval).toBe(YEAR);
		expect(conflicts[0]?.item_filter?.feature_id).toBe("messages");
	});

	test("empty relative or empty edit is not a conflict", () => {
		expect(
			detect({
				currentPlan: plan([]),
				nextPlan: plan([]),
				relativePlan: plan([]),
			}),
		).toEqual([]);
		expect(
			detect({
				currentPlan: plan([usage("messages", MONTH, 100)]),
				nextPlan: plan([usage("messages", MONTH, 200)]),
				relativePlan: plan([]),
			}),
		).toEqual([]);
		expect(
			detect({
				currentPlan: plan([]),
				nextPlan: plan([]),
				relativePlan: plan([usage("messages", MONTH, 500)]),
			}),
		).toEqual([]);
	});

	test("do not emit a conflict for a feature only in remove_items", () => {
		expect(
			detect({
				currentPlan: plan([bool("dashboard"), usage("messages", MONTH)]),
				nextPlan: plan([usage("messages", MONTH)]),
				relativePlan: plan([bool("dashboard"), usage("messages", MONTH)]),
			}),
		).toEqual([]);
	});
});
