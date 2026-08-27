/**
 * catalogV2.update — a plan's Stripe product id fans out across the whole plan.
 *
 * Every version of a plan bills under one Stripe product (a mint clones the
 * previous row's processor), so a later correction must reach the versions
 * that already exist — that is the import case.
 *
 * Contract:
 *   B2  processors on a plan reach EVERY version of that plan, unconditionally,
 *       replacing whatever id each version held
 *   B3  the fan-out reaches variants and their own version histories
 *   B4  a mapping-only change is visible in preview_update previous_attributes
 *
 * Red (current):  deriveVersionSiblingIntents bails unless all_versions /
 *   unlink / pointer-change, so only the addressed row is stamped; and
 *   previousAttributeKeys omits `processors`, so preview reports no change.
 * Green (after):  every version + variant version carries the id, and preview
 *   names the mapping change.
 */

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
				// v2 takes the pointer; v1 becomes history.
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

				// Mapping-only edit, addressing the active row.
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
				// B2: history follows the active row's mapping.
				await expectVersionProcessorCorrect({
					ctx,
					planId,
					version: 1,
					productId: IMPORTED_PRODUCT_ID,
				});

				// B2: a second mapping replaces the id on every version.
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
				// Give the variant its own history: v2 takes the pointer.
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
				// B3: the variant's active row follows the base.
				await expectVersionProcessorCorrect({
					ctx,
					planId: variantId,
					version: 2,
					productId: IMPORTED_PRODUCT_ID,
				});
				// B3: so does the variant's own history.
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

				// B4: the mapping change is named, carrying the previous id.
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
