import { test } from "bun:test";
import {
	type ApiPlan,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsInput,
	type CreatePlanParamsV2Input,
	TierBehavior,
	TierInfinite,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });

const getSuffix = () => Math.random().toString(36).slice(2, 9);

/** Helper: create plan via REST (v1.2 / v2.0) and expect rejection */
const expectRestError = async ({
	productId,
	items,
	errMessage,
}: {
	productId: string;
	items: CreatePlanParamsInput["items"];
	errMessage?: string;
}) => {
	try {
		await autumnV2.products.delete(productId);
	} catch (_e) {}

	await expectAutumnError({
		errCode: "invalid_inputs",
		errMessage,
		func: async () => {
			await autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
				id: productId,
				name: `Test ${productId}`,
				items,
			});
		},
	});
};

/** Helper: create plan via RPC (v2.1) and expect rejection */
const expectRpcError = async ({
	productId,
	items,
	errMessage,
}: {
	productId: string;
	items: CreatePlanParamsV2Input["items"];
	errMessage?: string;
}) => {
	try {
		await autumnRpc.plans.delete(productId, { allVersions: true });
	} catch (_e) {}

	await expectAutumnError({
		errCode: "invalid_inputs",
		errMessage,
		func: async () => {
			await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
				plan_id: productId,
				name: `Test ${productId}`,
				group: `grp_${productId}`,
				auto_enable: false,
				items,
			});
		},
	});
};

// ═══════════════════════════════════════════════════════════════════════════════
// PRICE: amount OR tiers (not neither, not both)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("tier-errors REST: REJECT price with neither amount nor tiers")}`, async () => {
	const id = `err_neither_${getSuffix()}`;
	await expectRestError({
		productId: id,
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
				},
			},
		],
		errMessage: "either 'amount' or 'tiers' must be defined",
	});
});

test.concurrent(`${chalk.yellowBright("tier-errors RPC: REJECT price with neither amount nor tiers")}`, async () => {
	const id = `err_neither_rpc_${getSuffix()}`;
	await expectRpcError({
		productId: id,
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
				},
			},
		],
		errMessage: "either 'amount' or 'tiers' must be defined",
	});
});

test.concurrent(`${chalk.yellowBright("tier-errors REST: REJECT price with both amount and tiers")}`, async () => {
	const id = `err_both_${getSuffix()}`;
	await expectRestError({
		productId: id,
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					amount: 10,
					tiers: [
						{ to: 100, amount: 5 },
						{ to: TierInfinite, amount: 2 },
					],
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
				},
			},
		],
		errMessage: "'amount' and 'tiers' cannot both be defined",
	});
});

test.concurrent(`${chalk.yellowBright("tier-errors RPC: REJECT price with both amount and tiers")}`, async () => {
	const id = `err_both_rpc_${getSuffix()}`;
	await expectRpcError({
		productId: id,
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					amount: 10,
					tiers: [
						{ to: 100, amount: 5 },
						{ to: TierInfinite, amount: 2 },
					],
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
				},
			},
		],
		errMessage: "'amount' and 'tiers' cannot both be defined",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// flat_amount only for volume-based pricing
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("tier-errors REST: REJECT flat_amount on graduated tiers")}`, async () => {
	const id = `err_flat_grad_${getSuffix()}`;
	await expectRestError({
		productId: id,
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					tiers: [
						{ to: 100, amount: 5, flat_amount: 10 },
						{ to: TierInfinite, amount: 2 },
					],
					tier_behavior: TierBehavior.Graduated,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
				},
			},
		],
		errMessage:
			"flat_amount on tiers is only supported for volume-based pricing",
	});
});

test.concurrent(`${chalk.yellowBright("tier-errors RPC: REJECT flat_amount on graduated tiers")}`, async () => {
	const id = `err_flat_grad_rpc_${getSuffix()}`;
	await expectRpcError({
		productId: id,
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					tiers: [
						{ to: 100, amount: 5, flat_amount: 10 },
						{ to: TierInfinite, amount: 2 },
					],
					tier_behavior: TierBehavior.Graduated,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
				},
			},
		],
		errMessage:
			"flat_amount on tiers is only supported for volume-based pricing",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// flat_amount not on single-tier
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("tier-errors REST: REJECT flat_amount on single-tier")}`, async () => {
	const id = `err_flat_single_${getSuffix()}`;
	await expectRestError({
		productId: id,
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					tiers: [{ to: TierInfinite, amount: 5, flat_amount: 10 }],
					tier_behavior: TierBehavior.VolumeBased,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
				},
			},
		],
		errMessage: "flat_amount is not supported on single-tier pricing",
	});
});

