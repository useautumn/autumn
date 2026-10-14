import { expect, test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	messagesItem,
	withCatalogPlans,
} from "../licenses/utils/seedLicensePlans.js";
import { seedBaseWithVariant } from "../variants/utils/seedVariantPlans.js";
import { expectVersionProcessorCorrect } from "./utils/expectPlanProcessors.js";

const IMPORTED_PRODUCT_ID = "prod_ImportedFanout";
const REPLACED_PRODUCT_ID = "prod_ImportedReplacement";

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors fanout: product id reaches every version of the plan")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_proc_fan_ver");
		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Fanout Versions",
							items: [messagesItem(100)],
						},
					],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							items: [messagesItem(200)],
							versioning: "new_version",
							active: true,
						},
					],
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							processors: { stripe: { product_id: IMPORTED_PRODUCT_ID } },
						},
					],
				});

				await expectVersionProcessorCorrect({
					ctx,
					planId,
					version: 2,
					productId: IMPORTED_PRODUCT_ID,
				});
				await expectVersionProcessorCorrect({
					ctx,
					planId,
					version: 1,
					productId: IMPORTED_PRODUCT_ID,
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							processors: { stripe: { product_id: REPLACED_PRODUCT_ID } },
						},
					],
				});
				await expectVersionProcessorCorrect({
					ctx,
					planId,
					version: 2,
					productId: REPLACED_PRODUCT_ID,
				});
				await expectVersionProcessorCorrect({
					ctx,
					planId,
					version: 1,
					productId: REPLACED_PRODUCT_ID,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors fanout: product id reaches every variant version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_proc_fan_var");
		const variantId = uniqueTestId("cv2_proc_fan_var_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: variantId,
							versioning: "new_version",
							active: true,
						},
					],
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							processors: { stripe: { product_id: IMPORTED_PRODUCT_ID } },
						},
					],
				});

				await expectVersionProcessorCorrect({
					ctx,
					planId: baseId,
					version: 1,
					productId: IMPORTED_PRODUCT_ID,
				});
				await expectVersionProcessorCorrect({
					ctx,
					planId: variantId,
					version: 2,
					productId: IMPORTED_PRODUCT_ID,
				});
				await expectVersionProcessorCorrect({
					ctx,
					planId: variantId,
					version: 1,
					productId: IMPORTED_PRODUCT_ID,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors fanout: preview reports a mapping-only change")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_proc_fan_prev");
		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Fanout Preview",
							items: [messagesItem(100)],
							processors: { stripe: { product_id: IMPORTED_PRODUCT_ID } },
						},
					],
				});

				const preview = await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							processors: { stripe: { product_id: REPLACED_PRODUCT_ID } },
						},
					],
				});

				const row = preview.plans.find(
					(plan: { plan_id: string }) => plan.plan_id === planId,
				);
				expect(row, `preview row for ${planId}`).toBeDefined();

				const previous = row?.plan_change?.previous_attributes;
				expect(previous, "previous_attributes present").toBeTruthy();
				expect(
					(previous as { processors?: { stripe?: { product_id?: string } } })
						?.processors?.stripe?.product_id,
					"previous stripe product_id",
				).toBe(IMPORTED_PRODUCT_ID);
			},
		});
	},
);
