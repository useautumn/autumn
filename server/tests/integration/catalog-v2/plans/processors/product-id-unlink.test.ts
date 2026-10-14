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

const LINKED_PRODUCT_ID = "prod_UnlinkFixture";

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors unlink: null clears the mapping from every row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_proc_unlink");
		const variantId = uniqueTestId("cv2_proc_unlink_eu");
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
							plan_id: baseId,
							versioning: "new_version",
							active: true,
						},
					],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							processors: { stripe: { product_id: LINKED_PRODUCT_ID } },
						},
					],
				});
				await expectVersionProcessorCorrect({
					ctx,
					planId: baseId,
					version: 1,
					productId: LINKED_PRODUCT_ID,
				});

				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: baseId, processors: { stripe: null } }],
				});

				await expectVersionProcessorCorrect({
					ctx,
					planId: baseId,
					version: 2,
					productId: null,
				});
				await expectVersionProcessorCorrect({
					ctx,
					planId: baseId,
					version: 1,
					productId: null,
				});
				await expectVersionProcessorCorrect({
					ctx,
					planId: variantId,
					version: 1,
					productId: null,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors unlink: preview reports the cleared mapping")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_proc_unlink_prev");
		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Unlink Preview",
							items: [messagesItem(100)],
							processors: { stripe: { product_id: LINKED_PRODUCT_ID } },
						},
					],
				});

				const preview = await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, processors: { stripe: null } }],
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
				).toBe(LINKED_PRODUCT_ID);
			},
		});
	},
);
