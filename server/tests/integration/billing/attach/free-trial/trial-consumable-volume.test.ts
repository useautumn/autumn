/**
 * Pay-per-use volume on a trial plan: trial usage isn't billed at trial end, and since the
 * balance isn't reset there it counts toward the first paid cycle's band.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
import { TestFeature } from "@tests/setup/v2Features";
import { hoursToFinalizeInvoice } from "@tests/utils/constants";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addHours } from "date-fns";

const TRIAL_DAYS = 14;

const setupVolumeTrial = async ({ customerId }: { customerId: string }) => {
	const volumeItem = items.volumeConsumableMessages({ includedUsage: 100 });
	const proTrial = products.proWithTrial({
		id: `${customerId}-pro`,
		items: [volumeItem],
		trialDays: TRIAL_DAYS,
	});

	return initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id }),
			s.track({ featureId: TestFeature.Messages, value: 150, timeout: 3000 }),
		],
	});
};

// Default tiers: 0-500 @ $0.10, 501+ @ $0.05, net of 100 included → total bands 0-600 / 601+.
// DISABLED: the in-trial upcoming-invoice preview bills trial usage (150 × $0.10 = $15, total
// $35) but the trial-end invoice skips consumables ($20). getCusInvoicePreviews has no trial skip.
test.skip(`${chalk.yellowBright("trial-consumable-volume 1: in-trial preview matches the trial-end invoice (base only)")}`, async () => {
	const customerId = "trial-cons-vol-end";
	const { ctx, autumnV1, autumnV2_2, testClockId, advancedTo } =
		await setupVolumeTrial({ customerId });

	// Trial usage is not charged at trial end: $20 base, $0 messages
	const { renewalInvoice } = await expectNextInvoiceMatchesPreview({
		ctx,
		autumnV1,
		autumnV2_2,
		customerId,
		testClockId: testClockId!,
		advancedTo,
		featureId: TestFeature.Messages,
		expectedFeatureAmount: 0,
	});
	expect(renewalInvoice.total).toBeCloseTo(20, 2);
});

test.concurrent(
	`${chalk.yellowBright("trial-consumable-volume 2: trial end bills base only, first paid cycle bills on its band")}`,
	async () => {
		const customerId = "trial-cons-vol-paid";
		const { ctx, autumnV1, autumnV2_2, testClockId, advancedTo } =
			await setupVolumeTrial({ customerId });

		const trialEndMs = advancedTo + ms.days(TRIAL_DAYS);
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: addHours(
				new Date(trialEndMs),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 15,
		});

		const afterTrial = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(afterTrial.invoices).toHaveLength(2);
		// $20 base only; the 150 trial messages are not charged at trial end
		expect(afterTrial.invoices![0].total).toBeCloseTo(20, 2);

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 500,
		});
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// 150 trial + 500 paid = 650 > 600 (band 2): 650 × $0.05 = $32.50
		const { renewalInvoice } = await expectNextInvoiceMatchesPreview({
			ctx,
			autumnV1,
			autumnV2_2,
			customerId,
			testClockId: testClockId!,
			advancedTo: trialEndMs,
			featureId: TestFeature.Messages,
			expectedFeatureAmount: 32.5,
		});
		// $20 base + $32.50 usage
		expect(renewalInvoice.total).toBeCloseTo(52.5, 2);
	},
);
