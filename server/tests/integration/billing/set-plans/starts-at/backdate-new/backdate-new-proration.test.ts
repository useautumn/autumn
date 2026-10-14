import { test } from "bun:test";
import chalk from "chalk";
import { subHours, subMonths } from "date-fns";
import type { BackdateProrationBehavior } from "../backdate-live/utils/backdateLiveUtils";
import {
	backdateParams,
	expectedNewBackdateCharge,
	expectNewBackdateBilledCorrect,
	initNewCustomerScenario,
} from "./utils/backdateNewUtils";

const BACKDATED_MONTHS = 2;
const HOURS_BEFORE_NOW = 1;

for (const prorationBehavior of [
	"prorate_immediately",
	"bill_difference",
	"none",
] as const satisfies BackdateProrationBehavior[]) {
	test.concurrent(
		`${chalk.yellowBright(`set-plans backdate new: 2 months back with ${prorationBehavior} bills what Stripe bills`)}`,
		async () => {
			const customerId = `set-plans-backdate-new-${prorationBehavior}`;
			const { autumnV1, autumnV2_4, ctx, pro, nowMs } =
				await initNewCustomerScenario({ customerId });
			const startMs = subHours(
				subMonths(nowMs, BACKDATED_MONTHS),
				HOURS_BEFORE_NOW,
			).getTime();
			const params = backdateParams({
				customerId,
				planId: pro.id,
				startsAt: startMs,
				prorationBehavior,
			});

			const preview = await autumnV2_4.billing.previewSetPlans(params);
			await autumnV2_4.billing.setPlans(params);

			await expectNewBackdateBilledCorrect({
				ctx,
				autumnV1,
				customerId,
				startMs,
				nowMs,
				previewTotal: preview.total,
				expectedCharge: expectedNewBackdateCharge({
					startMs,
					nowMs,
					prorationBehavior,
				}),
			});
		},
	);
}
