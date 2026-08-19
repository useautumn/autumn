/**
 * catalogV2.update — create a variant from a parent that already has licenses.
 *
 * Red (current):  variant is created with no plan_license links
 * Green (after):  seat + admin links clone onto the variant (included + items)
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectLicenseLinkCorrect,
	expectLicenseLinkMissing,
} from "../../licenses/utils/expectLicenseLinkCorrect.js";
import {
	dashboardItem,
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import { expectVariantPointerCorrect } from "../utils/expectVariantPointer.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants create: clones existing parent license links")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_lic_base");
		const variantId = uniqueTestId("cv2_var_lic_eu");
		const seatId = uniqueTestId("cv2_var_lic_seat");
		const adminId = uniqueTestId("cv2_var_lic_admin");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, seatId, adminId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: seatId,
							name: "Seat",
							items: [messagesItem(25)],
						},
						{
							plan_id: adminId,
							name: "Admin",
							items: [{ feature_id: TestFeature.AdminRights }],
						},
						{
							plan_id: baseId,
							name: "Parent",
							price: { amount: 20, interval: "month" },
							items: [dashboardItem()],
							licenses: [
								{ license_plan_id: seatId, included: 3 },
								{ license_plan_id: adminId, included: 1 },
							],
						},
					],
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							variants: [{ variant_plan_id: variantId, name: "Parent EU" }],
						},
					],
				});

				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					basePlanId: baseId,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: seatId,
					included: 3,
					messagesAllowance: 25,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: adminId,
					included: 1,
					entitlements: [{ feature_id: TestFeature.AdminRights }],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants create: same-call licenses[] clones onto the variant")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_lic_sc_b");
		const variantId = uniqueTestId("cv2_var_lic_sc_v");
		const seatId = uniqueTestId("cv2_var_lic_sc_s");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, seatId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: seatId,
							name: "Seat",
							items: [messagesItem(10)],
						},
						{
							plan_id: baseId,
							name: "Team",
							items: [dashboardItem()],
							licenses: [{ license_plan_id: seatId, included: 2 }],
							variants: [{ variant_plan_id: variantId, name: "Team EU" }],
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: seatId,
					included: 2,
					messagesAllowance: 10,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants create: customize.remove_licenses drops that cloned link")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_lic_rm_b");
		const variantId = uniqueTestId("cv2_var_lic_rm_v");
		const seatId = uniqueTestId("cv2_var_lic_rm_s");
		const adminId = uniqueTestId("cv2_var_lic_rm_a");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, seatId, adminId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: seatId,
							name: "Seat",
							items: [messagesItem(10)],
						},
						{
							plan_id: adminId,
							name: "Admin",
							items: [{ feature_id: TestFeature.AdminRights }],
						},
						{
							plan_id: baseId,
							name: "Team",
							licenses: [
								{ license_plan_id: seatId, included: 2 },
								{ license_plan_id: adminId, included: 1 },
							],
							variants: [
								{
									variant_plan_id: variantId,
									name: "Team EU",
									customize: {
										remove_licenses: [{ license_plan_id: adminId }],
									},
								},
							],
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: seatId,
					included: 2,
				});
				await expectLicenseLinkMissing({
					ctx,
					parentPlanId: variantId,
					licensePlanId: adminId,
				});
			},
		});
	},
);
