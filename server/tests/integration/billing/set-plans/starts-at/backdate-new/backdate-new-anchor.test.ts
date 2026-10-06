/**
 * A backdate onto a customer with no subscription, anchored on the 1st, bills what Stripe bills for
 * backdate_start_date + billing_cycle_anchor:
 * - prorate_immediately: the stub up to the first 1st pro rata, then each month in full through the one running now;
 * - none: nothing now.
 *
 * Red (before):  the preview billed a full first month instead of the prorated stub.
 * Green (after):  the preview matches Stripe's invoice.
 */

import { test } from "bun:test";
import { UTCDate } from "@date-fns/utc";
import chalk from "chalk";
import { addDays, addMonths, startOfMonth, subMonths } from "date-fns";
import type { BackdateProrationBehavior } from "../backdate-live/utils/backdateLiveUtils";
import {
	backdateParams,
	expectedNewBackdateCharge,
	expectNewBackdateBilledCorrect,
	initNewCustomerScenario,
} from "./utils/backdateNewUtils";

for (const prorationBehavior of [
	"prorate_immediately",
	"none",
] as const satisfies BackdateProrationBehavior[]) {
	test.concurrent(
		`${chalk.yellowBright(`set-plans backdate new: anchored on the 1st with ${prorationBehavior} bills what Stripe bills`)}`,
		async () => {
			const customerId = `set-plans-backdate-new-anchor-${prorationBehavior}`;
			const { autumnV1, autumnV2_4, ctx, pro, nowMs } =
				await initNewCustomerScenario({ customerId });
			const startMs = addDays(subMonths(new UTCDate(nowMs), 2), -10).getTime();
			const anchorMs = startOfMonth(addMonths(new UTCDate(nowMs), 1)).getTime();
			const params = backdateParams({
				customerId,
				planId: pro.id,
				startsAt: startMs,
				prorationBehavior,
				billingCycleAnchor: anchorMs,
			});

			const preview = await autumnV2_4.billing.previewSetPlans(params);
			await autumnV2_4.billing.setPlans(params);

			await expectNewBackdateBilledCorrect({
				ctx,
				autumnV1,
				customerId,
				startMs,
				nowMs,
				anchorMs,
				previewTotal: preview.total,
				expectedCharge: expectedNewBackdateCharge({
					startMs,
					nowMs,
					anchorMs,
					prorationBehavior,
				}),
			});
		},
	);
}
