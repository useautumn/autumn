/**
 * catalogV2.update — declared licenses[] field-only writes.
 *
 * Contract:
 *   customize: null clears the overlay
 *   included / prepaid_only / metadata-only (no customize)
 *   create feature + parent customize add_items that feature
 */

import { expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { deleteDbFeatures } from "../../../utils/expectCatalogFeatures.js";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../utils/expectLicenseLinkCorrect.js";
import {
	messagesItem,
	messagesOverride,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: customize: null clears overlay")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_null_p");
		const childId = uniqueTestId("cv2_lic_null_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					customize: messagesOverride(500),
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 500,
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: parentId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: null,
								},
							],
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					included: 2,
					customized: false,
					messagesAllowance: 10,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: included / prepaid_only / metadata without customize")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_meta_p");
		const childId = uniqueTestId("cv2_lic_meta_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					included: 1,
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: parentId,
							licenses: [
								{
									license_plan_id: childId,
									included: 5,
									prepaid_only: true,
									metadata: { seat_role: "admin" },
								},
							],
						},
					],
				});

				const linked = await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					included: 5,
					prepaidOnly: true,
					customized: false,
					messagesAllowance: 10,
				});
				expect(linked.planLicense.metadata).toEqual({ seat_role: "admin" });
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: same-call feature + license customize add_items")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_feat_p");
		const childId = uniqueTestId("cv2_lic_feat_c");
		const featureId = uniqueTestId("cv2_lic_feat_f");
		await deleteDbFeatures({ ctx, featureIds: [featureId] });
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					features: [
						{
							feature_id: featureId,
							name: "License Extra",
							type: FeatureType.Boolean,
						},
					],
					plans: [
						{
							plan_id: childId,
							name: "Seat",
							items: [messagesItem(10)],
						},
						{
							plan_id: parentId,
							name: "Parent",
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: { add_items: [{ feature_id: featureId }] },
								},
							],
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
					entitlements: [{ feature_id: featureId }],
				});
			},
		});
		await deleteDbFeatures({ ctx, featureIds: [featureId] });
	},
);
