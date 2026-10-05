/**
 * phases[0].starts_at over a paused subscription, which set_plans replaces rather than updates:
 * - a backdate cancels the paused subscription and starts the plan on one new subscription from the
 *   backdated date, invoicing what the preview showed;
 * - a future start cancels the paused subscription now, charges nothing, and waits for the start.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	CusProductStatus,
	ms,
	msToSeconds,
	type SetPlansParamsV0Input,
	secondsToMs,
} from "@autumn/shared";
import {
	expectSubscriptionReplaced,
	findStripeSubscriptionByStatus,
	setupPausedPro,
} from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import chalk from "chalk";
import { addDays } from "date-fns";
import { attachPaymentMethod } from "@/utils/scriptUtils/initCustomer";
import {
	expectFutureStartScheduleCorrect,
	expectPendingSchedules,
	findLiveCustomerProduct,
	testClockNowMs,
} from "./utils/futureStartUtils";

const setupPausedProWithCard = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const scenario = await setupPausedPro({ customerId });
	await attachPaymentMethod({
		stripeCli: scenario.ctx.stripeCli,
		stripeCusId: scenario.paused.customer as string,
		type: "success",
	});
	const { invoices = [] } =
		await scenario.autumnV1.customers.get<ApiCustomerV3>(customerId);
	return { ...scenario, invoiceCountBefore: invoices.length };
};

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at paused: a backdate replaces the paused subscription with one started on the backdated date")}`,
	async () => {
		const customerId = "set-plans-starts-at-paused-backdate";
		const { pro, paused, autumnV1, autumnV2_4, ctx, invoiceCountBefore } =
			await setupPausedProWithCard({ customerId });
		const backdatedStart = secondsToMs(paused.start_date) - ms.days(10);
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [{ starts_at: backdatedStart, plans: [{ plan_id: pro.id }] }],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		await autumnV2_4.billing.setPlans(params);

		await expectSubscriptionReplaced({
			ctx,
			customerId,
			productId: pro.id,
			replacedSubscriptionId: paused.id,
		});
		const replacement = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "active",
		});
		expect(replacement.start_date).toBe(msToSeconds(backdatedStart));
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: invoiceCountBefore + 1,
			latestTotal: preview.total,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at paused: a future start cancels the paused subscription now and waits for the start")}`,
	async () => {
		const customerId = "set-plans-starts-at-paused-future";
		const {
			pro,
			paused,
			autumnV1,
			autumnV2_4,
			ctx,
			testClockId,
			invoiceCountBefore,
		} = await setupPausedProWithCard({ customerId });
		const nowMs = await testClockNowMs({ ctx, testClockId: testClockId! });
		const startsAt = addDays(nowMs, 7).getTime();

		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [{ starts_at: startsAt, plans: [{ plan_id: pro.id }] }],
		});

		expect((await ctx.stripeCli.subscriptions.retrieve(paused.id)).status).toBe(
			"canceled",
		);
		const scheduled = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(scheduled.status).toBe(CusProductStatus.Scheduled);
		const schedule = await expectFutureStartScheduleCorrect({
			ctx,
			customerProduct: scheduled,
			startsAt,
		});
		await expectPendingSchedules({
			ctx,
			customerId,
			scheduleIds: [schedule.id],
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: invoiceCountBefore,
		});
	},
);
