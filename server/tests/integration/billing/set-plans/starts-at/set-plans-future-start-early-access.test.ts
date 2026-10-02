/**
 * set_plans enable_plan_immediately with a future phases[0].starts_at: the plan is Active now with
 * its balance granted, nothing is invoiced until the start, and the subscription Stripe creates at
 * the start invoices it once and links the row without re-granting or resetting the balance (it resets
 * a cycle after the start).
 */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays, addMonths } from "date-fns";
import {
	activateFutureStart,
	expectFutureStartScheduleCorrect,
	findLiveCustomerProduct,
	futureStartProducts,
} from "./utils/futureStartUtils";

const TRACKED_USAGE = 30;

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at: early access is active now and keeps its balance when billing starts")}`,
	async () => {
		const { pro } = futureStartProducts();
		const { customerId, autumnV1, autumnV2_2, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-future-start-early-access",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [],
			});
		const startsAt = addDays(advancedTo, 7).getTime();
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			enable_plan_immediately: true,
			phases: [{ starts_at: startsAt, plans: [{ plan_id: pro.id }] }],
		};

		const preview = await autumnV2_2.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);

		await autumnV2_2.billing.setPlans(params);

		const enabled = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(enabled.status).toBe(CusProductStatus.Active);
		expect(Math.abs((enabled.access_starts_at ?? 0) - advancedTo)).toBeLessThan(
			ms.minutes(10),
		);
		const schedule = await expectFutureStartScheduleCorrect({
			ctx,
			customerProduct: enabled,
			startsAt,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 0,
		});

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: TRACKED_USAGE,
		});
		const expectedBalance = {
			customerId,
			autumn: autumnV2_2,
			featureId: TestFeature.Messages,
			granted: 100,
			usage: TRACKED_USAGE,
			nextResetAt: addMonths(startsAt, 1).getTime(),
		};
		await expectBalanceCorrect(expectedBalance);

		const stripeSubscriptionId = await activateFutureStart({
			ctx,
			customerId,
			testClockId: testClockId!,
			scheduleId: schedule.id,
			startsAt,
		});

		const billed = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(billed.id).toBe(enabled.id);
		expect(billed.status).toBe(CusProductStatus.Active);
		expect(billed.subscription_ids).toEqual([stripeSubscriptionId]);
		await expectBalanceCorrect(expectedBalance);
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 1,
			latestTotal: 20,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		});
	},
);
