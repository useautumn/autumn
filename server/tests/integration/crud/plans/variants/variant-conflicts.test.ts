/**
 * Plan variants — preview_update conflict detection.
 *
 * A variant conflicts when the base edit changes a feature the variant holds
 * only at an interval the edit doesn't touch (different_interval): propagating
 * would insert a spurious item, so the owner should handle it separately.
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	type PlanUpdatePreview,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { readableVariantTestId } from "./utils/readableVariantTestId.js";
import { createVariantPlan } from "./utils/variantTestPlanUtils.js";

type RpcUpdate = Omit<UpdatePlanParamsV2Input, "plan_id">;

const monthlyPrice = { amount: 20, interval: BillingInterval.Month as const };

const msgMonth = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const msgYear = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Year },
});

const setupScenario = async (cid: string, baseId: string) => {
	const base = products.pro({
		id: baseId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { ctx } = await initScenario({
		customerId: cid,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [],
	});
	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	return { ctx, rpc, baseId: base.id };
};

const previewMsgMonthBump = (rpc: AutumnRpcCli, baseId: string) =>
	rpc.post("/plans.preview_update", {
		plan_id: baseId,
		items: [msgMonth(200)],
		price: monthlyPrice,
		include_variants: true,
	}) as Promise<PlanUpdatePreview>;

// ═════════════════════════════════════════════════════════════════
// 1. variant on a different interval → different_interval conflict
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("variant conflicts: variant holds Messages yearly, base edits monthly → different_interval conflict")}`,
	async () => {
		const cid = readableVariantTestId("vc_diff_interval");
		const { rpc, baseId } = await setupScenario(cid, `vc_base_${cid}`);
		const variantId = `vc_var_${cid}`;

		await createVariantPlan({
			rpc,
			basePlanId: baseId,
			variantPlanId: variantId,
			name: "Yearly",
		});
		await rpc.plans.update<ApiPlanV1, RpcUpdate>(variantId, {
			items: [msgYear(100)],
			price: monthlyPrice,
			disable_version: true,
		});

		const res = await previewMsgMonthBump(rpc, baseId);

		const variant = res.variants.find((v) => v.plan_id === variantId);
		expect(variant).toBeDefined();
		expect(variant?.conflicts).toHaveLength(1);
		expect(variant?.conflicts[0]).toMatchObject({
			reason: "different_interval",
			item_filter: { feature_id: TestFeature.Messages },
		});
	},
);

// ═════════════════════════════════════════════════════════════════
// 2. variant on the same interval → no conflict
// ═════════════════════════════════════════════════════════════════
test.concurrent(
	`${chalk.yellowBright("variant conflicts: variant shares Messages monthly interval → no conflict")}`,
	async () => {
		const cid = readableVariantTestId("vc_same_interval");
		const { rpc, baseId } = await setupScenario(cid, `vc_base_${cid}`);
		const variantId = `vc_var_${cid}`;

		await createVariantPlan({
			rpc,
			basePlanId: baseId,
			variantPlanId: variantId,
			name: "Monthly",
		});

		const res = await previewMsgMonthBump(rpc, baseId);

		const variant = res.variants.find((v) => v.plan_id === variantId);
		expect(variant).toBeDefined();
		expect(variant?.conflicts).toHaveLength(0);
	},
);
