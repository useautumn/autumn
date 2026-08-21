/**
 * PlanItemFilterPrecision: IdentityAndIncluded stamps grant onto remove
 * filters. Default Identity stays a cadence wildcard.
 *
 * Contract:
 *   D1 default 100→200 — remove has no included
 *   D2 IdentityAndIncluded 100→200 — remove included: 100, add 200, same match key
 *   D3 boolean / unlimited + flag — no included on the filter
 *   D4 planItemFiltersEqual treats omitted vs 100 as different
 *
 * included is a live-row dimension. It must not enter composeMatchKey /
 * planItemFilterMatchKey or 100/mo will fail to pair with add 200.
 */

import { describe, expect, test } from "bun:test";
import {
	type ApiPlanV1,
	AppEnv,
	planItemFilterMatchKey,
	PlanItemFilterPrecision,
	ResetInterval,
} from "@autumn/shared";
import { planItemFiltersEqual } from "@autumn/shared/utils/planV1Utils/diff/comparePlanItems.js";
import { diffPlanV1 } from "@autumn/shared/utils/planV1Utils/diff/diffPlanV1.js";

const plan = (overrides: Partial<ApiPlanV1>): ApiPlanV1 =>
	({
		id: "pro",
		name: "Pro",
		description: null,
		group: null,
		version: 1,
		add_on: false,
		auto_enable: false,
		price: null,
		items: [],
		created_at: 1,
		env: AppEnv.Sandbox,
		archived: false,
		base_variant_id: null,
		config: { ignore_past_due: false },
		metadata: {},
		...overrides,
	}) as ApiPlanV1;

const monthlyMessages = ({ included }: { included: number }) => ({
	feature_id: "messages",
	included,
	unlimited: false,
	reset: { interval: ResetInterval.Month },
	price: null,
});

const from100 = plan({ items: [monthlyMessages({ included: 100 })] });
const to200 = plan({ items: [monthlyMessages({ included: 200 })] });

const identityAndIncludedDiff = () =>
	diffPlanV1({
		from: from100,
		to: to200,
		filterPrecision: PlanItemFilterPrecision.IdentityAndIncluded,
	});

describe("diffPlanV1 filterPrecision", () => {
	test("D1: default 100→200 omit included on the remove filter", () => {
		const diff = diffPlanV1({ from: from100, to: to200 });

		expect(diff.remove_items).toEqual([
			{
				feature_id: "messages",
				interval: ResetInterval.Month,
				interval_count: 1,
			},
		]);
		expect(diff.add_items?.[0]).toMatchObject({
			feature_id: "messages",
			included: 200,
		});
	});

	test("D2: IdentityAndIncluded stamps included: 100 and keeps the identity key", () => {
		const diff = identityAndIncludedDiff();

		expect(diff.remove_items).toEqual([
			{
				feature_id: "messages",
				interval: ResetInterval.Month,
				interval_count: 1,
				included: 100,
			},
		]);
		expect(diff.add_items?.[0]).toMatchObject({
			feature_id: "messages",
			included: 200,
		});

		const stamped = {
			feature_id: "messages",
			interval: ResetInterval.Month,
			interval_count: 1,
			included: 100,
		};
		expect(planItemFilterMatchKey(stamped)).toBe(
			planItemFilterMatchKey({
				feature_id: "messages",
				interval: ResetInterval.Month,
				interval_count: 1,
			}),
		);
	});

	test("D3: boolean and unlimited removes never stamp included", () => {
		const booleanItem = {
			feature_id: "dashboard",
		} as ApiPlanV1["items"][number];
		const booleanDiff = diffPlanV1({
			from: plan({ items: [booleanItem] }),
			to: plan({ items: [] }),
			filterPrecision: PlanItemFilterPrecision.IdentityAndIncluded,
		});
		expect(booleanDiff.remove_items).toEqual([{ feature_id: "dashboard" }]);

		const unlimitedItem = {
			feature_id: "messages",
			unlimited: true,
			reset: { interval: ResetInterval.Month },
			price: null,
		} as ApiPlanV1["items"][number];
		const unlimitedDiff = diffPlanV1({
			from: plan({ items: [unlimitedItem] }),
			to: plan({ items: [] }),
			filterPrecision: PlanItemFilterPrecision.IdentityAndIncluded,
		});
		expect(unlimitedDiff.remove_items?.[0]).not.toHaveProperty("included");
	});

	test("D4: planItemFiltersEqual treats omitted included as not equal to 100", () => {
		const identity = {
			feature_id: "messages",
			interval: ResetInterval.Month,
			interval_count: 1,
		};
		expect(
			planItemFiltersEqual(identity, { ...identity, included: 100 }),
		).toBe(false);
		expect(
			planItemFiltersEqual(
				{ ...identity, included: 100 },
				{ ...identity, included: 100 },
			),
		).toBe(true);
	});
});
