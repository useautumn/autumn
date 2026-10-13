/** Resync with a later phase keeps the old start and anchor and starts the next phase on its requested date. */

import { expect, test } from "bun:test";
import {
	msToSeconds,
	type SetPlansParamsV0Input,
	stripeRefToId,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import {
	cancelSubscriptionForResync,
	expectResyncedSubscriptionCorrect,
} from "../utils/resyncUtils";

test.concurrent(
	`${chalk.yellowBright("set-plans resync future phase: anchors on the old period end and starts the next phase on time")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-resync-future-phase",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 10 }),
			],
		});

		const { oldSubscriptionId, oldStartMs, oldPeriodEndMs } =
			await cancelSubscriptionForResync({ ctx, customerId });
		const nextPhaseStartsAt = addMonths(oldPeriodEndMs, 1).getTime();

		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [
				{
					billing_cycle_anchor: oldPeriodEndMs,
					proration_behavior: "none",
					starts_at: oldStartMs,
					plans: [{ plan_id: pro.id }],
				},
				{ starts_at: nextPhaseStartsAt, plans: [{ plan_id: premium.id }] },
			],
		});

		const subscription = await expectResyncedSubscriptionCorrect({
			ctx,
			customerId,
			oldSubscriptionId,
			startMs: oldStartMs,
			anchorMs: oldPeriodEndMs,
		});
		await expectCustomerInvoiceCorrect({ customerId, count: 1 });
		await expectCustomerProducts({
			customerId,
			active: [pro.id],
			scheduled: [premium.id],
		});

		const scheduleId = stripeRefToId(subscription.schedule);
		if (!scheduleId) throw new Error("Resynced subscription has no schedule");
		const schedule =
			await ctx.stripeCli.subscriptionSchedules.retrieve(scheduleId);
		expect(schedule.phases.map((phase) => phase.start_date)).toContain(
			msToSeconds(nextPhaseStartsAt),
		);
	},
);
