/**
 * catalogV2.update — propagate.variants target guards.
 * existing/all_versions targets may pin; unpinned ones follow the anchored row.
 * Off-anchor / missing plan → InvalidPropagationTarget. Under new_version:
 * pins 400, duplicate plan_ids 400, resolved row older than the plan's latest
 * with customers 400. Latest-but-inactive with customers mints.
 */

import { expect, test } from "bun:test";
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
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
import {
	seedBaseWithVariant,
	seedDivergedVariantBase,
	seedVariantNewVersion,
} from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagate target without a pin follows the row anchored to the edited base")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_err_pin");
		const variantId = uniqueTestId("cv2_var_err_pin_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				// A config pins nothing: the server resolves the variant row anchored
				// to the edited base and propagates the in-place edit to it.
				const preview = (await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				})) as unknown as {
					plans: {
						plan_id: string;
						variants?: { plan_id: string; variant_action?: string }[];
					}[];
				};
				const variant = preview.plans
					.find((row) => row.plan_id === baseId)
					?.variants?.find((row) => row.plan_id === variantId);
				expect(variant?.variant_action).toBe("propagated");
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: off-anchor variant pin → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_err_off");
		const variantId = uniqueTestId("cv2_var_err_off_eu");
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
					errCode: ErrCode.InvalidPropagationTarget,
					errMessage: "is not anchored to an edited row",
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: baseId,
									items: [messagesItem(50), dashboardItem()],
									propagate: {
										variants: [{ plan_id: variantId, version: 1 }],
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
	`${chalk.yellowBright("catalogV2 variants: pin a missing variant → 400")}`,
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
					errCode: ErrCode.InvalidPropagationTarget,
					errMessage: `Invalid propagation target: ${missingId}`,
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: baseId,
									items: [messagesItem(100), dashboardItem()],
									propagate: {
										variants: [{ plan_id: missingId, version: 1 }],
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
	`${chalk.yellowBright("catalogV2 variants: new_version rejects pinned and duplicate propagate targets")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_err_nvpin");
		const variantId = uniqueTestId("cv2_var_err_nvpin_eu");
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
					errMessage: "cannot pin a version when versioning is new_version",
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: baseId,
									items: [messagesItem(100), dashboardItem()],
									versioning: "new_version",
									active: true,
									propagate: {
										variants: [{ plan_id: variantId, version: 1 }],
									},
								},
							],
						}),
				});
				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: `Duplicate propagate target ${variantId}`,
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: baseId,
									items: [messagesItem(100), dashboardItem()],
									versioning: "new_version",
									active: true,
									propagate: {
										variants: [{ plan_id: variantId }, { plan_id: variantId }],
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
	`${chalk.yellowBright("catalogV2 variants: new_version target with no row anchored to the edited base → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_err_noanc");
		const variantId = uniqueTestId("cv2_var_err_noanc_eu");
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
					errCode: ErrCode.InvalidPropagationTarget,
					errMessage: `Invalid propagation target: ${variantId}`,
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: baseId,
									items: [messagesItem(50), dashboardItem()],
									versioning: "new_version",
									active: true,
									propagate: { variants: [{ plan_id: variantId }] },
								},
							],
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: new_version target resolving to a customered historical row → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_err_hist");
		const variantId = uniqueTestId("cv2_var_err_hist_eu");
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
				await seedDivergedVariantBase({ autumn: autumnV2_3, baseId });
				// EU v1 repoints to base v2; active EU v2 stays anchored to base v1.
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							version: 2,
							variants: [{ variant_plan_id: variantId, version: 1 }],
						},
					],
				});
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });
				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: "historical version has customers",
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: baseId,
									items: [messagesItem(100), dashboardItem()],
									versioning: "new_version",
									active: true,
									propagate: {
										variants: [{ plan_id: variantId }],
									},
								},
							],
						}),
				});
			},
		});
	},
);
