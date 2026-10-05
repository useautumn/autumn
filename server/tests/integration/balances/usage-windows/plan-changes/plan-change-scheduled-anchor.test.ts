/**
 * A monthly cap on a daily-reset grant anchors to the grant's fixed
 * `reset_cycle_anchor`, so a scheduled billing-cycle anchor must move it when
 * the new anchor lands, not when it is scheduled.
 *
 * Red (before):  the anchor lands on Stripe but `reset_cycle_anchor` keeps the
 *                attach date, so the cap keeps rolling on the old cycle.
 * Green (after): scheduling leaves the cap on the old cycle (count kept); the
 *                landing re-keys it to the new billing cycle.
 */

import { expect, test } from "bun:test";
import {
	EntInterval,
	getUsageWindowBounds,
	ProductItemInterval,
	secondsToMs,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { getStripeSubscription } from "@tests/integration/billing/utils/stripeSubscriptionUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addDays } from "date-fns";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";
import { fetchUsageWindowRows } from "../../utils/usage-limit-utils/usageWindowDbTestUtils.js";

test(`${chalk.yellowBright("uw-plan-change-scheduled-anchor1: a scheduled anchor moves a monthly cap on a daily grant when it lands")}`, async () => {
	const pro = products.pro({
		id: "pro",
		items: [
			constructFeatureItem({
				featureId: TestFeature.Messages,
				includedUsage: 100,
				interval: ProductItemInterval.Day,
			}),
		],
	});

	const customerId = "uw-sched-anchor-daily";
	const { ctx, autumnV2_3, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await setCustomerUsageLimit({
		autumn: autumnV2_3,
		customerId,
		featureId: TestFeature.Messages,
		limit: 50,
	});
	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 3,
	});

	// Scheduling alone keeps the cap on the current cycle.
	const scheduledAnchorMs = addDays(advancedTo, 10).getTime();
	await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		billing_cycle_anchor: scheduledAnchorMs,
	});
	await expectCustomerUsageLimit({
		autumn: autumnV2_3,
		customerId,
		featureId: TestFeature.Messages,
		usage: 3,
		limit: 50,
	});

	await timeout(4000);
	await advanceToAnchor({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advancedTo,
		anchorMs: scheduledAnchorMs,
	});
	await expectCustomerInvoiceCorrect({ customerId, count: 2 });

	// Landed: the cap restarts on the new billing cycle.
	const { subscription } = await getStripeSubscription({ customerId });
	const landedAnchorMs = secondsToMs(subscription.billing_cycle_anchor);
	expect(landedAnchorMs).toBe(Math.floor(scheduledAnchorMs / 1000) * 1000);

	await expectCustomerUsageLimit({
		autumn: autumnV2_3,
		customerId,
		featureId: TestFeature.Messages,
		usage: 0,
		limit: 50,
	});
	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 2,
	});

	await timeout(4000);
	const expectedBounds = getUsageWindowBounds({
		interval: EntInterval.Month,
		now: Date.now(),
		anchor: landedAnchorMs,
	});
	const windowRows = await fetchUsageWindowRows({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	const currentRow = windowRows.find(
		(row) => Number(row.window_start_at) === expectedBounds.windowStartAt,
	);
	expect(currentRow).toBeDefined();
	expect(Number(currentRow.window_end_at)).toBe(expectedBounds.windowEndAt);
	expect(Number(currentRow.usage)).toBe(2);
});
