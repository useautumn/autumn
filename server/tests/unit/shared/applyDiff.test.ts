import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	type ApiPlanLicenseV1,
	type ApiPlanV1,
	BillingInterval,
	BillingMethod,
	type DiffedCustomizePlanV1,
} from "@autumn/shared";
import { ApiPlanItemV1Schema } from "@autumn/shared/api/products/items/apiPlanItemV1.js";
import {
	applyCustomizeToPlan,
	applyDiff,
} from "@autumn/shared/utils/planV1Utils/diff/applyDiff.js";
import { toCreatePlanItemParams } from "@autumn/shared/utils/planV1Utils/diff/diffPlanV1.js";

type DiffablePlan = ApiPlanV1 & { licenses?: ApiPlanLicenseV1[] };

const makePlan = (overrides?: Partial<DiffablePlan>): DiffablePlan => ({
	id: "team",
	name: "Team",
	description: null,
	group: null,
	version: 1,
	add_on: false,
	auto_enable: false,
	price: null,
	items: [],
	created_at: 0,
	env: AppEnv.Sandbox,
	archived: false,
	base_variant_id: null,
	config: { ignore_past_due: false },
	metadata: {},
	...overrides,
});

test("applyDiff normalizes add_items into valid API plan item snapshots", () => {
	const base = makePlan();

	const diff = {
		add_items: [
			{
				feature_id: "emails",
				included: 100000,
				price: {
					amount: 0.52,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.UsageBased,
				},
				rollover: {
					expiry_duration_type: "month",
				},
			},
		],
	} as DiffedCustomizePlanV1;

	const item = applyDiff({ base, diff }).items[0];

	expect(item.price?.max_purchase).toBeNull();
	expect(item.rollover?.max).toBeNull();
	expect(() => ApiPlanItemV1Schema.parse(item)).not.toThrow();
});

test("applyCustomizeToPlan PUT items replaces the list", () => {
	const base = makePlan({
		items: [
			{
				feature_id: "messages",
				included: 100,
				unlimited: false,
				reset: null,
				price: null,
			},
			{
				feature_id: "dashboard",
				included: 0,
				unlimited: false,
				reset: null,
				price: null,
			},
		],
	});

	const replaced = applyCustomizeToPlan({
		plan: base,
		customize: {
			items: [{ feature_id: "messages", included: 300 }],
		},
	});
	expect(replaced.items.map((item) => item.feature_id)).toEqual(["messages"]);
	expect(replaced.items[0]?.included).toBe(300);

	const patched = applyCustomizeToPlan({
		plan: base,
		customize: {
			add_items: [{ feature_id: "admin" }],
		},
	});
	expect(patched.items.map((item) => item.feature_id)).toEqual([
		"messages",
		"dashboard",
		"admin",
	]);
});

test("applyCustomizeToPlan PUT items keeps entitlement, price, and stripe ids", () => {
	const plan = makePlan();

	const applied = applyCustomizeToPlan({
		plan,
		customize: {
			items: [
				{
					feature_id: "messages",
					included: 100,
					entitlement_id: "ent_keep",
					price_id: "pr_keep",
					price: {
						stripe_price_id: "price_stripe_keep",
						amount: 10,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.Prepaid,
					},
				},
			],
		},
	});

	const item = applied.items[0];
	expect(item?.entitlement_id).toBe("ent_keep");
	expect(item?.price_id).toBe("pr_keep");
	expect(
		item?.price && "stripe_price_id" in item.price
			? item.price.stripe_price_id
			: undefined,
	).toBe("price_stripe_keep");

	const params = toCreatePlanItemParams(item!);
	expect(params.entitlement_id).toBeUndefined();
	expect(params.price_id).toBeUndefined();
	expect(params.price?.stripe_price_id).toBe("price_stripe_keep");
});

test("applyCustomizeToPlan drops licenses listed in remove_licenses", () => {
	const plan = makePlan({
		licenses: [
			{
				license_plan_id: "qa-2p-seat",
				version: 1,
				included: 2,
				prepaid_only: false,
			},
		],
	});

	const applied = applyCustomizeToPlan({
		plan,
		customize: {
			remove_licenses: [{ license_plan_id: "qa-2p-seat" }],
		},
	});

	expect(applied.licenses).toEqual([]);
});
