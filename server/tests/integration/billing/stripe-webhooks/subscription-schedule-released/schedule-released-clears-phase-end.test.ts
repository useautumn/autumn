/**
 * A Stripe schedule imported with a future phase stamps the current plan with
 * ended_at at the phase change and creates a scheduled row for the next plan.
 * If the schedule is then released in Stripe, the subscription runs on
 * indefinitely, but Autumn keeps both: the plan expires at the stale ended_at.
 *
 * Red (current):  after release, pro still has ended_at and premium stays scheduled.
 * Green (after):  pro has no ended_at and the premium scheduled row is gone.
 */

import { expect, test } from "bun:test";
import { CusProductStatus, type SyncParamsV1 } from "@autumn/shared";
import {
	createStripeSubscriptionSchedule,
	fetchFullProduct,
	getBaseStripePriceId,
} from "@tests/integration/billing/sync/utils/syncProductHelpers";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_TEST_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectCustomerProductPhaseEnds } from "./utils/expectCustomerProductPhaseEnds";

test.concurrent(
	`${chalk.yellowBright("schedule.released: clears the phase end and drops the scheduled plan")}`,
	async () => {
		const customerId = "sched-released-clears-phase-end";
		const pro = products.pro({ id: "pro", items: [] });
		const premium = products.premium({ id: "premium", items: [] });

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const [proFull, premiumFull] = await Promise.all([
			fetchFullProduct({ ctx, productId: pro.id }),
			fetchFullProduct({ ctx, productId: premium.id }),
		]);
		const { subscription, schedule } = await createStripeSubscriptionSchedule({
			ctx,
			customerId,
			phases: [
				{ items: [{ price: getBaseStripePriceId({ fullProduct: proFull }) }] },
				{
					items: [
						{ price: getBaseStripePriceId({ fullProduct: premiumFull }) },
					],
				},
			],
		});
		const phaseTwoStartsAt = schedule.phases[1].start_date * 1000;

		await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_subscription_id: subscription.id,
			stripe_schedule_id: schedule.id,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: pro.id }] },
				{ starts_at: phaseTwoStartsAt, plans: [{ plan_id: premium.id }] },
			],
		} satisfies SyncParamsV1);

		await expectCustomerProductPhaseEnds({
			ctx,
			customerId,
			expected: [
				{
					productId: pro.id,
					status: CusProductStatus.Active,
					endedAt: phaseTwoStartsAt,
				},
				{ productId: premium.id, status: CusProductStatus.Scheduled },
			],
		});

		const released = await ctx.stripeCli.subscriptionSchedules.release(
			schedule.id,
		);
		expect(released.status).toBe("released");

		await expectCustomerProductPhaseEnds({
			ctx,
			customerId,
			expected: [
				{ productId: pro.id, status: CusProductStatus.Active, endedAt: null },
			],
			absent: [premium.id],
		});
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);
