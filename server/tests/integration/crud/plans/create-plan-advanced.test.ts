import { expect, test } from "bun:test";
import {
	type ApiPlan,
	type ApiPlanV1,
	type ApiProduct,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsInput,
	FreeTrialDuration,
	Infinite,
	ProductItemInterval,
	ResetInterval,
	TierBehavior,
	TierInfinite,
	UsageModel,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_1 = new AutumnInt({ version: ApiVersion.V2_1 });
const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });

// ═══════════════════════════════════════════════════════════════════════════════
// METERED & USAGE FEATURES
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("create: metered feature with monthly reset")}`, async () => {
	const productId = "metered_monthly";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	const created = await autumnV2.products.create<
		ApiPlan,
		CreatePlanParamsInput
	>({
		id: productId,
		name: "Metered Monthly",
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 1000,
				reset: { interval: ResetInterval.Month },
			},
		],
	});

	expect(created.features).toHaveLength(1);
	expect(created.features[0]).toMatchObject({
		feature_id: TestFeature.Messages,
		granted_balance: 1000,
	});

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items[0]).toMatchObject({
		included_usage: 1000,
		interval: ProductItemInterval.Month,
	});
});

test.concurrent(`${chalk.yellowBright("create: usage pricing (pay-per-use)")}`, async () => {
	const productId = "usage_price";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	const created = await autumnV2.products.create<
		ApiPlan,
		CreatePlanParamsInput
	>({
		id: productId,
		name: "Usage Price",
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					amount: 10,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.UsageBased,
					billing_units: 1,
				},
			},
		],
	});

	expect(created.features[0]).toMatchObject({
		price: { amount: 10, usage_model: UsageModel.PayPerUse },
	});

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items[0]).toMatchObject({
		price: 10,
		usage_model: UsageModel.PayPerUse,
		billing_units: 1,
		interval: ProductItemInterval.Month,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TIERED PRICING
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("create: feature with tiered pricing")}`, async () => {
	const productId = "tiered_pricing";
	try {
		await autumnV2_1.products.delete(productId);
	} catch (_error) {}

	const created = await autumnV2_1.products.create<
		ApiPlanV1,
		CreatePlanParamsInput
	>({
		id: productId,
		name: "Tiered Pricing Plan",
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					tiers: [
						{ to: 100, amount: 0.1 },
						{ to: 500, amount: 0.08 },
						{ to: TierInfinite, amount: 0.05 },
					],
					interval: BillingInterval.Month,
					billing_method: BillingMethod.UsageBased,
					billing_units: 1,
				},
			},
		],
	});

	// V2.1: ApiPlanV1 — no included, so tiers are same across all versions
	const item = created.items[0];
	expect(item.price!.tiers).toHaveLength(3);
	expect(item.price!.tiers).toEqual([
		{ to: 100, amount: 0.1 },
		{ to: 500, amount: 0.08 },
		{ to: TierInfinite, amount: 0.05 },
	]);
	expect(item.price!.billing_method).toBe(BillingMethod.UsageBased);

	// V2.0: ApiPlan — same tiers (no included to subtract)
	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.features[0].price!.tiers).toEqual([
		{ to: 100, amount: 0.1 },
		{ to: 500, amount: 0.08 },
		{ to: TierInfinite, amount: 0.05 },
	]);

	// V1.2: ApiProduct — same tiers
	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items[0].tiers).toHaveLength(3);
	expect(v1_2.items[0].tiers).toEqual([
		{ to: 100, amount: 0.1 },
		{ to: 500, amount: 0.08 },
		{ to: TierInfinite, amount: 0.05 },
	]);
	expect(v1_2.items[0]).toMatchObject({
		usage_model: UsageModel.PayPerUse,
		interval: ProductItemInterval.Month,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-VERSION CONSISTENCY
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cross-version: V2 CREATE → V1.2 GET field transformations")}`, async () => {
	const productId = "cross_v2";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	await autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
		id: productId,
		name: "Cross Version V2",
		add_on: true,
		auto_enable: false,
		price: { amount: 1000, interval: BillingInterval.Month },
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 100,
				reset: { interval: ResetInterval.Month },
			},
		],
	});

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);

	expect(v1_2).toMatchObject({
		is_add_on: true,
		is_default: false,
	});
	expect(v1_2.items).toHaveLength(2); // base price + feature

	const basePrice = v1_2.items.find((i) => !i.feature_id);
	expect(basePrice).toMatchObject({ price: 1000 });

	const feature = v1_2.items.find((i) => i.feature_id === TestFeature.Messages);
	expect(feature).toMatchObject({ included_usage: 100 });
});

