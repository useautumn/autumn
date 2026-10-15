/**
 * set_plans rewrites a Stripe schedule by releasing it and creating a new one
 * from the subscription. When the released schedule was imported (created
 * outside Autumn, so it carries no autumn_managed_at metadata), the
 * schedule.released webhook for Autumn's own release detached the scheduled
 * plan set_plans had just kept, and cleared the live plan's phase end.
 *
 * Red (current):  after set_plans, premium's scheduled row is gone (or pro no
 *                 longer ends when premium starts).
 * Green (after):  premium stays scheduled and pro still ends when it starts.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	CusProductStatus,
	type SetPlansParamsV0Input,
	type SyncParamsV1,
	stripeRefToId,
} from "@autumn/shared";
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
import { waitForStripeEventHandled } from "./utils/waitForStripeEventHandled";

test.concurrent(
	`${chalk.yellowBright("schedule.released: keeps the scheduled plan when set_plans releases an imported schedule")}`,
	async () => {
		const customerId = "sched-released-skips-autumn-release";
		const pro = products.pro({ id: "pro", items: [] });
		const premium = products.premium({ id: "premium", items: [] });

		const { autumnV1, autumnV2_4 } = await initScenario({
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
		const { subscription, schedule: importedSchedule } =
			await createStripeSubscriptionSchedule({
				ctx,
				customerId,
				phases: [
					{
						items: [{ price: getBaseStripePriceId({ fullProduct: proFull }) }],
					},
					{
						items: [
							{ price: getBaseStripePriceId({ fullProduct: premiumFull }) },
						],
					},
				],
			});
		const phaseTwoStartsAt = importedSchedule.phases[1].start_date * 1000;

		await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_subscription_id: subscription.id,
			stripe_schedule_id: importedSchedule.id,
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

		// Repricing the live plan keeps premium's scheduled row as is, but makes
		// set_plans release the imported schedule and create its own.
		const setPlansStartedAt = Date.now();
		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					proration_behavior: "none",
					plans: [
						{
							plan_id: pro.id,
							customize: {
								price: { amount: 30, interval: BillingInterval.Month },
							},
						},
					],
				},
				{ starts_at: phaseTwoStartsAt, plans: [{ plan_id: premium.id }] },
			],
		});

		const [releasedSchedule, updatedSubscription] = await Promise.all([
			ctx.stripeCli.subscriptionSchedules.retrieve(importedSchedule.id),
			ctx.stripeCli.subscriptions.retrieve(subscription.id),
		]);
		expect(releasedSchedule.status).toBe("released");
		const newScheduleId = stripeRefToId(updatedSubscription.schedule);
		expect(newScheduleId).toBeDefined();
		expect(newScheduleId).not.toBe(importedSchedule.id);

		await waitForStripeEventHandled({
			ctx,
			type: "subscription_schedule.released",
			objectId: importedSchedule.id,
			since: setPlansStartedAt,
		});

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
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);
