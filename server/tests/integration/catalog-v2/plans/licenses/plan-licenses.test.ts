/**
 * catalogV2.update — declared plan_license links on a direct parent entry.
 *
 * Contract:
 *   - parent + child created in one batch with licenses:[child] → link exists
 *   - customize add_items/price on an existing parent → customized:true
 *   - licenses: [] removes existing links
 */

import { expect, test } from "bun:test";
import { BillingInterval, ResetInterval } from "@autumn/shared";
import { getFullLicenseProduct } from "@tests/integration/licenses/catalog-update/utils/getFullLicenseProduct.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../preview/utils/expectPlanPreview.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: create parent + child with licenses:[child]")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_p");
		const childId = uniqueTestId("cv2_lic_c");
		await deleteDbPlans({ ctx, planIds: [parentId, childId] });
		try {
			const params = {
				plans: [
					{
						plan_id: childId,
						name: "Seat",
						items: [messagesItem(10)],
					},
					{
						plan_id: parentId,
						name: "Parent",
						licenses: [{ license_plan_id: childId, included: 2 }],
					},
				],
			};

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate(params),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: parentId,
					action: "create",
					licenses: [
						{
							license_plan_id: childId,
							version: 1,
							included: 2,
							prepaid_only: true,
						},
					],
				},
			});

			await autumnV2_3.catalogV2.update(params);
			const linked = await getFullLicenseProduct({
				ctx,
				parentPlanId: parentId,
				licensePlanId: childId,
			});
			expect(linked.planLicense).toMatchObject({
				included: 2,
				prepaid_only: true,
				customized: false,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [parentId, childId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: customize add_items + price on existing parent")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_cust_p");
		const childId = uniqueTestId("cv2_lic_cust_c");
		await deleteDbPlans({ ctx, planIds: [parentId, childId] });
		try {
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

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: parentId,
						licenses: [
							{
								license_plan_id: childId,
								included: 2,
								customize: {
									price: { amount: 20, interval: BillingInterval.Month },
									add_items: [itemsV2.monthlyWords({ included: 100 })],
								},
							},
						],
					},
				],
			});

			const linked = await getFullLicenseProduct({
				ctx,
				parentPlanId: parentId,
				licensePlanId: childId,
			});
			expect(linked.planLicense).toMatchObject({
				included: 2,
				customized: true,
			});
			expect(linked.fullLicenseProduct.prices).toContainEqual(
				expect.objectContaining({
					config: expect.objectContaining({
						amount: 20,
						interval: BillingInterval.Month,
					}),
				}),
			);
			expect(linked.fullLicenseProduct.entitlements).toContainEqual(
				expect.objectContaining({ feature_id: TestFeature.Words }),
			);
			expect(linked.fullLicenseProduct.entitlements).toContainEqual(
				expect.objectContaining({
					feature_id: TestFeature.Messages,
					allowance: 10,
				}),
			);
		} finally {
			await deleteDbPlans({ ctx, planIds: [parentId, childId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: licenses: [] removes existing links")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_clr_p");
		const childId = uniqueTestId("cv2_lic_clr_c");
		await deleteDbPlans({ ctx, planIds: [parentId, childId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: childId,
						name: "Seat",
						items: [messagesItem(10)],
					},
					{
						plan_id: parentId,
						name: "Parent",
						licenses: [{ license_plan_id: childId, included: 1 }],
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: parentId, licenses: [] }],
			});

			await expect(
				getFullLicenseProduct({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
				}),
			).rejects.toThrow(/is not linked/);
		} finally {
			await deleteDbPlans({ ctx, planIds: [parentId, childId] });
		}
	},
);
