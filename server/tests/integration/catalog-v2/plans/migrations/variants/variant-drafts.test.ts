/**
 * catalogV2.update — migration drafts for following variants.
 *
 * Contract:
 *   propagated items + customers on both → one draft, collapsed op
 *   pin → no variant op
 *   variants[] declare inherits the parent's migration.draft
 *   license DIFF → variant op is upsert_licenses (customer delta only —
 *     existing overlay items must not remint)
 *   follow EU / pin UK → UK omitted
 *   follow with no customers on the variant → no variant op
 *   versioning + conflicts → versioning-drafts / conflict-drafts
 *
 * Red (pre-fix): variant license draft reminted Messages when only Dashboard changed
 * Green (after):   draft customize is Dashboard-only, matching preview plan_change
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../utils/seedVersionableCustomer.js";
import {
	childItemOp,
	dashboardAddCustomize,
	dashboardRemoveCustomize,
	expectLicenseDraftCase,
	messagesItemDelta,
	orVersionPinnedFilter,
	parentLicenseOp,
	versionPinnedFilter,
} from "../licenses/utils/expectLicenseMigrationDrafts.js";
import {
	dashboardItem,
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import {
	seedBaseVariantWithChildLicense,
	seedBaseWithTwoVariants,
	seedBaseWithVariant,
} from "../../variants/utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: propagated items + customers → two ops")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_items");
		const variantId = uniqueTestId("cv2_var_dr_items_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				const planFilter = orVersionPinnedFilter({
					branches: [{ planId: baseId }, { planId: variantId }],
				});
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							propagate: { variants: [{ plan_id: variantId }] },
							migration: { draft: true },
						},
					],
					responsePlans: [
						[
							{ plan_id: baseId, versions: [1] },
							{ plan_id: variantId, versions: [1] },
						],
					],
					expected: [
						{
							planIds: [baseId, variantId],
							noBillingChanges: true,
							filter: { customer: { plan: planFilter } },
							operations: [
								childItemOp({
									planFilter,
									customize: dashboardAddCustomize,
								}),
							],
						},
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: pin omits the variant op")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_pin");
		const variantId = uniqueTestId("cv2_var_dr_pin_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				const baseFilter = versionPinnedFilter({ planId: baseId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							migration: { draft: true },
						},
					],
					responsePlans: [[{ plan_id: baseId, versions: [1] }]],
					expected: [
						{
							planIds: [baseId],
							omitPlanIds: [variantId],
							noBillingChanges: true,
							filter: { customer: { plan: baseFilter } },
							operations: [
								childItemOp({
									planFilter: baseFilter,
									customize: dashboardAddCustomize,
								}),
							],
						},
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: declared customize inherits parent migration.draft")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_dec");
		const variantId = uniqueTestId("cv2_var_dr_dec_eu");
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

				const variantFilter = versionPinnedFilter({ planId: variantId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: baseId,
							variants: [
								{
									variant_plan_id: variantId,
									customize: {
										remove_items: [{ feature_id: TestFeature.Messages }],
										add_items: [messagesItem(300)],
									},
								},
							],
							migration: { draft: true },
						},
					],
					responsePlans: [[{ plan_id: variantId, versions: [1] }]],
					expected: [
						{
							planIds: [variantId],
							omitPlanIds: [baseId],
							noBillingChanges: true,
							filter: { customer: { plan: variantFilter } },
							operations: [
								childItemOp({
									planFilter: variantFilter,
									customize: messagesItemDelta({
										included: 300,
										fromIncluded: 200,
									}),
								}),
							],
						},
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: license add Dashboard does not remint Messages")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_lic");
		const variantId = uniqueTestId("cv2_var_dr_lic_eu");
		const childId = uniqueTestId("cv2_var_dr_lic_seat");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, childId],
			run: async () => {
				await seedBaseVariantWithChildLicense({
					autumn: autumnV2_3,
					baseId,
					variantId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				const planFilter = orVersionPinnedFilter({
					branches: [{ planId: baseId }, { planId: variantId }],
				});
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: baseId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: {
										remove_items: [{ feature_id: TestFeature.Messages }],
										add_items: [messagesItem(100), dashboardItem()],
									},
								},
							],
							propagate: { variants: [{ plan_id: variantId }] },
							migration: { draft: true },
						},
					],
					responsePlans: [
						[
							{ plan_id: baseId, versions: [1] },
							{ plan_id: variantId, versions: [1] },
						],
					],
					expected: [
						{
							planIds: [baseId, variantId],
							omitPlanIds: [childId],
							noBillingChanges: true,
							filter: { customer: { plan: planFilter } },
							operations: [
								parentLicenseOp({
									planFilter,
									childId,
									customize: dashboardAddCustomize,
								}),
							],
						},
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: license remove Dashboard does not remint Messages")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_lic_rm");
		const variantId = uniqueTestId("cv2_var_dr_lic_rm_eu");
		const childId = uniqueTestId("cv2_var_dr_lic_rm_seat");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, childId],
			run: async () => {
				await seedBaseVariantWithChildLicense({
					autumn: autumnV2_3,
					baseId,
					variantId,
					childId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: {
										remove_items: [{ feature_id: TestFeature.Messages }],
										add_items: [messagesItem(100), dashboardItem()],
									},
								},
							],
						},
						{
							plan_id: variantId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: {
										remove_items: [{ feature_id: TestFeature.Messages }],
										add_items: [messagesItem(200), dashboardItem()],
									},
								},
							],
						},
					],
				});
				// Only the variant has customers — assert its draft alone so we
				// don't flake on $or collapse timing with the base.
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				const variantFilter = versionPinnedFilter({ planId: variantId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: baseId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: {
										remove_items: [{ feature_id: TestFeature.Messages }],
										add_items: [messagesItem(100)],
									},
								},
							],
							propagate: { variants: [{ plan_id: variantId }] },
							migration: { draft: true },
						},
					],
					responsePlans: [[{ plan_id: variantId, versions: [1] }]],
					expected: [
						{
							planIds: [variantId],
							omitPlanIds: [baseId, childId],
							noBillingChanges: true,
							filter: { customer: { plan: variantFilter } },
							operations: [
								parentLicenseOp({
									planFilter: variantFilter,
									childId,
									customize: dashboardRemoveCustomize,
								}),
							],
						},
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: follow EU / pin UK omits UK")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_concat");
		const euId = uniqueTestId("cv2_var_dr_concat_eu");
		const ukId = uniqueTestId("cv2_var_dr_concat_uk");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, euId, ukId],
			run: async () => {
				await seedBaseWithTwoVariants({
					autumn: autumnV2_3,
					baseId,
					variantIds: [euId, ukId],
				});
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: euId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: ukId, version: 1 });

				const planFilter = orVersionPinnedFilter({
					branches: [{ planId: baseId }, { planId: euId }],
				});
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							propagate: { variants: [{ plan_id: euId }] },
							migration: { draft: true },
						},
					],
					responsePlans: [
						[
							{ plan_id: baseId, versions: [1] },
							{ plan_id: euId, versions: [1] },
						],
					],
					expected: [
						{
							planIds: [baseId, euId],
							omitPlanIds: [ukId],
							noBillingChanges: true,
							filter: { customer: { plan: planFilter } },
							operations: [
								childItemOp({
									planFilter,
									customize: dashboardAddCustomize,
								}),
							],
						},
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: follow with no customers on the variant omits it")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_nocust");
		const variantId = uniqueTestId("cv2_var_dr_nocust_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });

				const baseFilter = versionPinnedFilter({ planId: baseId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							propagate: { variants: [{ plan_id: variantId }] },
							migration: { draft: true },
						},
					],
					responsePlans: [[{ plan_id: baseId, versions: [1] }]],
					expected: [
						{
							planIds: [baseId],
							omitPlanIds: [variantId],
							noBillingChanges: true,
							filter: { customer: { plan: baseFilter } },
							operations: [
								childItemOp({
									planFilter: baseFilter,
									customize: dashboardAddCustomize,
								}),
							],
						},
					],
				});
			},
		});
	},
);
