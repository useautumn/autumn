/**
 * catalogV2.update — a mapping-only variant declaration counts as a change.
 *
 * Under a base `new_version`, a variant whose active row has customers must
 * mint its own row rather than being edited in place. The mint gate asks
 * whether the variant declared a change, but only counts `customize` — so a
 * variant carrying nothing but a Stripe mapping is skipped, never mints, and
 * the mapping lands on the row customers are attached to.
 *
 * Contract:
 *   B1  base new_version + variant declared with ONLY processors mints the
 *       variant, so its lineage keeps following the base
 *
 * The mapping itself is plan-wide (every version bills under one Stripe
 * product), so both rows carry it — what the mint buys is the row, not a
 * version-specific id.
 *
 * Red (current):  no v2 for the variant at all; the mapping only reaches v1.
 * Green (after):  v2 exists, and both versions carry the mapping.
 */

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
				// Customers on the variant's active row make it mint-worthy.
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

				// B1: the variant minted rather than being edited in place.
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
				// The mapping is plan-wide, so the older row carries it too.
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
