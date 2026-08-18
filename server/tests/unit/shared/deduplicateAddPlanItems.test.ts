import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	AppEnv,
	BillingInterval,
	BillingMethod,
	buildPlanItemKey,
	type CreatePlanItemParamsV1,
	composeMatchKey,
	deduplicateAddPlanItems,
	PlanItemMatchPrecision,
	ResetInterval,
} from "@autumn/shared";

const freeMonthlyMessages = ({
	included,
}: {
	included: number;
}): CreatePlanItemParamsV1 => ({
	feature_id: "messages",
	included,
	reset: { interval: ResetInterval.Month },
});

const prepaidMonthlyMessages: ApiPlanV1["items"][number] = {
	feature_id: "messages",
	included: 100,
	unlimited: false,
	reset: null,
	price: {
		amount: 5,
		billing_method: BillingMethod.Prepaid,
		billing_units: 100,
		interval: BillingInterval.Month,
		max_purchase: null,
	},
};

const freeMonthlyMessagesSnapshot = ({
	included,
}: {
	included: number;
}): ApiPlanV1["items"][number] => ({
	feature_id: "messages",
	included,
	unlimited: false,
	reset: { interval: ResetInterval.Month },
	price: null,
});

const planWithItems = (items: ApiPlanV1["items"]): ApiPlanV1 => ({
	id: "plan",
	name: "Plan",
	description: null,
	group: null,
	version: 1,
	add_on: false,
	auto_enable: false,
	price: null,
	items,
	created_at: 0,
	env: AppEnv.Sandbox,
	archived: false,
	base_variant_id: null,
	config: { ignore_past_due: false },
	metadata: {},
});

test("buildPlanItemKey preserves composeMatchKey identity semantics", () => {
	expect(composeMatchKey(prepaidMonthlyMessages)).toBe(
		"messages|prepaid|month|1",
	);
	expect(
		buildPlanItemKey({
			item: prepaidMonthlyMessages,
			matchPrecision: PlanItemMatchPrecision.FeatureCadence,
		}),
	).toBe("messages|month|1");
});

test("deduplicateAddPlanItems removes one unambiguous same-cadence item", () => {
	const result = deduplicateAddPlanItems({
		base: planWithItems([prepaidMonthlyMessages]),
		addItems: [freeMonthlyMessages({ included: 200 })],
	});

	expect(result.items).toEqual([]);
});

test("deduplicateAddPlanItems preserves ambiguous same-cadence items", () => {
	const items = [
		prepaidMonthlyMessages,
		freeMonthlyMessagesSnapshot({ included: 150 }),
	];

	const result = deduplicateAddPlanItems({
		base: planWithItems(items),
		addItems: [freeMonthlyMessages({ included: 200 })],
	});

	expect(result.items).toEqual(items);
});