test.concurrent(`${chalk.yellowBright("cross-version: round-trip V2 → V1.2 → V2 data consistency")}`, async () => {
	const productId = "roundtrip";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	await autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
		id: productId,
		name: "Round Trip",
		price: { amount: 5000, interval: BillingInterval.Month },
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 500,
				reset: { interval: ResetInterval.Month },
			},
		],
	});

	const backToV2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(backToV2).toMatchObject({
		name: "Round Trip",
		price: { amount: 5000 },
	});
	expect(backToV2.features).toHaveLength(1);
	expect(backToV2.features[0]).toMatchObject({ granted_balance: 500 });
});

test.concurrent(`${chalk.yellowBright("cross-version: free trial transformation (duration_type → duration)")}`, async () => {
	const productId = "trial_transform";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	await autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
		id: productId,
		name: "Trial Transform",
		price: { amount: 2900, interval: BillingInterval.Month },
		free_trial: {
			duration_type: FreeTrialDuration.Day,
			duration_length: 7,
			card_required: true,
		},
	});

	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.free_trial).toMatchObject({
		duration_type: FreeTrialDuration.Day,
		duration_length: 7,
	});

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.free_trial).toMatchObject({
		duration: FreeTrialDuration.Day,
		length: 7,
		unique_fingerprint: true,
	});
});

test.concurrent(`${chalk.yellowBright("cross-version: unlimited feature transformation")}`, async () => {
	const productId = "unlimited_transform";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	await autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
		id: productId,
		name: "Unlimited Transform",
		items: [
			{
				feature_id: TestFeature.Messages,
				unlimited: true,
			},
		],
	});

	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.features[0]).toMatchObject({
		unlimited: true,
		granted_balance: 0,
	});

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items[0]).toMatchObject({ included_usage: Infinite });
});

test.concurrent(`${chalk.yellowBright("cross-version: tiered pricing transformation")}`, async () => {
	const productId = "tiered_transform";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	await autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
		id: productId,
		name: "Tiered Transform",
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					interval: BillingInterval.Month,
					billing_method: BillingMethod.UsageBased,
					billing_units: 1,
					tiers: [
						{ to: 100, amount: 10 },
						{ to: 1000, amount: 5 },
						{ to: TierInfinite, amount: 2 },
					],
				},
			},
		],
	});

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items[0].tiers).toHaveLength(3);
	expect(v1_2.items[0].tiers![2]).toMatchObject({ to: TierInfinite });
});

