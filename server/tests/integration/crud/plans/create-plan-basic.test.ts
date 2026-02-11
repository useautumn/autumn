import { expect, test } from "bun:test";
import {
	type ApiPlan,
	type ApiProduct,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsInput,
	FreeTrialDuration,
	OnDecrease,
	OnIncrease,
	ProductItemInterval,
	ResetInterval,
	RolloverExpiryDurationType,
	TierInfinite,
	UsageModel,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });

// ═══════════════════════════════════════════════════════════════════════════════
// BASIC CREATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("create: minimal plan (id + name only)")}`, async () => {
	const productId = "min_plan";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {
		console.error(_error);
	}

	const created = await autumnV2.products.create<
		ApiPlan,
		CreatePlanParamsInput
	>({
		id: productId,
		name: "Minimal Plan",
	});

	expect(created.id).toBe(productId);
	expect(created.features).toHaveLength(0);

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items).toHaveLength(0);
	expect(v1_2.is_add_on).toBe(false);
});

test.concurrent(`${chalk.yellowBright("create: with description field")}`, async () => {
	const productId = "with_desc";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	const created = await autumnV2.products.create<
		ApiPlan,
		CreatePlanParamsInput
	>({
		id: productId,
		name: "With Description",
		description: "Test description for V2",
	});

	expect(created.description).toBe("Test description for V2");

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	// @ts-expect-error: Descriptions aren't in the type, but we're just double checking the response.
	expect(v1_2.description).toBeUndefined();
});

// ═══════════════════════════════════════════════════════════════════════════════
// BOOLEAN FEATURE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("create: boolean feature")}`, async () => {
	const productId = "bool_plan";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	const created = await autumnV2.products.create<
		ApiPlan,
		CreatePlanParamsInput
	>({
		id: productId,
		name: "Boolean Plan",
		items: [{ feature_id: TestFeature.Dashboard }],
	});

	expect(created.features).toHaveLength(1);
	expect(created.features[0].feature_id).toBe(TestFeature.Dashboard);

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items).toHaveLength(1);
	expect(v1_2.items[0]).toMatchObject({
		feature_id: TestFeature.Dashboard,
		included_usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// FLAGS TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("create: add_on and auto_enable flags")}`, async () => {
	const productId = "flags_test";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	const created = await autumnV2.products.create<
		ApiPlan,
		CreatePlanParamsInput
	>({
		id: productId,
		name: "Flags Test",
		add_on: true,
		auto_enable: false,
	});

	expect(created.add_on).toBe(true);
	expect(created.default).toBe(false);

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.is_add_on).toBe(true);
	expect(v1_2.is_default).toBe(false);
});

// ═══════════════════════════════════════════════════════════════════════════════
// BASE PRICING TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("create: monthly base price")}`, async () => {
	const productId = "monthly_base";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	const created = await autumnV2.products.create<
		ApiPlan,
		CreatePlanParamsInput
	>({
		id: productId,
		name: "Monthly Base",
		price: { amount: 2900, interval: BillingInterval.Month },
	});

	expect(created.price!.amount).toBe(2900);
	expect(created.price!.interval).toBe(BillingInterval.Month);

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	const basePrice = v1_2.items.find((i) => !i.feature_id);
	expect(basePrice!.price).toBe(2900);
	expect(basePrice!.interval).toBe(ProductItemInterval.Month);
});

