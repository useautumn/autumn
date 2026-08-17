/**
 * catalogV2.preview_update — parent's versioning.options unions every child
 * variant, not only `variants[]` / `propagate.variants` on this request.
 *
 * Parent v1, no customers. Team-EU v1+v2, customers on latest.
 */
import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
import {
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import {
	seedBaseWithVariant,
	seedVariantNewVersion,
} from "../utils/seedVariantPlans.js";

const unionOptions = ["existing", "new_version", "all_versions"] as const;

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: parent preview options union all child variants (none listed)")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_opt_p");
		const variantId = uniqueTestId("cv2_var_opt_c");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVariantNewVersion({ autumn: autumnV2_3, variantId });
				await seedVersionableCustomer({
					ctx,
					planId: variantId,
					version: 2,
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: baseId,
								items: [messagesItem(150)],
							},
						],
					}),
				);

				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: baseId,
						hasCustomers: false,
						versioningOptions: [...unionOptions],
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: parent preview options do not shrink when variants[] is filled")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_opt2_p");
		const variantId = uniqueTestId("cv2_var_opt2_c");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVariantNewVersion({ autumn: autumnV2_3, variantId });
				await seedVersionableCustomer({
					ctx,
					planId: variantId,
					version: 2,
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: baseId,
								items: [messagesItem(150)],
								variants: [{ variant_plan_id: variantId }],
							},
						],
					}),
				);

				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: baseId,
						versioningOptions: [...unionOptions],
					},
				});
			},
		});
	},
);