test.concurrent(`${chalk.yellowBright("create: tiered pricing with included usage (to INCLUDES included)")}`, async () => {
	const productId = "tiered_with_included";
	try {
		await autumnV2_1.products.delete(productId);
	} catch (_error) {}

	// User-facing API: tier `to` INCLUDES included usage.
	// included=200, tiers=[{to:700}, {to:1200}, {to:inf}]
	// Internally stored as tiers=[{to:500}, {to:1000}, {to:inf}] (without included)
	const created = await autumnV2_1.products.create<
		ApiPlanV1,
		CreatePlanParamsInput
	>({
		id: productId,
		name: "Tiered With Included",
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 200,
				price: {
					tiers: [
						{ to: 700, amount: 10 },
						{ to: 1200, amount: 5 },
						{ to: TierInfinite, amount: 2 },
					],
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
					billing_units: 100,
				},
			},
		],
	});

	// V2.1: ApiPlanV1 — tiers INCLUDE included usage
	const item = created.items[0];
	expect(item.price!.tiers).toHaveLength(3);
	expect(item.price!.tiers).toEqual([
		{ to: 700, amount: 10 },
		{ to: 1200, amount: 5 },
		{ to: TierInfinite, amount: 2 },
	]);
	expect(item.included).toBe(200);

	// V2.0: ApiPlan — tiers do NOT include included usage (subtracted in V2.1→V2.0 conversion)
	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.features[0].price!.tiers).toEqual([
		{ to: 500, amount: 10 },
		{ to: 1000, amount: 5 },
		{ to: TierInfinite, amount: 2 },
	]);
	expect(v2.features[0].granted_balance).toBe(200);

	// V1.2: ApiProduct — internal tiers do NOT include included usage
	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items[0].tiers).toHaveLength(3);
	expect(v1_2.items[0].tiers).toEqual([
		{ to: 500, amount: 10 },
		{ to: 1000, amount: 5 },
		{ to: TierInfinite, amount: 2 },
	]);
	expect(v1_2.items[0].included_usage).toBe(200);
});

test.concurrent(`${chalk.yellowBright("create: volume tiered pricing with included usage (to INCLUDES included)")}`, async () => {
	const productId = "volume_tiered_with_included";
	try {
		await autumnV2_1.products.delete(productId);
	} catch (_error) {}

	const created = await autumnV2_1.products.create<
		ApiPlanV1,
		CreatePlanParamsInput
	>({
		id: productId,
		name: "Volume Tiered With Included",
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 100,
				price: {
					tiers: [
						{ to: 600, amount: 10 },
						{ to: TierInfinite, amount: 5 },
					],
					tier_behavior: TierBehavior.VolumeBased,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
					billing_units: 100,
				},
			},
		],
	});

	// V2.1: ApiPlanV1 — tiers INCLUDE included
	const item = created.items[0];
	expect(item.price!.tiers).toEqual([
		{ to: 600, amount: 10 },
		{ to: TierInfinite, amount: 5 },
	]);
	expect(item.included).toBe(100);

	// V2.0: ApiPlan — tiers do NOT include included (subtracted in V2.1→V2.0 conversion)
	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.features[0].price!.tiers).toEqual([
		{ to: 500, amount: 10 },
		{ to: TierInfinite, amount: 5 },
	]);
	expect(v2.features[0].granted_balance).toBe(100);

	// V1.2: ApiProduct — internal tiers do NOT include included
	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items[0].tiers).toEqual([
		{ to: 500, amount: 10 },
		{ to: TierInfinite, amount: 5 },
	]);
});

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION / REJECTION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("validation: REJECT reset.interval + price.interval mismatch")}`, async () => {
	const productId = "invalid_both";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	await expectAutumnError({
		errCode: "invalid_inputs",
		func: async () => {
			await autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
				id: productId,
				name: "Invalid Both Intervals",
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 100,
						reset: { interval: ResetInterval.Minute },
						price: {
							amount: 10,
							interval: BillingInterval.Month,
							billing_method: BillingMethod.UsageBased,
							billing_units: 1,
						},
					},
				],
			});
		},
	});
});

test.concurrent(`${chalk.yellowBright("validation: ACCEPT only reset_interval (metered, no price)")}`, async () => {
	const productId = "only_reset";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	await autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
		id: productId,
		name: "Only Reset Interval",
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 100,
				reset: { interval: ResetInterval.Month },
			},
		],
	});

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items[0]).toMatchObject({
		interval: ProductItemInterval.Month,
	});
	expect(v1_2.items[0].price).toBeUndefined();
});

test.concurrent(`${chalk.yellowBright("validation: ACCEPT only price.interval (usage pricing, no reset)")}`, async () => {
	const productId = "only_price_interval";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	await autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
		id: productId,
		name: "Only Price Interval",
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					amount: 10,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.UsageBased,
					billing_units: 1,
				},
			},
		],
	});

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items[0]).toMatchObject({
		price: 10,
		interval: ProductItemInterval.Month,
	});
});
