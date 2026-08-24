/**
 * catalogV2 preview — variant + license lanes on promote match execute.
 *
 * Contract:
 *   base promote lists the follow variant at its current version (no mint)
 *   historical variant v1 stays in sibling_versions; latest follow is listed
 *   child promote: uncustomized parent unchanged (freeze); propagate follows
 */

import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../preview/utils/expectPlanPreview.js";
import {
	messagesItem,
	seedTwoParents,
	withCatalogPlans,
} from "../licenses/utils/seedLicensePlans.js";
import {
	seedBaseWithVariant,
	seedVariantNewVersion,
} from "../variants/utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote preview: follow variant is listed, no mint")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_prm_pf_fol");
		const variantId = uniqueTestId("cv2_prm_pf_fol_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, versioning: "new_version" }],
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: baseId, version_slug: "v2", active: true }],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: baseId,
					active: true,
					promotionDetails: { previous_active_version_slug: "v1" },
					variants: [{ planId: variantId, version: 1 }],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote preview: historical variant stays; latest follow is listed")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_prm_pf_hist");
		const variantId = uniqueTestId("cv2_prm_pf_hist_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await seedVariantNewVersion({ autumn: autumnV2_3, variantId });
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, versioning: "new_version" }],
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: baseId, version_slug: "v2", active: true }],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: baseId,
					active: true,
					promotionDetails: { previous_active_version_slug: "v1" },
					variants: [
						{
							planId: variantId,
							version: 2,
							siblingVersions: [{ version: 1 }],
						},
					],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote preview: license freeze is unchanged; propagate follows")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const frozenId = uniqueTestId("cv2_prm_pf_frz");
		const followId = uniqueTestId("cv2_prm_pf_folp");
		const childId = uniqueTestId("cv2_prm_pf_ch");
		await withCatalogPlans({
			ctx,
			planIds: [frozenId, followId, childId],
			run: async () => {
				await seedTwoParents({
					autumn: autumnV2_3,
					childId,
					parentIds: [frozenId, followId],
				});
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: childId, versioning: "new_version" }],
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: childId,
								version_slug: "v2",
								active: true,
								items: [messagesItem(200)],
								propagate: {
									license_parents: [
										{ plan_id: followId, versioning: "existing" },
									],
								},
							},
						],
					}),
				);

				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: childId,
						active: true,
						promotionDetails: { previous_active_version_slug: "v1" },
						licenseParents: [
							{ planId: frozenId, licenseAction: "unchanged" },
							{ planId: followId, licenseAction: "propagated" },
						],
					},
				});
			},
		});
	},
);
