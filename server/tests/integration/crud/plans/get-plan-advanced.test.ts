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

	const v2_1 = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(v2_1.items[0].price!.tiers).toEqual(expectedTiers);

	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.features[0].price!.tiers).toEqual(expectedTiers);

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items[0].tiers).toEqual(expectedTiers);
});

test.concurrent(`${chalk.yellowBright("get: graduated tiered pricing with included — V2.1 includes, V2.0/V1.2 do not")}`, async () => {
	const productId = "get_tiered_with_included";
	try {
		await autumnV2_1.products.delete(productId);
	} catch (_error) {}

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

	const v2_1 = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(v2_1.items[0].included).toBe(200);
	expect(v2_1.items[0].price!.tiers).toEqual([
		{ to: 700, amount: 10 },
		{ to: 1200, amount: 5 },
		{ to: inf, amount: 2 },
	]);

	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.features[0].granted_balance).toBe(200);
	expect(v2.features[0].price!.tiers).toEqual([
		{ to: 500, amount: 10 },
		{ to: 1000, amount: 5 },
		{ to: inf, amount: 2 },
	]);

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

	const v2_1 = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(v2_1.items[0].included).toBe(100);
	expect(v2_1.items[0].price!.tiers).toEqual([
		{ to: 600, amount: 10 },
		{ to: inf, amount: 5 },
	]);

	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.features[0].granted_balance).toBe(100);
	expect(v2.features[0].price!.tiers).toEqual([
		{ to: 500, amount: 10 },
		{ to: inf, amount: 5 },
	]);

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items[0].included_usage).toBe(100);
	expect(v1_2.items[0].tiers).toEqual([
		{ to: 500, amount: 10 },
		{ to: inf, amount: 5 },
	]);
});

test.concurrent(`${chalk.yellowBright("get: create tiered via V2.0 (no included offset) — V2.1 adds included=0")}`, async () => {
	const productId = "get_v2_created_tiered";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

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

	const v2_1 = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(v2_1.items[0].price!.tiers).toEqual(expectedTiers);

	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.features[0].price!.tiers).toEqual(expectedTiers);

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.items[0].tiers).toEqual(expectedTiers);
});

test.concurrent(`${chalk.yellowBright("get plan config: defaults to ignore_past_due=false on create — visible across versions")}`, async () => {
	const productId = "get_plan_config_default";
	try {
		await autumnV2_1.products.delete(productId);
	} catch (_error) {}

	await autumnV2_1.products.create<ApiPlanV1, CreatePlanParamsInput>({
		id: productId,
		name: "Get Plan Config Default",
	});

	const v2_1 = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(v2_1.config).toBeDefined();
	expect(v2_1.config.ignore_past_due).toBe(false);

	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.id).toBe(productId);

	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.id).toBe(productId);
});

test.concurrent(`${chalk.yellowBright("get plan config: V2.1 create with ignore_past_due=true persists across versions")}`, async () => {
	const productId = "get_plan_config_v2_1_true";
	try {
		await autumnV2_1.products.delete(productId);
	} catch (_error) {}

	await autumnV2_1.products.create<ApiPlanV1, CreatePlanParamsInput>({
		id: productId,
		name: "Get Plan Config V2.1 True",
		config: { ignore_past_due: true },
	});

	const v2_1 = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(v2_1.config.ignore_past_due).toBe(true);

	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.id).toBe(productId);
	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.id).toBe(productId);

	const v2_1Again = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(v2_1Again.config.ignore_past_due).toBe(true);
});

test.concurrent(`${chalk.yellowBright("get plan config: V2.0 create with ignore_past_due=true is visible via V2.1")}`, async () => {
	const productId = "get_plan_config_v2_0_true";
	try {
		await autumnV2.products.delete(productId);
	} catch (_error) {}

	await autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
		id: productId,
		name: "Get Plan Config V2.0 True",
		config: { ignore_past_due: true },
	});

	const v2_1 = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(v2_1.config.ignore_past_due).toBe(true);
});

test.concurrent(`${chalk.yellowBright("get plan config: V2.1 update flips ignore_past_due — older readers still succeed")}`, async () => {
	const productId = "get_plan_config_update_flip";
	try {
		await autumnV2_1.products.delete(productId);
	} catch (_error) {}

	await autumnV2_1.products.create<ApiPlanV1, CreatePlanParamsInput>({
		id: productId,
		name: "Get Plan Config Update Flip",
	});

	const before = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(before.config.ignore_past_due).toBe(false);

	await autumnV2_1.products.update<ApiPlanV1, Partial<CreatePlanParamsInput>>(
		productId,
		{ config: { ignore_past_due: true } },
	);

	const after = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(after.config.ignore_past_due).toBe(true);

	const v2 = await autumnV2.products.get<ApiPlan>(productId);
	expect(v2.id).toBe(productId);
	const v1_2 = await autumnV1_2.products.get<ApiProduct>(productId);
	expect(v1_2.id).toBe(productId);
});

test.concurrent(`${chalk.yellowBright("get plan config: V2.1 update flips ignore_past_due true → false")}`, async () => {
	const productId = "get_plan_config_update_off";
	try {
		await autumnV2_1.products.delete(productId);
	} catch (_error) {}

	await autumnV2_1.products.create<ApiPlanV1, CreatePlanParamsInput>({
		id: productId,
		name: "Get Plan Config Update Off",
		config: { ignore_past_due: true },
	});

	const before = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(before.config.ignore_past_due).toBe(true);

	await autumnV2_1.products.update<ApiPlanV1, Partial<CreatePlanParamsInput>>(
		productId,
		{ config: { ignore_past_due: false } },
	);

	const after = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(after.config.ignore_past_due).toBe(false);
});

test.concurrent(`${chalk.yellowBright("get plan config: partial update via V2.0 (no config) preserves ignore_past_due")}`, async () => {
	const productId = "get_plan_config_partial_update";
	try {
		await autumnV2_1.products.delete(productId);
	} catch (_error) {}

	await autumnV2_1.products.create<ApiPlanV1, CreatePlanParamsInput>({
		id: productId,
		name: "Get Plan Config Partial Original",
		config: { ignore_past_due: true },
	});

	await autumnV2.products.update<ApiPlan, { name: string }>(productId, {
		name: "Get Plan Config Partial Renamed",
	});

	const v2_1 = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(v2_1.name).toBe("Get Plan Config Partial Renamed");
	expect(v2_1.config.ignore_past_due).toBe(true);
});

test.concurrent(`${chalk.yellowBright("get plan config: omitting config in V2.1 update does not reset it")}`, async () => {
	const productId = "get_plan_config_omit_update";
	try {
		await autumnV2_1.products.delete(productId);
	} catch (_error) {}

	await autumnV2_1.products.create<ApiPlanV1, CreatePlanParamsInput>({
		id: productId,
		name: "Get Plan Config Persist",
		config: { ignore_past_due: true },
	});

	await autumnV2_1.products.update<ApiPlanV1, Partial<CreatePlanParamsInput>>(
		productId,
		{ name: "Get Plan Config Persist Renamed" },
	);

	const after = await autumnV2_1.products.get<ApiPlanV1>(productId);
	expect(after.name).toBe("Get Plan Config Persist Renamed");
	expect(after.config.ignore_past_due).toBe(true);
});
