/**
 * catalogV2.update — licenses[] PUT is exclusive. Listing the parent in
 * propagate.license_parents must not leak follow or resurrect a cleared link.
 */
import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectLicenseLinkCorrect,
	expectLicenseLinkMissing,
	expectPlanMessagesAllowance,
} from "../utils/expectLicenseLinkCorrect.js";
import {
	getFullPlan,
	messagesItem,
	messagesOverride,
	seedLinkedChildParent,
	seedParentWithTwoChildren,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

const declaredThreeHundred = ({
	childId,
}: {
	childId: string;
}) => ({
	license_plan_id: childId,
	included: 2,
	customize: messagesOverride(300),
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: declared customize beats propagate on the same parent")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_mexcl_p");
		const childId = uniqueTestId("cv2_lic_mexcl_c");
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
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							propagate: { license_parents: [{ plan_id: parentId }] },
						},
						{
							plan_id: parentId,
							licenses: [declaredThreeHundred({ childId })],
						},
					],
				});

				await expectPlanMessagesAllowance({
					ctx,
					planId: childId,
					allowance: 200,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 300,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: licenses: [] + propagate does not resurrect")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_mclr_p");
		const childId = uniqueTestId("cv2_lic_mclr_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							propagate: { license_parents: [{ plan_id: parentId }] },
						},
						{ plan_id: parentId, licenses: [] },
					],
				});

				await expectLicenseLinkMissing({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: PUT dropping Pack ignores Pack propagate")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_mdrop_p");
		const seatId = uniqueTestId("cv2_lic_mdrop_s");
		const packId = uniqueTestId("cv2_lic_mdrop_k");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, seatId, packId],
			run: async () => {
				await seedParentWithTwoChildren({
					autumn: autumnV2_3,
					parentId,
					childIds: [seatId, packId],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: seatId, items: [messagesItem(200)] },
						{
							plan_id: packId,
							items: [messagesItem(200)],
							propagate: { license_parents: [{ plan_id: parentId }] },
						},
						{
							plan_id: parentId,
							licenses: [{ license_plan_id: seatId, included: 2 }],
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: seatId,
					customized: false,
					messagesAllowance: 200,
				});
				await expectLicenseLinkMissing({
					ctx,
					parentPlanId: parentId,
					licensePlanId: packId,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: declared re-link without customize follows projected child")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_mrel_p");
		const childId = uniqueTestId("cv2_lic_mrel_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							propagate: { license_parents: [{ plan_id: parentId }] },
						},
						{
							plan_id: parentId,
							licenses: [{ license_plan_id: childId, included: 2 }],
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: declared customize on child new_version links latest")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_mdm_p");
		const childId = uniqueTestId("cv2_lic_mdm_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							versioning: "new_version", active: true,
						},
						{
							plan_id: parentId,
							licenses: [declaredThreeHundred({ childId })],
						},
					],
				});

				const childV2 = await getFullPlan({ ctx, planId: childId });
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 300,
					licenseInternalProductId: childV2.internal_id,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: declared+propagate is identical either payload order")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentFirst = uniqueTestId("cv2_lic_mord_pf");
		const childFirst = uniqueTestId("cv2_lic_mord_cf");
		const parentSecond = uniqueTestId("cv2_lic_mord_ps");
		const childSecond = uniqueTestId("cv2_lic_mord_cs");
		await withCatalogPlans({
			ctx,
			planIds: [parentFirst, childFirst, parentSecond, childSecond],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId: parentFirst,
					childId: childFirst,
					customize: messagesOverride(500),
				});
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId: parentSecond,
					childId: childSecond,
					customize: messagesOverride(500),
				});

				const childThenParent = [
					{
						plan_id: childFirst,
						items: [messagesItem(200)],
						propagate: { license_parents: [{ plan_id: parentFirst }] },
					},
					{
						plan_id: parentFirst,
						licenses: [declaredThreeHundred({ childId: childFirst })],
					},
				];
				const parentThenChild = [
					{
						plan_id: parentSecond,
						licenses: [declaredThreeHundred({ childId: childSecond })],
					},
					{
						plan_id: childSecond,
						items: [messagesItem(200)],
						propagate: { license_parents: [{ plan_id: parentSecond }] },
					},
				];

				await autumnV2_3.catalogV2.update({ plans: childThenParent });
				await autumnV2_3.catalogV2.update({ plans: parentThenChild });

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentFirst,
					licensePlanId: childFirst,
					customized: true,
					messagesAllowance: 300,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentSecond,
					licensePlanId: childSecond,
					customized: true,
					messagesAllowance: 300,
				});
			},
		});
	},
);