test.concurrent(`${chalk.yellowBright("tier-errors RPC: REJECT flat_amount on single-tier")}`, async () => {
	const id = `err_flat_single_rpc_${getSuffix()}`;
	await expectRpcError({
		productId: id,
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					tiers: [{ to: TierInfinite, amount: 5, flat_amount: 10 }],
					tier_behavior: TierBehavior.VolumeBased,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
				},
			},
		],
		errMessage: "flat_amount is not supported on single-tier pricing",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// flat_amount must be >= 0
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("tier-errors REST: REJECT negative flat_amount")}`, async () => {
	const id = `err_flat_neg_${getSuffix()}`;
	await expectRestError({
		productId: id,
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					tiers: [
						{ to: 100, amount: 5, flat_amount: -10 },
						{ to: TierInfinite, amount: 2 },
					],
					tier_behavior: TierBehavior.VolumeBased,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
				},
			},
		],
		errMessage: "flat_amount must be 0 or greater",
	});
});

test.concurrent(`${chalk.yellowBright("tier-errors RPC: REJECT negative flat_amount")}`, async () => {
	const id = `err_flat_neg_rpc_${getSuffix()}`;
	await expectRpcError({
		productId: id,
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					tiers: [
						{ to: 100, amount: 5, flat_amount: -10 },
						{ to: TierInfinite, amount: 2 },
					],
					tier_behavior: TierBehavior.VolumeBased,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
				},
			},
		],
		errMessage: "flat_amount must be 0 or greater",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// volume-based only for prepaid
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("tier-errors REST: REJECT volume-based with usage_based billing")}`, async () => {
	const id = `err_vol_usage_${getSuffix()}`;
	await expectRestError({
		productId: id,
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					tiers: [
						{ to: 100, amount: 5 },
						{ to: TierInfinite, amount: 2 },
					],
					tier_behavior: TierBehavior.VolumeBased,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.UsageBased,
				},
			},
		],
		errMessage: "volume-based pricing is only supported for prepaid",
	});
});

test.concurrent(`${chalk.yellowBright("tier-errors RPC: REJECT volume-based with usage_based billing")}`, async () => {
	const id = `err_vol_usage_rpc_${getSuffix()}`;
	await expectRpcError({
		productId: id,
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					tiers: [
						{ to: 100, amount: 5 },
						{ to: TierInfinite, amount: 2 },
					],
					tier_behavior: TierBehavior.VolumeBased,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.UsageBased,
				},
			},
		],
		errMessage: "volume-based pricing is only supported for prepaid",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// tiers[0].to must be greater than included
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("tier-errors REST: REJECT tiers[0].to <= included")}`, async () => {
	const id = `err_tier_incl_${getSuffix()}`;
	await expectRestError({
		productId: id,
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 200,
				price: {
					tiers: [
						{ to: 100, amount: 5 },
						{ to: TierInfinite, amount: 2 },
					],
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
				},
			},
		],
		errMessage: "tiers[0].to must be greater than included",
	});
});

test.concurrent(`${chalk.yellowBright("tier-errors RPC: REJECT tiers[0].to <= included")}`, async () => {
	const id = `err_tier_incl_rpc_${getSuffix()}`;
	await expectRpcError({
		productId: id,
		items: [
			{
				feature_id: TestFeature.Messages,
				included: 200,
				price: {
					tiers: [
						{ to: 100, amount: 5 },
						{ to: TierInfinite, amount: 2 },
					],
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
				},
			},
		],
		errMessage: "tiers[0].to must be greater than included",
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACCEPT: valid volume-based with flat_amount (positive case)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("tier-errors REST: ACCEPT valid volume-based flat_amount")}`, async () => {
	const id = `ok_vol_flat_${getSuffix()}`;
	try {
		await autumnV2.products.delete(id);
	} catch (_e) {}

	await autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
		id,
		name: `Test ${id}`,
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					tiers: [
						{ to: 100, amount: 5, flat_amount: 10 },
						{ to: TierInfinite, amount: 2, flat_amount: 20 },
					],
					tier_behavior: TierBehavior.VolumeBased,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
				},
			},
		],
	});
});

test.concurrent(`${chalk.yellowBright("tier-errors RPC: ACCEPT valid volume-based flat_amount")}`, async () => {
	const id = `ok_vol_flat_rpc_${getSuffix()}`;
	try {
		await autumnRpc.plans.delete(id, { allVersions: true });
	} catch (_e) {}

	await autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
		plan_id: id,
		name: `Test ${id}`,
		group: `grp_${id}`,
		auto_enable: false,
		items: [
			{
				feature_id: TestFeature.Messages,
				price: {
					tiers: [
						{ to: 100, amount: 5, flat_amount: 10 },
						{ to: TierInfinite, amount: 2, flat_amount: 20 },
					],
					tier_behavior: TierBehavior.VolumeBased,
					interval: BillingInterval.Month,
					billing_method: BillingMethod.Prepaid,
				},
			},
		],
	});
});
