import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { withCatalogPlans } from "../licenses/utils/seedLicensePlans.js";
import { seedVersionableCustomer } from "../migrations/utils/seedVersionableCustomer.js";
import { expectVersionIdentityCorrect } from "../utils/expectVersionIdentity.js";
import { seedBaseWithVariant } from "../variants/utils/seedVariantPlans.js";
import { expectVersionProcessorCorrect } from "./utils/expectPlanProcessors.js";

const MAPPED_PRODUCT_ID = "prod_MappingOnlyMint";

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors mint: mapping-only variant entry mints instead of editing the live row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_proc_mom");
		const variantId = uniqueTestId("cv2_proc_mom_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							versioning: "new_version",
							variants: [
								{
									variant_plan_id: variantId,
									processors: {
										stripe: { product_id: MAPPED_PRODUCT_ID },
									},
								},
							],
						},
					],
				});

				await expectVersionIdentityCorrect({
					ctx,
					planId: variantId,
					version: 2,
				});
				await expectVersionProcessorCorrect({
					ctx,
					planId: variantId,
					version: 2,
					productId: MAPPED_PRODUCT_ID,
				});
				await expectVersionProcessorCorrect({
					ctx,
					planId: variantId,
					version: 1,
					productId: MAPPED_PRODUCT_ID,
				});
			},
		});
	},
);
