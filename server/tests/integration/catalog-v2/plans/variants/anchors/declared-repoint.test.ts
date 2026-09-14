/**
 * catalogV2.update — declaring a variant under a pinned base row
 * repoints that row and recomposes customize over the declaring base.
 * Two bases cannot claim the same variant row. Existing rows must be identified
 * by `internal_id`, `version`, or `version_slug`; only creates are unpinned.
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	dashboardItem,
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import {
	expectVariantPlanCorrect,
	expectVariantPointerCorrect,
} from "../utils/expectVariantPointer.js";
import {
	seedBaseWithVariant,
	seedDivergedVariantBase,
	seedVariantNewVersion,
} from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: declared under pinned v2 repoints and recomposes customize")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_anc_dec");
		const variantId = uniqueTestId("cv2_var_anc_dec_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedDivergedVariantBase({ autumn: autumnV2_3, baseId });

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							version_slug: "v2",
							variants: [
								{
									variant_plan_id: variantId,
									version: 1,
									customize: { add_items: [dashboardItem()] },
								},
							],
						},
					],
				});

				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					basePlanId: baseId,
					baseVersion: 2,
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					allowances: { [TestFeature.Messages]: 50 },
					featureIds: [
						TestFeature.Messages,
						TestFeature.Words,
						TestFeature.Dashboard,
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: same pinned variant row declared under two base rows → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_anc_cflpin");
		const variantId = uniqueTestId("cv2_var_anc_cflpin_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedDivergedVariantBase({ autumn: autumnV2_3, baseId });

				await expectAutumnError({
					errCode: ErrCode.ConflictingVariantAnchor,
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: baseId,
									version: 1,
									variants: [{ variant_plan_id: variantId, version: 1 }],
								},
								{
									plan_id: baseId,
									version: 2,
									variants: [{ variant_plan_id: variantId, version: 1 }],
								},
							],
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: atmn full-state updates one of two variant versions on historical base")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("cv2_var_atmn_upd")}@autumn.test`,
					setupDefaultFeatures: true,
				}),
			],
			actions: [],
		});
		const baseId = uniqueTestId("cv2_var_atmn_upd");
		const variantId = uniqueTestId("cv2_var_atmn_upd_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedDivergedVariantBase({ autumn: autumnV2_3, baseId });
				await seedVariantNewVersion({ autumn: autumnV2_3, variantId });

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							version_slug: "v2",
							active: true,
						},
						{
							plan_id: baseId,
							version_slug: "v1",
							active: false,
							items: [messagesItem(120)],
							variants: [
								{
									variant_plan_id: variantId,
									version_slug: "v1",
									customize: {
										remove_items: [{ feature_id: TestFeature.Messages }],
										add_items: [messagesItem(220)],
									},
								},
								{
									variant_plan_id: variantId,
									version_slug: "v2",
								},
							],
						},
					],
					skip_deletions: false,
					skip_version_deletions: false,
					migration: { draft: true },
				});

				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					variantVersion: 1,
					basePlanId: baseId,
					baseVersion: 1,
				});
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					variantVersion: 2,
					basePlanId: baseId,
					baseVersion: 1,
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 1,
					allowances: { [TestFeature.Messages]: 220 },
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 2,
					allowances: { [TestFeature.Messages]: 200 },
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: atmn full-state relinks two variant versions to active base")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("cv2_var_atmn_link")}@autumn.test`,
					setupDefaultFeatures: true,
				}),
			],
			actions: [],
		});
		const baseId = uniqueTestId("cv2_var_atmn_link");
		const variantId = uniqueTestId("cv2_var_atmn_link_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedDivergedVariantBase({ autumn: autumnV2_3, baseId });
				await seedVariantNewVersion({ autumn: autumnV2_3, variantId });

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							version_slug: "v2",
							active: true,
							variants: [
								{ variant_plan_id: variantId, version_slug: "v1" },
								{ variant_plan_id: variantId, version_slug: "v2" },
							],
						},
						{
							plan_id: baseId,
							version_slug: "v1",
							active: false,
							variants: [],
						},
					],
					skip_deletions: false,
					skip_version_deletions: false,
					migration: { draft: true },
				});

				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					variantVersion: 1,
					basePlanId: baseId,
					baseVersion: 2,
				});
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					variantVersion: 2,
					basePlanId: baseId,
					baseVersion: 2,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: pinned customize on a base mint edits only the active variant row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_anc_omit");
		const variantId = uniqueTestId("cv2_var_anc_omit_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVariantNewVersion({
					autumn: autumnV2_3,
					variantId,
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							versioning: "new_version",
							active: true,
							variants: [
								{
									variant_plan_id: variantId,
									version: 2,
									customize: { add_items: [dashboardItem()] },
								},
							],
						},
					],
				});

				// Historical v1 keeps its content and its anchor on base v1.
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					variantVersion: 1,
					basePlanId: baseId,
					baseVersion: 1,
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 1,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages],
				});
				// Active v2 recomposes over the declaring base and repoints to it.
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					variantVersion: 2,
					basePlanId: baseId,
					baseVersion: 2,
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 2,
					allowances: { [TestFeature.Messages]: 100 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
			},
		});
	},
);
