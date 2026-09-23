/**
 * A license edit batched with its parent's plain link (atmn push shape) follows
 * the new license shape instead of freezing the parent at the old one.
 */
import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getFullLicenseProduct } from "../../utils/getFullLicenseProduct.js";

const LICENSE_ID = "push-link-lic";
const PARENT_ID = "push-link-par";

const licensePlan = ({ withItem }: { withItem: boolean }) => ({
	plan_id: LICENSE_ID,
	name: "Seat",
	add_on: true,
	items: withItem ? [itemsV2.monthlyMessages({ included: 5 })] : [],
	licenses: [],
});

const parentPlan = {
	plan_id: PARENT_ID,
	name: "Team",
	add_on: false,
	items: [],
	licenses: [{ license_plan_id: LICENSE_ID, included: 1 }],
};

test.concurrent(
	`${chalk.yellowBright("catalog.update: a parent in the same batch follows the license edit")}`,
	async () => {
		const customerId = "push-link-subscribed";
		const { autumnV2_4, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});
		await autumnV2_4.catalog.update({
			plans: [licensePlan({ withItem: false })],
			skip_deletions: true,
		});
		await autumnV2_4.catalog.update({
			plans: [parentPlan],
			skip_deletions: true,
		});
		await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: PARENT_ID,
			redirect_mode: "if_required",
		});

		const pushParams = {
			plans: [licensePlan({ withItem: true }), parentPlan],
			skip_deletions: true,
		};
		await autumnV2_4.catalog.previewUpdate(pushParams);
		await autumnV2_4.catalog.update(pushParams);

		const link = await getFullLicenseProduct({
			ctx,
			parentPlanId: PARENT_ID,
			licensePlanId: LICENSE_ID,
		});
		expect(link.planLicense.customized).toBe(false);
		expect(link.fullLicenseProduct.entitlements).toContainEqual(
			expect.objectContaining({ feature_id: TestFeature.Messages }),
		);

		await autumnV2_4.catalog.update(pushParams);
	},
);
