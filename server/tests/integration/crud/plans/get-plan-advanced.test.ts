import { expect, test } from "bun:test";
import {
	type ApiPlan,
	type ApiPlanV1,
	type ApiProduct,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsInput,
	TierBehavior,
	TierInfinite,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_1 = new AutumnInt({ version: ApiVersion.V2_1 });
const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });

const inf = TierInfinite as "inf";

// ═══════════════════════════════════════════════════════════════════════════════
// GET: TIERED PRICING WITHOUT INCLUDED
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("get: tiered pricing without included — same tiers across all versions")}`, async () => {
	const productId = "get_tiered_no_included";
	try {
		await autumnV2_1.products.delete(productId);
	} catch (_error) {}

	await autumnV2_1.products.create<ApiPlanV1, CreatePlanParamsInput>({
		id: productId,
		name: "Get Tiered No Included",
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

	const expectedTiers = [
		{ to: 100, amount: 0.1 },
		{ to: 500, amount: 0.08 },
		{ to: inf, amount: 0.05 },
	];

	// V2.1: tiers unchanged (no included to add)
	const v2_1 = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(v2_1.items[0].price!.tiers).toEqual(expectedTiers);

	// V2.0: tiers unchanged (no included to subtract)
	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.features[0].price!.tiers).toEqual(expectedTiers);

	// V1.2: tiers unchanged
	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items[0].tiers).toEqual(expectedTiers);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET: TIERED PRICING WITH INCLUDED — CROSS-VERSION TIER VALUES
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("get: graduated tiered pricing with included — V2.1 includes, V2.0/V1.2 do not")}`, async () => {
	const productId = "get_tiered_with_included";
	try {
		await autumnV2_1.products.delete(productId);
	} catch (_error) {}

	// Create via V2.1: tier `to` INCLUDES included.
	// included=200, tiers=[{to:700}, {to:1200}, {to:inf}]
	// Internally stored as [{to:500}, {to:1000}, {to:inf}]
	await autumnV2_1.products.create<ApiPlanV1, CreatePlanParamsInput>({
		id: productId,
		name: "Get Tiered With Included",
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

	// V2.1 GET: tiers INCLUDE included (200 added back)
	const v2_1 = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(v2_1.items[0].included).toBe(200);
	expect(v2_1.items[0].price!.tiers).toEqual([
		{ to: 700, amount: 10 },
		{ to: 1200, amount: 5 },
		{ to: inf, amount: 2 },
	]);

	// V2.0 GET: tiers do NOT include included
	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.features[0].granted_balance).toBe(200);
	expect(v2.features[0].price!.tiers).toEqual([
		{ to: 500, amount: 10 },
		{ to: 1000, amount: 5 },
		{ to: inf, amount: 2 },
	]);

	// V1.2 GET: tiers do NOT include included
	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items[0].included_usage).toBe(200);
	expect(v1_2.items[0].tiers).toEqual([
		{ to: 500, amount: 10 },
		{ to: 1000, amount: 5 },
		{ to: inf, amount: 2 },
	]);
});

test.concurrent(`${chalk.yellowBright("get: volume tiered pricing with included — V2.1 includes, V2.0/V1.2 do not")}`, async () => {
	const productId = "get_volume_with_included";
	try {
		await autumnV2_1.products.delete(productId);
	} catch (_error) {}

	// Create via V2.1: included=100, tiers=[{to:600}, {to:inf}]
	// Internally stored as [{to:500}, {to:inf}]
	await autumnV2_1.products.create<ApiPlanV1, CreatePlanParamsInput>({
		id: productId,
		name: "Get Volume With Included",
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

	// V2.1 GET: tiers INCLUDE included
	const v2_1 = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(v2_1.items[0].included).toBe(100);
	expect(v2_1.items[0].price!.tiers).toEqual([
		{ to: 600, amount: 10 },
		{ to: inf, amount: 5 },
	]);

	// V2.0 GET: tiers do NOT include included
	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.features[0].granted_balance).toBe(100);
	expect(v2.features[0].price!.tiers).toEqual([
		{ to: 500, amount: 10 },
		{ to: inf, amount: 5 },
	]);

	// V1.2 GET: tiers do NOT include included
	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items[0].included_usage).toBe(100);
	expect(v1_2.items[0].tiers).toEqual([
		{ to: 500, amount: 10 },
		{ to: inf, amount: 5 },
	]);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET: CREATE VIA V2.0, READ ACROSS VERSIONS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("get: create tiered via V2.0 (no included offset) — V2.1 adds included=0")}`, async () => {
	const productId = "get_v2_created_tiered";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	// Create via V2.0: tiers do NOT include included (V2.0 has no offset behavior)
	await autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
		id: productId,
		name: "V2 Created Tiered",
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					tiers: [
						{ to: 100, amount: 10 },
						{ to: 1000, amount: 5 },
						{ to: TierInfinite, amount: 2 },
					],
					interval: BillingInterval.Month,
					billing_method: BillingMethod.UsageBased,
					billing_units: 1,
				},
			},
		],
	});

	const expectedTiers = [
		{ to: 100, amount: 10 },
		{ to: 1000, amount: 5 },
		{ to: inf, amount: 2 },
	];

	// V2.1 GET: included defaults to 0, so tiers stay the same
	const v2_1 = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(v2_1.items[0].price!.tiers).toEqual(expectedTiers);

	// V2.0 GET: same tiers
	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.features[0].price!.tiers).toEqual(expectedTiers);

	// V1.2 GET: same tiers
	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items[0].tiers).toEqual(expectedTiers);
});
