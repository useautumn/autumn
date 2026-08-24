/**
 * catalogV2.update — propagate.variants still share request-shape versioning
 * guards with license_parents. Compute ignores that field for variant width.
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	dashboardItem,
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import { seedBaseWithVariant } from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagate new_version + explicit version → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_err_nv");
		const variantId = uniqueTestId("cv2_var_err_nv_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage:
						'versioning "new_version" cannot be combined with an explicit version',
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: baseId,
									items: [messagesItem(100), dashboardItem()],
									propagate: {
										variants: [
											{
												plan_id: variantId,
												version: 1,
												versioning: "new_version", active: true,
											},
										],
									},
								},
							],
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagate all_versions + explicit version → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_err_av");
		const variantId = uniqueTestId("cv2_var_err_av_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage:
						'versioning "all_versions" cannot be combined with an explicit version',
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: baseId,
									items: [messagesItem(100), dashboardItem()],
									propagate: {
										variants: [
											{
												plan_id: variantId,
												version: 1,
												versioning: "all_versions",
											},
										],
									},
								},
							],
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagate new_version on missing plan → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_err_miss");
		const missingId = uniqueTestId("cv2_var_err_miss_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, missingId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							name: "Team",
							items: [messagesItem(100)],
						},
					],
				});
				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: 'versioning "new_version" requires an existing plan',
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: baseId,
									items: [messagesItem(100), dashboardItem()],
									propagate: {
										variants: [
											{ plan_id: missingId, versioning: "new_version", active: true },
										],
									},
								},
							],
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: migrate.draft + propagate new_version → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_err_dr");
		const variantId = uniqueTestId("cv2_var_err_dr_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage:
						'versioning "new_version" cannot be combined with migration.draft',
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: baseId,
									items: [messagesItem(100), dashboardItem()],
									propagate: {
										variants: [
											{ plan_id: variantId, versioning: "new_version", active: true },
										],
									},
									migration: { draft: true },
								},
							],
						}),
				});
			},
		});
	},
);
