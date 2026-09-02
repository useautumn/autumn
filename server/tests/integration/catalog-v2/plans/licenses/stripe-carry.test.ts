/**
 * catalogV2.update — Stripe id carry onto plan-license overlay rows.
 *
 * Pin overlay (parent omitted while the child changes) carries from the
 * FROZEN child. Declared customize cannot add or change paid features, so
 * overlay usage-price mint/carry is not a path.
 */

import { expect, test } from "bun:test";
import { BillingInterval, BillingMethod } from "@autumn/shared";
import { getFullLicenseProduct } from "@tests/integration/licenses/catalog-update/utils/getFullLicenseProduct.js";
import {
	expectPriceStripeReuseCorrect,
	findFeaturePrice,
} from "@tests/integration/utils/expectStripePriceResources.js";
import { materializePlanInStripe } from "@tests/integration/utils/materializePlanInStripe.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { withCatalogPlans } from "./utils/seedLicensePlans.js";

const prepaidMessagesItem = ({ amount }: { amount: number }) => ({
	feature_id: TestFeature.Messages,
	included: 0,
	price: {
		amount,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: 100,
	},
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 licenses stripe: pin overlay carries frozen child stripe ids")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lstr_pin_p");
		const childId = uniqueTestId("cv2_lstr_pin_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							name: "Seat",
							items: [prepaidMessagesItem({ amount: 10 })],
						},
						{
							plan_id: parentId,
							name: "Parent",
							licenses: [{ license_plan_id: childId, included: 2 }],
						},
					],
				});
				const frozenChild = await materializePlanInStripe({
					ctx,
					planId: childId,
				});
				const frozenPrice = findFeaturePrice({
					product: frozenChild,
					featureId: TestFeature.Messages,
				})!;

				// Child changes in place; parent omitted → pin overlay from frozen child.
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							items: [prepaidMessagesItem({ amount: 20 })],
						},
					],
				});

				const linked = await getFullLicenseProduct({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
				});
				expect(linked.planLicense.customized).toBe(true);

				const overlayPrice = findFeaturePrice({
					product: linked.fullLicenseProduct,
					featureId: TestFeature.Messages,
				});
				expect(overlayPrice?.id, "overlay mints its own price row").not.toBe(
					frozenPrice.id,
				);
				expectPriceStripeReuseCorrect({
					before: frozenPrice,
					after: overlayPrice,
					reuse: "full",
					label: "pin overlay frozen prepaid",
				});
			},
		});
	},
);
