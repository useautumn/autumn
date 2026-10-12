import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	EntInterval,
	Infinite,
	OnDecrease,
	OnIncrease,
	RolloverExpiryDurationType,
	TierBehavior,
	type UsageTier,
} from "@autumn/shared";
import {
	allocatedSeatsItem,
	asCustomRow,
	booleanItem,
	catalogPlan,
	customerPlan,
	derive,
	includedItem,
	type PlanItemRows,
	payPerUseItem,
	prepaidItem,
	prepaidSeatsItem,
	unlimitedItem,
	workspaces,
} from "./isCustomFixtures";

type ItemCase = {
	name: string;
	catalog: PlanItemRows[];
	customer: PlanItemRows[];
	custom: boolean;
};

const runCases = (cases: ItemCase[]) =>
	test.each(cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
		expect(
			derive({
				customer: customerPlan({ items: c.customer }),
				catalog: catalogPlan({ items: c.catalog }),
			}).isCustom,
		).toBe(c.custom);
	});

const monthlyRollover = (max: number) => ({
	max,
	duration: RolloverExpiryDurationType.Month,
	length: 1,
});

const graduatedTiers: UsageTier[] = [
	{ to: 1_000, amount: 0.02 },
	{ to: Infinite, amount: 0.01 },
];

describe("deriveCustomerProductIsCustom items", () => {
	describe("included (free metered) usage", () => {
		runCases([
			{
				name: "same grant → not custom",
				catalog: [includedItem()],
				customer: [includedItem()],
				custom: false,
			},
			{
				name: "same terms on the customer's own rows → not custom",
				catalog: [includedItem()],
				customer: [asCustomRow(includedItem())],
				custom: false,
			},
			{
				name: "different included amount → custom",
				catalog: [includedItem({ allowance: 300 })],
				customer: [includedItem({ allowance: 200 })],
				custom: true,
			},
			{
				name: "different reset interval → custom",
				catalog: [includedItem({ interval: EntInterval.Month })],
				customer: [includedItem({ interval: EntInterval.Year })],
				custom: true,
			},
			{
				name: "unlimited instead of a fixed grant → custom",
				catalog: [includedItem()],
				customer: [unlimitedItem()],
				custom: true,
			},
			{
				name: "per-entity grant instead of customer-level → custom",
				catalog: [includedItem()],
				customer: [includedItem({ entityFeatureId: workspaces.id })],
				custom: true,
			},
			{
				name: "an item the plan does not have → custom",
				catalog: [includedItem()],
				customer: [includedItem(), booleanItem()],
				custom: true,
			},
			{
				name: "an item missing from the customer → custom",
				catalog: [includedItem(), booleanItem()],
				customer: [includedItem()],
				custom: true,
			},
			{
				name: "a second grant for the same feature and cadence → custom",
				catalog: [includedItem()],
				customer: [
					includedItem(),
					includedItem({ id: "ent_credits_extra", allowance: 9 }),
				],
				custom: true,
			},
		]);
	});

	describe("rollovers", () => {
		runCases([
			{
				name: "same rollover config → not custom",
				catalog: [includedItem({ rollover: monthlyRollover(100) })],
				customer: [includedItem({ rollover: monthlyRollover(100) })],
				custom: false,
			},
			{
				name: "rollover added → custom",
				catalog: [includedItem()],
				customer: [includedItem({ rollover: monthlyRollover(100) })],
				custom: true,
			},
			{
				name: "rollover removed → custom",
				catalog: [includedItem({ rollover: monthlyRollover(100) })],
				customer: [includedItem()],
				custom: true,
			},
			{
				name: "different rollover cap → custom",
				catalog: [includedItem({ rollover: monthlyRollover(100) })],
				customer: [includedItem({ rollover: monthlyRollover(500) })],
				custom: true,
			},
			{
				name: "rollover that never expires instead of monthly → custom",
				catalog: [includedItem({ rollover: monthlyRollover(100) })],
				customer: [
					includedItem({
						rollover: {
							max: 100,
							duration: RolloverExpiryDurationType.Forever,
							length: 0,
						},
					}),
				],
				custom: true,
			},
			{
				name: "rollover on a prepaid item, same config → not custom",
				catalog: [prepaidItem({ rollover: monthlyRollover(1_000) })],
				customer: [prepaidItem({ rollover: monthlyRollover(1_000) })],
				custom: false,
			},
		]);
	});

	describe("pooled balances", () => {
		runCases([
			{
				name: "pooled on both sides → not custom",
				catalog: [includedItem({ pooled: true })],
				customer: [includedItem({ pooled: true })],
				custom: false,
			},
			{
				name: "pooled for the customer only → custom",
				catalog: [includedItem()],
				customer: [includedItem({ pooled: true })],
				custom: true,
			},
			{
				name: "pooled in the plan only → custom",
				catalog: [includedItem({ pooled: true })],
				customer: [includedItem()],
				custom: true,
			},
			{
				name: "pooled prepaid credits, same terms → not custom",
				catalog: [prepaidItem({ pooled: true })],
				customer: [asCustomRow(prepaidItem({ pooled: true }))],
				custom: false,
			},
		]);
	});

	describe("prepaid consumable", () => {
		runCases([
			{
				name: "same price → not custom",
				catalog: [prepaidItem()],
				customer: [prepaidItem()],
				custom: false,
			},
			{
				name: "same price on a legacy Stripe price → not custom",
				catalog: [prepaidItem({ stripePriceId: "price_current" })],
				customer: [prepaidItem({ stripePriceId: "price_2023" })],
				custom: false,
			},
			{
				name: "different unit price → custom",
				catalog: [prepaidItem({ amount: 10 })],
				customer: [prepaidItem({ amount: 8 })],
				custom: true,
			},
			{
				name: "different billing units → custom",
				catalog: [prepaidItem({ billingUnits: 100 })],
				customer: [prepaidItem({ billingUnits: 1_000 })],
				custom: true,
			},
			{
				name: "free amount included on top → custom",
				catalog: [prepaidItem({ allowance: 0 })],
				customer: [prepaidItem({ allowance: 500 })],
				custom: true,
			},
			{
				name: "different billing interval → custom",
				catalog: [prepaidItem({ interval: BillingInterval.Month })],
				customer: [prepaidItem({ interval: BillingInterval.Year })],
				custom: true,
			},
			{
				name: "one-off instead of recurring → custom",
				catalog: [prepaidItem({ interval: BillingInterval.Month })],
				customer: [
					prepaidItem({
						interval: BillingInterval.OneOff,
						resetInterval: EntInterval.Lifetime,
					}),
				],
				custom: true,
			},
			{
				name: "different purchase limit → custom",
				catalog: [prepaidItem({ usageLimit: 10_000 })],
				customer: [prepaidItem({ usageLimit: 50_000 })],
				custom: true,
			},
		]);
	});

	describe("prepaid non-consumable", () => {
		runCases([
			{
				name: "same seat price → not custom",
				catalog: [prepaidSeatsItem({ amount: 10 })],
				customer: [asCustomRow(prepaidSeatsItem({ amount: 10 }))],
				custom: false,
			},
			{
				name: "different seat price → custom",
				catalog: [prepaidSeatsItem({ amount: 10 })],
				customer: [prepaidSeatsItem({ amount: 8 })],
				custom: true,
			},
			{
				name: "included seats on top → custom",
				catalog: [prepaidSeatsItem({ allowance: 0 })],
				customer: [prepaidSeatsItem({ allowance: 3 })],
				custom: true,
			},
			{
				name: "different proration on decrease → custom",
				catalog: [
					prepaidSeatsItem({
						prorationConfig: {
							on_increase: OnIncrease.ProrateImmediately,
							on_decrease: OnDecrease.ProrateImmediately,
						},
					}),
				],
				customer: [
					prepaidSeatsItem({
						prorationConfig: {
							on_increase: OnIncrease.ProrateImmediately,
							on_decrease: OnDecrease.None,
						},
					}),
				],
				custom: true,
			},
		]);
	});

	describe("postpaid consumable (pay per use)", () => {
		runCases([
			{
				name: "same overage price → not custom",
				catalog: [payPerUseItem({ allowance: 100, amount: 0.5 })],
				customer: [asCustomRow(payPerUseItem({ allowance: 100, amount: 0.5 }))],
				custom: false,
			},
			{
				name: "different overage price → custom",
				catalog: [payPerUseItem({ amount: 0.5 })],
				customer: [payPerUseItem({ amount: 0.4 })],
				custom: true,
			},
			{
				name: "different included usage → custom",
				catalog: [payPerUseItem({ allowance: 100 })],
				customer: [payPerUseItem({ allowance: 1_000 })],
				custom: true,
			},
			{
				name: "same graduated tiers → not custom",
				catalog: [payPerUseItem({ tiers: graduatedTiers })],
				customer: [payPerUseItem({ tiers: graduatedTiers })],
				custom: false,
			},
			{
				name: "different tier boundary → custom",
				catalog: [payPerUseItem({ tiers: graduatedTiers })],
				customer: [
					payPerUseItem({
						tiers: [
							{ to: 5_000, amount: 0.02 },
							{ to: Infinite, amount: 0.01 },
						],
					}),
				],
				custom: true,
			},
			{
				name: "volume instead of graduated tiers → custom",
				catalog: [
					payPerUseItem({
						tiers: graduatedTiers,
						tierBehavior: TierBehavior.Graduated,
					}),
				],
				customer: [
					payPerUseItem({
						tiers: graduatedTiers,
						tierBehavior: TierBehavior.VolumeBased,
					}),
				],
				custom: true,
			},
			{
				name: "billed in advance instead of in arrears → custom",
				catalog: [payPerUseItem()],
				customer: [prepaidItem()],
				custom: true,
			},
		]);
	});

	describe("postpaid non-consumable (allocated)", () => {
		runCases([
			{
				name: "same seat price → not custom",
				catalog: [allocatedSeatsItem({ allowance: 5, amount: 12 })],
				customer: [
					asCustomRow(allocatedSeatsItem({ allowance: 5, amount: 12 })),
				],
				custom: false,
			},
			{
				name: "different seat price → custom",
				catalog: [allocatedSeatsItem({ amount: 12 })],
				customer: [allocatedSeatsItem({ amount: 9 })],
				custom: true,
			},
			{
				name: "different included seats → custom",
				catalog: [allocatedSeatsItem({ allowance: 5 })],
				customer: [allocatedSeatsItem({ allowance: 10 })],
				custom: true,
			},
			{
				name: "different proration on increase → custom",
				catalog: [
					allocatedSeatsItem({
						prorationConfig: {
							on_increase: OnIncrease.ProrateImmediately,
							on_decrease: OnDecrease.ProrateImmediately,
						},
					}),
				],
				customer: [
					allocatedSeatsItem({
						prorationConfig: {
							on_increase: OnIncrease.BillNextCycle,
							on_decrease: OnDecrease.ProrateImmediately,
						},
					}),
				],
				custom: true,
			},
		]);
	});

	describe("boolean features", () => {
		runCases([
			{
				name: "same feature flag → not custom",
				catalog: [booleanItem()],
				customer: [asCustomRow(booleanItem())],
				custom: false,
			},
			{
				name: "feature flag granted on top → custom",
				catalog: [],
				customer: [booleanItem()],
				custom: true,
			},
		]);
	});
});
