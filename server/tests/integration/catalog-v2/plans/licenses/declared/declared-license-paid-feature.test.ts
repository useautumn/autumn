/**
 * catalogV2.update — plan-license customize cannot add or change paid features.
 *
 * Contract:
 *   customize add_items with a prepaid feature → 400
 *   customize changing a child's prepaid amount → 400
 * Stock prepaid on the child (no customize) is still allowed.
 */

import { test } from "bun:test";
import { BillingInterval, BillingMethod, ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { messagesItem, withCatalogPlans } from "../utils/seedLicensePlans.js";

const prepaidItem = ({
	featureId,
	amount,
}: {
	featureId: string;
	amount: number;
}) => ({
	feature_id: featureId,
	included: 0,
	price: {
		amount,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: 100,
	},
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: customize add_items prepaid feature → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_paid_add_p");
		const childId = uniqueTestId("cv2_lic_paid_add_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							name: "Seat",
							items: [messagesItem(10)],
						},
						{ plan_id: parentId, name: "Parent" },
					],
				});

				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: "Paid features are not supported on plan licenses",
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: parentId,
									licenses: [
										{
											license_plan_id: childId,
											included: 1,
											customize: {
												add_items: [
													prepaidItem({
														featureId: TestFeature.Words,
														amount: 5,
													}),
												],
											},
										},
									],
								},
							],
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: customize prepaid amount change → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_paid_amt_p");
		const childId = uniqueTestId("cv2_lic_paid_amt_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							name: "Seat",
							items: [
								prepaidItem({
									featureId: TestFeature.Messages,
									amount: 10,
								}),
							],
						},
						{ plan_id: parentId, name: "Parent" },
					],
				});

				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: "Paid features are not supported on plan licenses",
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: parentId,
									licenses: [
										{
											license_plan_id: childId,
											included: 1,
											customize: {
												remove_items: [
													{
														feature_id: TestFeature.Messages,
														billing_method: BillingMethod.Prepaid,
													},
												],
												add_items: [
													prepaidItem({
														featureId: TestFeature.Messages,
														amount: 25,
													}),
												],
											},
										},
									],
								},
							],
						}),
				});
			},
		});
	},
);