test.concurrent(`${chalk.yellowBright("create: yearly base price")}`, async () => {
	const productId = "yearly_base";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	const created = await autumnV2.products.create<
		ApiPlan,
		CreatePlanParamsInput
	>({
		id: productId,
		name: "Yearly Base",
		price: { amount: 29900, interval: BillingInterval.Year },
	});

	expect(created.price!.amount).toBe(29900);
	expect(created.price!.interval).toBe(BillingInterval.Year);

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	const basePrice = v1_2.items[0];
	expect(basePrice.price).toBe(29900);
	expect(basePrice.interval).toBe(ProductItemInterval.Year);
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLEX REAL-WORLD SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("create: full SaaS plan with multiple feature types")}`, async () => {
	const productId = "saas_complete";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	await autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
		id: productId,
		name: "SaaS Complete",
		description: "Full-featured SaaS plan",
		price: { amount: 9900, interval: BillingInterval.Month },
		items: [
			{ feature_id: TestFeature.Dashboard },
			{
				feature_id: TestFeature.Messages,
				included: 10000,
				reset: { interval: ResetInterval.Month },
				rollover: {
					max: 20000,
					expiry_duration_type: RolloverExpiryDurationType.Month,
					expiry_duration_length: 1,
				},
			},
			{
				feature_id: TestFeature.Users,
				included: 10,
				reset: { interval: ResetInterval.Month },
				proration: {
					on_increase: OnIncrease.ProrateImmediately,
					on_decrease: OnDecrease.Prorate,
				},
			},
		],
		free_trial: {
			duration_type: FreeTrialDuration.Day,
			duration_length: 14,
			card_required: false,
		},
	});

	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.features).toHaveLength(3);
	expect(v2.free_trial).toBeDefined();
	expect(v2.description).toBe("Full-featured SaaS plan");

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items).toHaveLength(4); // 1 base price + 3 features
	expect(v1_2.free_trial).toBeDefined();
});

test.concurrent(`${chalk.yellowBright("create: usage-only product (no base price)")}`, async () => {
	const productId = "usage_only";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	await autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
		id: productId,
		name: "Usage Only",
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					interval: BillingInterval.Month,
					billing_method: BillingMethod.UsageBased,
					billing_units: 1,
					tiers: [
						{ to: 1000, amount: 5 },
						{ to: TierInfinite, amount: 2 },
					],
				},
			},
		],
	});

	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.price).toBeNull();

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items).toHaveLength(1);
});

test.concurrent(`${chalk.yellowBright("create: metered feature with rollover")}`, async () => {
	const productId = "with_rollover";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	await autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
		id: productId,
		name: "With Rollover",
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 1000,
				reset: { interval: ResetInterval.Month },
				rollover: {
					max: 2000,
					expiry_duration_type: RolloverExpiryDurationType.Month,
					expiry_duration_length: 1,
				},
			},
		],
	});

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	const item = v1_2.items[0];
	expect(item.config).toBeDefined();
	expect(item.config!.rollover).toBeDefined();
	expect(item.config!.rollover!.max).toBe(2000);
	expect(item.config!.rollover!.duration).toBe(
		RolloverExpiryDurationType.Month,
	);
	expect(item.config!.rollover!.length).toBe(1);
});

test.concurrent(`${chalk.yellowBright("create: enterprise plan with all features")}`, async () => {
	const productId = "enterprise_complete";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	await autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
		id: productId,
		name: "Enterprise Complete",
		description: "Full-featured enterprise plan with all capabilities",
		group: "",
		add_on: false,
		auto_enable: false,
		price: { amount: 49900, interval: BillingInterval.Month },
		items: [
			{ feature_id: TestFeature.Dashboard },
			{
				feature_id: TestFeature.Messages,
				included: 100000,
				price: {
					interval: BillingInterval.Month,
					billing_method: BillingMethod.UsageBased,
					billing_units: 1000,
					tiers: [
						{ to: 100000, amount: 10 },
						{ to: 500000, amount: 50 },
						{ to: 1000000, amount: 40 },
						{ to: TierInfinite, amount: 30 },
					],
				},
			},
			{
				feature_id: TestFeature.Users,
				included: 50,
				price: {
					amount: 20,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.UsageBased,
					billing_units: 1,
				},
				proration: {
					on_increase: OnIncrease.ProrateImmediately,
					on_decrease: OnDecrease.Prorate,
				},
			},
		],
		free_trial: {
			duration_type: FreeTrialDuration.Day,
			duration_length: 30,
			card_required: true,
		},
	});

	// V2 validation
	const v2 = await autumnV2.products.get<ApiPlan>(productId);

	expect(v2).toMatchObject({
		price: { amount: 49900 },
		description: "Full-featured enterprise plan with all capabilities",
		free_trial: { duration_length: 30 },
	});
	expect(v2.features).toHaveLength(3);

	// Boolean feature
	expect(v2.features).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ feature_id: TestFeature.Dashboard }),
		]),
	);

	// Metered feature
	const meteredFeature = v2.features.find(
		(f) => f.feature_id === TestFeature.Messages,
	);
	expect(meteredFeature).toMatchObject({
		granted_balance: 100000,
		price: { billing_units: 1000 },
	});
	expect(meteredFeature!.price!.tiers).toHaveLength(4);

	// Seats feature
	const seatsFeature = v2.features.find(
		(f) => f.feature_id === TestFeature.Users,
	);
	expect(seatsFeature).toMatchObject({
		granted_balance: 50,
		price: expect.objectContaining({
			amount: 20,
			interval: BillingInterval.Month,
			usage_model: UsageModel.PayPerUse,
			max_purchase: null,
			// interval_count: 1,
			// billing_method: BillingMethod.UsageBased,
		}),
		// proration: {
		// 	on_increase: OnIncrease.ProrateImmediately,
		// 	on_decrease: OnDecrease.ProrateImmediately,
		// },
	});

	// V1.2 validation
	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items).toHaveLength(4); // 1 base price + 3 features
	expect(v1_2.free_trial).toMatchObject({ length: 30 });

	const basePriceItem = v1_2.items.find((i) => !i.feature_id);
	expect(basePriceItem).toMatchObject({
		price: 49900,
		interval: ProductItemInterval.Month,
	});

	const meteredItem = v1_2.items.find(
		(i) => i.feature_id === TestFeature.Messages,
	);
	expect(meteredItem!.tiers).toHaveLength(4);
	expect(meteredItem!.tiers![0]).toMatchObject({ to: 100000, amount: 10 });

	const seatsItem = v1_2.items.find((i) => i.feature_id === TestFeature.Users);
	expect(seatsItem).toMatchObject({
		price: 20,
		// config: {
		// 	on_increase: OnIncrease.ProrateImmediately,
		// 	on_decrease: OnDecrease.ProrateImmediately,
		// },
	});
});
