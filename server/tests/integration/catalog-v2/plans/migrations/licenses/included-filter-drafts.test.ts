/**
 * catalogV2.update drafts stamp included on nested license remove filters
 * (licenseEffectiveMigratableCustomize).
 *
 * Contract:
 *   propagate child 100→200 → upsert_licenses remove included: 100
 *   two parents, same from-grant → one $or op still carries included: 100
 *   declared overlay 100→200 → nested included: 100
 */

import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	messagesItem,
	messagesOverride,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import { seedVersionableCustomer } from "../utils/seedVersionableCustomer.js";
import {
	expectLicenseDraftCase,
	messagesItemDelta,
	orVersionPinnedFilter,
	parentLicenseOp,
	versionPinnedFilter,
} from "./utils/expectLicenseMigrationDrafts.js";

const CATALOG_ALLOWANCE = 100;
const NEW_ALLOWANCE = 200;

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts: child 100→200 stamps included: 100 on nested remove")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_inc_c");
		const parentId = uniqueTestId("cv2_ml_inc_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, parentId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					childItems: [messagesItem(CATALOG_ALLOWANCE)],
				});
				await seedVersionableCustomer({ ctx, planId: parentId, version: 1 });

				const planFilter = versionPinnedFilter({ planId: parentId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(NEW_ALLOWANCE)],
							propagate: { license_parents: [{ plan_id: parentId }] },
							migration: { draft: true },
						},
					],
					responsePlans: [[{ plan_id: parentId, versions: [1] }]],
					expected: [
						{
							planIds: [parentId],
							omitPlanIds: [childId],
							noBillingChanges: true,
							filter: { customer: { plan: planFilter } },
							operations: [
								parentLicenseOp({
									planFilter,
									childId,
									customize: {
										remove_items: [
											{
												feature_id: TestFeature.Messages,
												interval: ResetInterval.Month,
												interval_count: 1,
												included: CATALOG_ALLOWANCE,
											},
										],
										add_items: [
											{
												feature_id: TestFeature.Messages,
												included: NEW_ALLOWANCE,
												unlimited: false,
												reset: { interval: ResetInterval.Month },
											},
										],
									},
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
	`${chalk.yellowBright("catalogV2 license-drafts: two propagate parents collapse with included: 100")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_inc_2p_c");
		const teamId = uniqueTestId("cv2_ml_inc_2p_t");
		const scaleId = uniqueTestId("cv2_ml_inc_2p_s");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId, scaleId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							name: "Seat",
							items: [messagesItem(CATALOG_ALLOWANCE)],
						},
						{
							plan_id: teamId,
							name: "Team",
							licenses: [{ license_plan_id: childId, included: 2 }],
						},
						{
							plan_id: scaleId,
							name: "Scale",
							licenses: [{ license_plan_id: childId, included: 2 }],
						},
					],
				});
				await seedVersionableCustomer({ ctx, planId: teamId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: scaleId, version: 1 });

				const planFilter = orVersionPinnedFilter({
					branches: [{ planId: teamId }, { planId: scaleId }],
				});
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(NEW_ALLOWANCE)],
							propagate: {
								license_parents: [
									{ plan_id: teamId },
									{ plan_id: scaleId },
								],
							},
							migration: { draft: true },
						},
					],
					responsePlans: [
						[
							{ plan_id: teamId, versions: [1] },
							{ plan_id: scaleId, versions: [1] },
						],
					],
					expected: [
						{
							planIds: [teamId, scaleId],
							omitPlanIds: [childId],
							noBillingChanges: true,
							filter: { customer: { plan: planFilter } },
							operations: [
								parentLicenseOp({
									planFilter,
									childId,
									customize: messagesItemDelta({
										included: NEW_ALLOWANCE,
										fromIncluded: CATALOG_ALLOWANCE,
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
	`${chalk.yellowBright("catalogV2 license-drafts: declared overlay 100→200 stamps nested included: 100")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_inc_dec_c");
		const parentId = uniqueTestId("cv2_ml_inc_dec_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, parentId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					customize: messagesOverride(CATALOG_ALLOWANCE),
				});
				await seedVersionableCustomer({ ctx, planId: parentId, version: 1 });

				const planFilter = versionPinnedFilter({ planId: parentId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: parentId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: messagesOverride(NEW_ALLOWANCE),
								},
							],
							migration: { draft: true },
						},
					],
					responsePlans: [[{ plan_id: parentId, versions: [1] }]],
					expected: [
						{
							planIds: [parentId],
							omitPlanIds: [childId],
							noBillingChanges: true,
							filter: { customer: { plan: planFilter } },
							operations: [
								parentLicenseOp({
									planFilter,
									childId,
									customize: messagesItemDelta({
										included: NEW_ALLOWANCE,
										fromIncluded: CATALOG_ALLOWANCE,
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
