import { test } from "bun:test";
import {
	type ApiPlan,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsInput,
	type CreatePlanParamsV2Input,
	type CreateProductV2ParamsInput,
	type ProductItem,
	ProductItemInterval,
	TierBehavior,
	TierInfinite,
	UsageModel,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });
const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });

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

/**
 * TDD test for unsafe large finite allowances.
 *
 * Red-failure mode: a plan with more than 10 trillion included units is accepted.
 * Green-success criteria: plan creation rejects it and recommends unlimited usage.
 */
test.concurrent(
	`${chalk.yellowBright("included usage: REJECT more than 10 trillion")}`,
	async () => {
		await expectRestError({
			productId: `err_included_usage_${getSuffix()}`,
			items: [
				{ feature_id: TestFeature.Messages, included: 10_000_000_000_001 },
			],
			errMessage:
				"Included usage cannot exceed 10 trillion; use unlimited usage instead",
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// PRICE: amount OR tiers (not neither, not both)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("tier-errors REST: REJECT price with neither amount nor tiers")}`,
	async () => {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors RPC: REJECT price with neither amount nor tiers")}`,
	async () => {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors REST: REJECT price with both amount and tiers")}`,
	async () => {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors RPC: REJECT price with both amount and tiers")}`,
	async () => {
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
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// flat_amount only for volume-based pricing
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("tier-errors REST: REJECT flat_amount on graduated tiers")}`,
	async () => {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors RPC: REJECT flat_amount on graduated tiers")}`,
	async () => {
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
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// flat_amount not on single-tier
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("tier-errors REST: REJECT flat_amount on single-tier")}`,
	async () => {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors RPC: REJECT flat_amount on single-tier")}`,
	async () => {
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
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// flat_amount must be >= 0
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("tier-errors REST: REJECT negative flat_amount")}`,
	async () => {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors RPC: REJECT negative flat_amount")}`,
	async () => {
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
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// volume-based only for prepaid
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("tier-errors REST: ACCEPT volume-based with usage_based billing")}`,
	async () => {
		const id = `ok_vol_usage_${getSuffix()}`;
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
							{ to: 100, amount: 5 },
							{ to: TierInfinite, amount: 2 },
						],
						tier_behavior: TierBehavior.VolumeBased,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
					},
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors RPC: ACCEPT volume-based with usage_based billing")}`,
	async () => {
		const id = `ok_vol_usage_rpc_${getSuffix()}`;
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
							{ to: 100, amount: 5 },
							{ to: TierInfinite, amount: 2 },
						],
						tier_behavior: TierBehavior.VolumeBased,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
					},
				},
			],
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// V0 product items: volume-based on usage-based items, but never with thresholds
// ═══════════════════════════════════════════════════════════════════════════════

const VOLUME_THRESHOLD =
	"threshold_billing can't be combined with volume-based pricing";

const volumeMessagesItem = ({
	usageModel,
	price,
	tiers,
	thresholdBilling,
}: {
	usageModel: UsageModel;
	price?: number;
	tiers?: ProductItem["tiers"];
	thresholdBilling?: { threshold: number };
}): V0Item => ({
	feature_id: TestFeature.Messages,
	included_usage: 100,
	interval: ProductItemInterval.Month,
	usage_model: usageModel,
	tier_behavior: TierBehavior.VolumeBased,
	...(tiers ? { tiers } : { price }),
	...(thresholdBilling
		? { config: { threshold_billing: thresholdBilling } }
		: {}),
});

type V0Item = NonNullable<CreateProductV2ParamsInput["items"]>[number];

const createV0Product = async ({
	productId,
	items,
}: {
	productId: string;
	items: V0Item[];
}) => {
	try {
		await autumnV2.products.delete(productId);
	} catch (_e) {}

	return autumnV1_2.products.create<ApiPlan, CreateProductV2ParamsInput>({
		id: productId,
		name: `Test ${productId}`,
		items,
	});
};

test.concurrent(
	`${chalk.yellowBright("tier-errors V0 create: ACCEPT volume on pay-per-use (single tier)")}`,
	async () => {
		await createV0Product({
			productId: `ok_v0_vol_price_${getSuffix()}`,
			items: [
				volumeMessagesItem({ usageModel: UsageModel.PayPerUse, price: 0.5 }),
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors V0 create: ACCEPT volume on pay-per-use (multi tier)")}`,
	async () => {
		await createV0Product({
			productId: `ok_v0_vol_tiers_${getSuffix()}`,
			items: [
				volumeMessagesItem({
					usageModel: UsageModel.PayPerUse,
					tiers: [
						{ to: 200, amount: 1 },
						{ to: TierInfinite, amount: 0.5 },
					],
				}),
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors V0 update: ACCEPT switching pay-per-use to volume")}`,
	async () => {
		const productId = `ok_v0_vol_update_${getSuffix()}`;
		await createV0Product({
			productId,
			items: [
				{
					feature_id: TestFeature.Messages,
					included_usage: 100,
					interval: ProductItemInterval.Month,
					usage_model: UsageModel.PayPerUse,
					price: 0.5,
				},
			],
		});

		await autumnV1_2.products.update<ApiPlan>(productId, {
			items: [
				volumeMessagesItem({ usageModel: UsageModel.PayPerUse, price: 0.5 }),
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors V0 create: REJECT volume with threshold_billing (single tier)")}`,
	async () => {
		await expectAutumnError({
			errCode: "invalid_inputs",
			errMessage: VOLUME_THRESHOLD,
			func: () =>
				createV0Product({
					productId: `err_v0_vol_threshold_${getSuffix()}`,
					items: [
						volumeMessagesItem({
							usageModel: UsageModel.PayPerUse,
							price: 0.5,
							thresholdBilling: { threshold: 50 },
						}),
					],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors V0 create: REJECT pooled pay-per-use volume")}`,
	async () => {
		await expectAutumnError({
			errCode: "invalid_product_item",
			errMessage: "Pooled items cannot use usage-based pricing",
			func: () =>
				createV0Product({
					productId: `err_v0_vol_pooled_${getSuffix()}`,
					items: [
						{
							...volumeMessagesItem({
								usageModel: UsageModel.PayPerUse,
								price: 0.5,
							}),
							pooled: true,
						},
					],
				}),
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// Allocated volume: a tier-1 flat_amount needs included usage
// ═══════════════════════════════════════════════════════════════════════════════

const ALLOCATED_VOLUME_FLAT =
	"Volume-based allocated items can't have a flat_amount on the first tier without included usage";

const ALLOCATED_VOLUME_FLAT_TIERS: {
	to: number | "inf";
	amount: number;
	flat_amount?: number;
}[] = [
	{ to: 10, amount: 10, flat_amount: 5 },
	{ to: TierInfinite, amount: 8 },
];

test.concurrent(
	`${chalk.yellowBright("tier-errors V0 create: REJECT allocated volume with tier-1 flat_amount and no included")}`,
	async () => {
		await expectAutumnError({
			errCode: "invalid_inputs",
			errMessage: ALLOCATED_VOLUME_FLAT,
			func: () =>
				createV0Product({
					productId: `err_v0_alloc_flat_${getSuffix()}`,
					items: [
						{
							feature_id: TestFeature.Users,
							included_usage: 0,
							usage_model: UsageModel.PayPerUse,
							tier_behavior: TierBehavior.VolumeBased,
							interval: ProductItemInterval.Month,
							tiers: ALLOCATED_VOLUME_FLAT_TIERS,
						},
					],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors V0 create: ACCEPT allocated volume with tier-1 flat_amount and included usage")}`,
	async () => {
		await createV0Product({
			productId: `ok_v0_alloc_flat_${getSuffix()}`,
			items: [
				{
					feature_id: TestFeature.Users,
					included_usage: 3,
					usage_model: UsageModel.PayPerUse,
					tier_behavior: TierBehavior.VolumeBased,
					interval: ProductItemInterval.Month,
					tiers: ALLOCATED_VOLUME_FLAT_TIERS,
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors REST: REJECT allocated volume with tier-1 flat_amount and no included")}`,
	async () => {
		await expectRestError({
			productId: `err_alloc_flat_${getSuffix()}`,
			items: [
				{
					feature_id: TestFeature.Users,
					price: {
						tiers: ALLOCATED_VOLUME_FLAT_TIERS,
						tier_behavior: TierBehavior.VolumeBased,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
					},
				},
			],
			errMessage: ALLOCATED_VOLUME_FLAT,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors RPC: REJECT allocated volume with tier-1 flat_amount and no included")}`,
	async () => {
		await expectRpcError({
			productId: `err_alloc_flat_rpc_${getSuffix()}`,
			items: [
				{
					feature_id: TestFeature.Users,
					price: {
						tiers: ALLOCATED_VOLUME_FLAT_TIERS,
						tier_behavior: TierBehavior.VolumeBased,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
					},
				},
			],
			errMessage: ALLOCATED_VOLUME_FLAT,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// V1: threshold_billing can't be combined with volume tiers (V0 is covered by #4554)
// ═══════════════════════════════════════════════════════════════════════════════

const THRESHOLD_FLAT_ONLY =
	"threshold_billing currently requires a flat usage price";

const volumeThresholdItem: NonNullable<CreatePlanParamsInput["items"]>[number] =
	{
		feature_id: TestFeature.Messages,
		threshold_billing: { threshold: 50 },
		price: {
			tiers: [
				{ to: 100, amount: 1 },
				{ to: TierInfinite, amount: 0.5 },
			],
			tier_behavior: TierBehavior.VolumeBased,
			interval: BillingInterval.Month,
			billing_method: BillingMethod.UsageBased,
		},
	};

test.concurrent(
	`${chalk.yellowBright("tier-errors REST: REJECT threshold_billing with volume tiers")}`,
	async () => {
		await expectRestError({
			productId: `err_vol_threshold_${getSuffix()}`,
			items: [volumeThresholdItem],
			errMessage: THRESHOLD_FLAT_ONLY,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors RPC: REJECT threshold_billing with volume tiers")}`,
	async () => {
		await expectRpcError({
			productId: `err_vol_threshold_rpc_${getSuffix()}`,
			items: [volumeThresholdItem],
			errMessage: THRESHOLD_FLAT_ONLY,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// tiers[0].to must be greater than included
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("tier-errors REST: REJECT tiers[0].to <= included")}`,
	async () => {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors RPC: REJECT tiers[0].to <= included")}`,
	async () => {
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
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// ACCEPT: valid volume-based with flat_amount (positive case)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("tier-errors REST: ACCEPT valid volume-based flat_amount")}`,
	async () => {
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
	},
);

test.concurrent(
	`${chalk.yellowBright("tier-errors RPC: ACCEPT valid volume-based flat_amount")}`,
	async () => {
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
	},
);
