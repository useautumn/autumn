/**
 * catalogV2.preview_update — base versioning.options union must not offer
 * new_version when the base row is a pinned historical version, even if a
 * variant has customers.
 *
 * has_customers on the base row stays the base's own customers.
 */

import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import {
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import { seedBaseWithVariant } from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: pinned base v1 + customered variant → no new_version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_opt_pin");
		const variantId = uniqueTestId("cv2_var_opt_pin_eu");
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
					plans: [{ plan_id: baseId, versioning: "new_version", active: true }],
				});
				await seedVersionableCustomer({
					ctx,
					planId: variantId,
					version: 1,
				});
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: baseId,
								version: 1,
								items: [messagesItem(150)],
							},
						],
					}),
				);
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: baseId,
						currentVersion: 1,
						hasCustomers: false,
						versioningOptions: ["existing", "all_versions"],
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: base has_customers stays false when only the variant has customers")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_opt_hc");
		const variantId = uniqueTestId("cv2_var_opt_hc_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVersionableCustomer({
					ctx,
					planId: variantId,
					version: 1,
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
						versioningOptions: ["existing", "new_version"],
					},
				});
			},
		});
	},
);
