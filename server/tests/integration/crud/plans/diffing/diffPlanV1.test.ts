import {
	AppEnv,
	type ApiPlanV1,
	BillingInterval,
	BillingMethod,
	OnDecrease,
	OnIncrease,
	ResetInterval,
	TierBehavior,
} from "@autumn/shared";
import { describe, expect, test } from "bun:test";
import { applyDiff } from "@autumn/shared/utils/planV1Utils/diff/applyDiff.js";
import { diffPlanV1 } from "@autumn/shared/utils/planV1Utils/diff/diffPlanV1.js";
import { popflyStart, popflyStartAnnual } from "./diffPlanV1.fixtures.js";

const makePlan = (overrides?: Partial<ApiPlanV1>): ApiPlanV1 => ({
	id: "test-plan",
	name: "Test Plan",
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

describe("diffPlanV1 — popfly start vs start_annual", () => {
	test("start → start_annual: only price diffs (annual price)", () => {
		const diff = diffPlanV1({ from: popflyStart, to: popflyStartAnnual });

		expect(diff.price).toEqual({
			amount: 5988,
			interval: BillingInterval.Year,
		});
		expect(diff.add_items).toBeUndefined();
		expect(diff.remove_items).toBeUndefined();
		expect(diff.free_trial).toBeUndefined();
	});

	test("start → start: empty diff (no fields set)", () => {
		const diff = diffPlanV1({ from: popflyStart, to: popflyStart });

		expect(diff).toEqual({});
	});

	test("start_annual → start (reverse): price is the monthly price", () => {
		const diff = diffPlanV1({ from: popflyStartAnnual, to: popflyStart });

		expect(diff.price).toEqual({
			amount: 499,
			interval: BillingInterval.Month,
		});
		expect(diff.add_items).toBeUndefined();
		expect(diff.remove_items).toBeUndefined();
		expect(diff.free_trial).toBeUndefined();
	});

	test("modify-in-place: same feature_id with different included → remove + add", () => {
		const modified: ApiPlanV1 = {
			...popflyStart,
			items: popflyStart.items.map((item) =>
				item.feature_id === "social_listening_terms"
					? { ...item, included: 999 }
					: item,
			),
		};

		const diff = diffPlanV1({ from: popflyStart, to: modified });

		expect(diff.remove_items).toEqual([
			{ feature_id: "social_listening_terms" },
		]);
		expect(diff.add_items).toHaveLength(1);
		expect(diff.add_items?.[0]).toMatchObject({
			feature_id: "social_listening_terms",
			included: 999,
		});
		expect(diff.price).toBeUndefined();
	});

	test("applyDiff dedupes boolean add_items already present on the base plan", () => {
		const reconstructed = applyDiff({
			base: popflyStart,
			diff: {
				add_items: [{ feature_id: "adventures" }],
			},
		});

		let adventuresCount = 0;
		for (const item of reconstructed.items) {
			if (item.feature_id === "adventures") adventuresCount += 1;
		}

		expect(adventuresCount).toBe(1);
	});

	test("default interval_count values do not create phantom diffs", () => {
		const from = makePlan({
			price: { amount: 10, interval: BillingInterval.Month },
			items: [
				{
					feature_id: "messages",
					included: 100,
					unlimited: false,
					reset: { interval: ResetInterval.Month },
					price: {
						amount: 1,
						interval: BillingInterval.Month,
						billing_units: 1,
						billing_method: BillingMethod.UsageBased,
						max_purchase: null,
					},
				},
			],
		});
		const to = makePlan({
			price: { amount: 10, interval: BillingInterval.Month, interval_count: 1 },
			items: [
				{
					feature_id: "messages",
					included: 100,
					unlimited: false,
					reset: { interval: ResetInterval.Month, interval_count: 1 },
					price: {
						amount: 1,
						interval: BillingInterval.Month,
						interval_count: 1,
						billing_units: 1,
						billing_method: BillingMethod.UsageBased,
						max_purchase: null,
					},
				},
			],
		});

		expect(diffPlanV1({ from, to })).toEqual({});
	});

	test("default graduated tier behavior does not create phantom diffs", () => {
		const from = makePlan({
			items: [
				{
					feature_id: "messages",
					included: 100,
					unlimited: false,
					reset: { interval: ResetInterval.Month },
					price: {
						tiers: [{ to: 1000, amount: 1 }],
						tier_behavior: TierBehavior.Graduated,
						interval: BillingInterval.Month,
						billing_units: 1,
						billing_method: BillingMethod.UsageBased,
						max_purchase: null,
					},
				},
			],
		});
		const to = makePlan({
			items: [
				{
					feature_id: "messages",
					included: 100,
					unlimited: false,
					reset: { interval: ResetInterval.Month },
					price: {
						tiers: [{ to: 1000, amount: 1 }],
						interval: BillingInterval.Month,
						billing_units: 1,
						billing_method: BillingMethod.UsageBased,
						max_purchase: null,
					},
				},
			],
		});

		expect(diffPlanV1({ from, to })).toEqual({});
	});

	test("proration changes are preserved in item diffs", () => {
		const expectedProration = {
			on_increase: OnIncrease.BillNextCycle,
			on_decrease: OnDecrease.None,
		};
		const from = makePlan({
			items: [
				{
					feature_id: "users",
					included: 1,
					unlimited: false,
					reset: null,
					price: {
						amount: 10,
						interval: BillingInterval.Month,
						billing_units: 1,
						billing_method: BillingMethod.Prepaid,
						max_purchase: null,
					},
					proration: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.Prorate,
					},
				},
			],
		});
		const to = makePlan({
			items: [
				{
					...from.items[0]!,
					proration: expectedProration,
				},
			],
		});

		const diff = diffPlanV1({ from, to });
		expect(diff.add_items?.[0].proration).toEqual(expectedProration);
		expect(applyDiff({ base: from, diff }).items[0].proration).toEqual(
			expectedProration,
		);
	});

	test("entity feature changes are preserved in item diffs", () => {
		const from = makePlan({
			items: [
				{
					feature_id: "messages",
					entity_feature_id: "workspace",
					included: 100,
					unlimited: false,
					reset: { interval: ResetInterval.Month },
					price: null,
				},
			],
		});
		const to = makePlan({
			items: [
				{
					...from.items[0],
					entity_feature_id: "user",
				},
			],
		});

		const diff = diffPlanV1({ from, to });
		expect(diff.add_items?.[0].entity_feature_id).toBe("user");
		expect(applyDiff({ base: from, diff }).items).toEqual(
			expect.arrayContaining(to.items),
		);
	});

	test("remove filters include default interval_count when needed for precision", () => {
		const from = makePlan({
			items: [
				{
					feature_id: "messages",
					included: 100,
					unlimited: false,
					reset: { interval: ResetInterval.Month },
					price: null,
				},
				{
					feature_id: "messages",
					included: 200,
					unlimited: false,
					reset: { interval: ResetInterval.Month, interval_count: 2 },
					price: null,
				},
			],
		});
		const to = makePlan({
			items: [{ ...from.items[0], included: 150 }, from.items[1]],
		});

		const diff = diffPlanV1({ from, to });
		expect(diff.remove_items).toEqual([
			{
				feature_id: "messages",
				interval: ResetInterval.Month,
				interval_count: 1,
			},
		]);
		expect(applyDiff({ base: from, diff }).items).toEqual(
			expect.arrayContaining(to.items),
		);
	});
});
