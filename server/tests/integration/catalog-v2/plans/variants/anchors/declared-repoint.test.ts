/**
 * catalogV2.update — declaring a variant under a pinned base row
 * repoints that row and recomposes customize over the declaring base.
 * Two bases cannot claim the same variant row. `version` / `version_slug`
 * pick which variant row is declared; omitting both targets the active row
 * only — historical variant versions keep their content and anchor.
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
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
	`${chalk.yellowBright("catalogV2 variants: same variant declared under two base rows → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_anc_cfl");
		const variantId = uniqueTestId("cv2_var_anc_cfl_eu");
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
									variants: [{ variant_plan_id: variantId }],
								},
								{
									plan_id: baseId,
									version: 2,
									variants: [{ variant_plan_id: variantId }],
								},
							],
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: pin + omit of the same variant row under two bases → 400")}`,
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
									variants: [{ variant_plan_id: variantId }],
								},
							],
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: version_slug pins which variant row each base declares")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_anc_slug");
		const variantId = uniqueTestId("cv2_var_anc_slug_eu");
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
				await seedVariantNewVersion({
					autumn: autumnV2_3,
					variantId,
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							version_slug: "v1",
							variants: [
								{ variant_plan_id: variantId, version_slug: "v1" },
							],
						},
						{
							plan_id: baseId,
							version_slug: "v2",
							variants: [
								{ variant_plan_id: variantId, version_slug: "v2" },
							],
						},
					],
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
					baseVersion: 2,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: omit + customize on a base mint edits only the active variant row")}`,
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
