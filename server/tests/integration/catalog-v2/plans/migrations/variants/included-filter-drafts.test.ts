/**
 * catalogV2.update variant drafts stamp included on remove_items (own
 * IdentityAndIncluded diff). Same from-grant still collapses with the stamp.
 *
 * Contract:
 *   follow 100→150 on base+variant both at 100 → one $or op, included: 100
 *   follow 100 vs 200 → 150 splits; each op carries its from-grant
 *   declared variant 200→300 stamps included: 200
 *   license overlay follow 100 vs 200 → 150 stamps nested included
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../utils/seedVersionableCustomer.js";
import {
	childItemOp,
	expectLicenseDraftCase,
	messagesItemDelta,
	orVersionPinnedFilter,
	parentLicenseOp,
	versionPinnedFilter,
} from "../licenses/utils/expectLicenseMigrationDrafts.js";
import {
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import {
	seedBaseVariantWithChildLicense,
	seedBaseWithVariant,
} from "../../variants/utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: follow 100→150 stamps included: 100 on the collapsed $or")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_inc_same");
		const variantId = uniqueTestId("cv2_var_inc_same_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
					variantMessages: 100,
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
							items: [messagesItem(150)],
							propagate: { variants: [{ plan_id: variantId, version: 1 }] },
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
									customize: messagesItemDelta({
										included: 150,
										fromIncluded: 100,
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
	`${chalk.yellowBright("catalogV2 variants drafts: follow 100 vs 200 → 150 stamps each from-grant")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_inc_split");
		const variantId = uniqueTestId("cv2_var_inc_split_eu");
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
				const variantFilter = versionPinnedFilter({ planId: variantId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(150)],
							propagate: { variants: [{ plan_id: variantId, version: 1 }] },
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
							filter: {
								customer: {
									plan: orVersionPinnedFilter({
										branches: [{ planId: baseId }, { planId: variantId }],
									}),
								},
							},
							operations: [
								childItemOp({
									planFilter: baseFilter,
									customize: messagesItemDelta({
										included: 150,
										fromIncluded: 100,
									}),
								}),
								childItemOp({
									planFilter: variantFilter,
									customize: messagesItemDelta({
										included: 150,
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
	`${chalk.yellowBright("catalogV2 variants drafts: declared 200→300 stamps included: 200")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_inc_dec");
		const variantId = uniqueTestId("cv2_var_inc_dec_eu");
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
	`${chalk.yellowBright("catalogV2 variants drafts: license overlay follow stamps nested included 100 vs 200")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_inc_lic");
		const variantId = uniqueTestId("cv2_var_inc_lic_eu");
		const childId = uniqueTestId("cv2_var_inc_lic_seat");
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

				const baseFilter = versionPinnedFilter({ planId: baseId });
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
										add_items: [messagesItem(150)],
									},
								},
							],
							propagate: { variants: [{ plan_id: variantId, version: 1 }] },
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
							filter: {
								customer: {
									plan: orVersionPinnedFilter({
										branches: [{ planId: baseId }, { planId: variantId }],
									}),
								},
							},
							operations: [
								parentLicenseOp({
									planFilter: baseFilter,
									childId,
									customize: messagesItemDelta({
										included: 150,
										fromIncluded: 100,
									}),
								}),
								parentLicenseOp({
									planFilter: variantFilter,
									childId,
									customize: messagesItemDelta({
										included: 150,
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
