import { expect, test } from "bun:test";
import {
	type ApiPlan,
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	BillingMethod,
	type CreatePlanParamsInput,
	type CreatePlanParamsV2Input,
	ErrCode,
	type ProductItem,
	TierBehavior,
	TierInfinite,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";

// Threshold billing prices each charge from zero, so any multi-tier price is mis-priced across charges.

const autumnV1_2 = new AutumnInt({ version: ApiVersion.V1_2 });
const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });
const autumnRpc = new AutumnRpcCli({ version: ApiVersion.V2_1 });

const getSuffix = () => Math.random().toString(36).slice(2, 9);

const V0_ERROR = "threshold_billing can't be combined with tiered pricing";
const V1_ERROR = "threshold_billing currently requires a flat usage price";

const multiTierConsumable = () =>
	items.tieredConsumableMessages({
		tiers: [
			{ to: 100, amount: 0.5 },
			{ to: "inf", amount: 0.25 },
		],
	});

const withThreshold = (item: ProductItem): ProductItem => ({
	...item,
	config: { ...item.config, threshold_billing: { threshold: 50 } },
});

const v1ThresholdTieredItem = ({
	tierBehavior,
}: {
	tierBehavior: TierBehavior;
}): NonNullable<CreatePlanParamsV2Input["items"]>[number] => ({
	feature_id: TestFeature.Messages,
	price: {
		tiers: [
			{ to: 100, amount: 0.5 },
			{ to: TierInfinite, amount: 0.25 },
		],
		tier_behavior: tierBehavior,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.UsageBased,
	},
	threshold_billing: { threshold: 50 },
});

// ═══════════════════════════════════════════════════════════════════════════════
// V0 product items (/products at v1.2)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("threshold-tiers V0 create: REJECT threshold_billing with multi-tier price")}`,
	async () => {
		const id = `err_thr_tiers_v0_${getSuffix()}`;
		await expectAutumnError({
			errCode: ErrCode.InvalidInputs,
			errMessage: V0_ERROR,
			func: () =>
				autumnV1_2.products.create({
					id,
					name: `Test ${id}`,
					items: [withThreshold(multiTierConsumable())],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("threshold-tiers V0 update: REJECT adding threshold_billing to multi-tier price")}`,
	async () => {
		const id = `err_thr_tiers_v0_upd_${getSuffix()}`;
		await autumnV1_2.products.create({
			id,
			name: `Test ${id}`,
			items: [multiTierConsumable()],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidInputs,
			errMessage: V0_ERROR,
			func: () =>
				autumnV1_2.products.update(id, {
					items: [withThreshold(multiTierConsumable())],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("threshold-tiers V0 create: ACCEPT threshold_billing with single-tier price")}`,
	async () => {
		const id = `ok_thr_single_v0_${getSuffix()}`;
		const item = withThreshold(
			items.tieredConsumableMessages({ tiers: [{ to: "inf", amount: 0.5 }] }),
		);

		await autumnV1_2.products.create({ id, name: `Test ${id}`, items: [item] });

		// v1.2 responses drop item config, so read threshold_billing back at v2.0.
		const plan = await autumnV2.products.get<ApiPlan>(id);
		const created = plan.features.find(
			(feature) => feature.feature_id === TestFeature.Messages,
		);
		expect(created?.threshold_billing?.threshold).toBe(50);
	},
);

test.concurrent(
	`${chalk.yellowBright("threshold-tiers V0 create: ACCEPT multi-tier price without threshold_billing")}`,
	async () => {
		const id = `ok_tiers_no_thr_v0_${getSuffix()}`;

		await autumnV1_2.products.create({
			id,
			name: `Test ${id}`,
			items: [multiTierConsumable()],
		});

		const plan = await autumnV2.products.get<ApiPlan>(id);
		const created = plan.features.find(
			(feature) => feature.feature_id === TestFeature.Messages,
		);
		expect(created?.price?.tiers).toHaveLength(2);
		expect(created?.threshold_billing ?? null).toBeNull();
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// V1 plan items (REST v2.0 and RPC v2.1)
// ═══════════════════════════════════════════════════════════════════════════════

for (const tierBehavior of [TierBehavior.Graduated, TierBehavior.VolumeBased]) {
	test.concurrent(
		`${chalk.yellowBright(`threshold-tiers REST: REJECT threshold_billing with ${tierBehavior} tiers`)}`,
		async () => {
			const id = `err_thr_tiers_rest_${getSuffix()}`;
			await expectAutumnError({
				errCode: ErrCode.InvalidInputs,
				errMessage: V1_ERROR,
				func: () =>
					autumnV2.products.create<ApiPlan, CreatePlanParamsInput>({
						id,
						name: `Test ${id}`,
						items: [v1ThresholdTieredItem({ tierBehavior })],
					}),
			});
		},
	);

	test.concurrent(
		`${chalk.yellowBright(`threshold-tiers RPC: REJECT threshold_billing with ${tierBehavior} tiers`)}`,
		async () => {
			const id = `err_thr_tiers_rpc_${getSuffix()}`;
			await expectAutumnError({
				errCode: ErrCode.InvalidInputs,
				errMessage: V1_ERROR,
				func: () =>
					autumnRpc.plans.create<ApiPlanV1, CreatePlanParamsV2Input>({
						plan_id: id,
						name: `Test ${id}`,
						group: `grp_${id}`,
						auto_enable: false,
						items: [v1ThresholdTieredItem({ tierBehavior })],
					}),
			});
		},
	);
}
