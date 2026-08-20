/**
 * catalogV2 stripe family reuse — omit-version reuse copies from the active base.
 *
 * Contract:
 *   v2 active → new variant reuses v2 stripe product
 *   v1 forced active → new variant reuses v1 stripe product
 */

import { expect, test } from "bun:test";
import { BillingInterval, BillingMethod, type FullProduct } from "@autumn/shared";
import { forceActiveVersion } from "@tests/integration/utils/forceActiveVersion.js";
import { expectProductProcessorCorrect } from "@tests/integration/utils/expectStripePriceResources.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";

const prepaidMessagesItem = ({ amount }: { amount: number }) => ({
	feature_id: TestFeature.Messages,
	included: 0,
	price: {
		amount,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: 100,
	},
});

const getFull = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
}): Promise<FullProduct> =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

const seedPaidBaseAndV2 = async ({
	autumn,
	baseId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	baseId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: baseId,
				name: "Team",
				price: { amount: 20, interval: BillingInterval.Month },
				items: [prepaidMessagesItem({ amount: 10 })],
			},
		],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: baseId,
				versioning: "new_version",
				price: { amount: 30, interval: BillingInterval.Month },
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("version identity stripe reuse: variant with v2 active reuses v2")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_sru_ls_b");
		const variantId = uniqueTestId("cv2_sru_ls_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedPaidBaseAndV2({ autumn: autumnV2_3, baseId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [{ variant_plan_id: variantId, name: "Team EU" }],
					},
				],
			});

			const v2 = await getFull({ ctx, planId: baseId, version: 2 });
			const variant = await getFull({ ctx, planId: variantId });
			expectProductProcessorCorrect({
				product: variant,
				processorId: v2.processor?.id,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity stripe reuse: variant with v1 active reuses v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_sru_act_b");
		const variantId = uniqueTestId("cv2_sru_act_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedPaidBaseAndV2({ autumn: autumnV2_3, baseId });
			await forceActiveVersion({ ctx, planId: baseId, version: 1 });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [{ variant_plan_id: variantId, name: "Team EU" }],
					},
				],
			});

			const v1 = await getFull({ ctx, planId: baseId, version: 1 });
			const v2 = await getFull({ ctx, planId: baseId, version: 2 });
			const variant = await getFull({ ctx, planId: variantId });
			expect(v1.processor?.id).not.toBe(v2.processor?.id);
			expectProductProcessorCorrect({
				product: variant,
				processorId: v1.processor?.id,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
