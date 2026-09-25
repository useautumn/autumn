/**
 * A schedule imported with a quantity-only future phase leaves Autumn holding a
 * scheduled row at the quantity Stripe had at import time. When that future
 * phase is edited in Stripe, the schedule-updated handler ignores any schedule
 * that has already started, so the held row keeps the old quantity forever.
 *
 * Red (current):  after the edit, pro stays scheduled and the active pro keeps ended_at.
 * Green (after):  the held row is dropped and ended_at cleared; the phase step is
 *                 applied by the subscription webhook when the phase turns.
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
import { expectCustomerProductPhaseEnds } from "../subscription-schedule-released/utils/expectCustomerProductPhaseEnds";

test.concurrent(
	`${chalk.yellowBright("schedule.updated: a future quantity edit drops the held quantity-only phase")}`,
	async () => {
		const customerId = "sched-updated-future-qty";
		const pro = products.pro({ id: "pro", items: [] });

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const proPriceId = getBaseStripePriceId({
			fullProduct: await fetchFullProduct({ ctx, productId: pro.id }),
		});
		const { subscription, schedule } = await createStripeSubscriptionSchedule({
			ctx,
			customerId,
			phases: [
				{ items: [{ price: proPriceId, quantity: 1 }] },
				{ items: [{ price: proPriceId, quantity: 2 }] },
			],
		});
		const [currentPhase, futurePhase] = schedule.phases;
		const phaseTwoStartsAt = futurePhase.start_date * 1000;

		await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_subscription_id: subscription.id,
			stripe_schedule_id: schedule.id,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: pro.id }] },
				{ starts_at: phaseTwoStartsAt, plans: [{ plan_id: pro.id }] },
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
				{ productId: pro.id, status: CusProductStatus.Scheduled },
			],
		});

		const edited = await ctx.stripeCli.subscriptionSchedules.update(
			schedule.id,
			{
				phases: [
					{
						items: [{ price: proPriceId, quantity: 1 }],
						start_date: currentPhase.start_date,
						end_date: currentPhase.end_date,
					},
					{
						items: [{ price: proPriceId, quantity: 3 }],
						start_date: futurePhase.start_date,
						end_date: futurePhase.end_date,
					},
				],
			},
		);
		expect(edited.phases[1].items[0].quantity).toBe(3);

		await expectCustomerProductPhaseEnds({
			ctx,
			customerId,
			expected: [
				{ productId: pro.id, status: CusProductStatus.Active, endedAt: null },
			],
			absentStatuses: [
				{ productId: pro.id, status: CusProductStatus.Scheduled },
			],
		});
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);
