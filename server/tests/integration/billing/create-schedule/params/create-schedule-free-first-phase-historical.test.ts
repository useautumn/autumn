// Regression: active subscriptions can be corrected with a prepaid/free first
// phase, then resume paid billing on a future phase.

import { expect, test } from "bun:test";
import { customerProducts, ms } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import globalCtx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";

test.concurrent(
	`${chalk.yellowBright("create-schedule free historical first phase: reset current paid phase")}`,
	async () => {
		const customerId = "create-schedule-reset-historical-free";
		const clockStart = Date.UTC(2027, 0, 1, 12, 0);
		const paidStartsAt = clockStart + ms.days(1);
		const nextPaidStartsAt = paidStartsAt + ms.days(30);
		const editAt = paidStartsAt + ms.hours(1);

		const testClock = await globalCtx.stripeCli.testHelpers.testClocks.create({
			frozen_time: Math.floor(clockStart / 1000),
		});

		const paid = products.pro({
			id: "paid-after-historical-free",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const nextPaid = products.pro({
			id: "next-paid-after-historical-free",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const free = products.base({
			id: "historical-free-access",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({
					testClock: false,
					paymentMethod: "success",
					stripeCustomerOverrides: { test_clock: testClock.id },
				}),
				s.products({ list: [paid, nextPaid, free] }),
			],
			actions: [s.billing.attach({ productId: paid.id })],
		});

		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			billing_behavior: "none",
			phases: [
				{ starts_at: clockStart, plans: [{ plan_id: free.id }] },
				{ starts_at: paidStartsAt, plans: [{ plan_id: paid.id }] },
				{ starts_at: nextPaidStartsAt, plans: [{ plan_id: nextPaid.id }] },
			],
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClock.id,
			advanceTo: editAt,
		});

		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			billing_behavior: "none",
			phases: [
				{ starts_at: clockStart, plans: [{ plan_id: free.id }] },
				{
					starts_at: paidStartsAt,
					billing_cycle_anchor: "phase_start",
					plans: [{ plan_id: paid.id }],
				},
				{
					starts_at: nextPaidStartsAt,
					billing_cycle_anchor: "phase_start",
					plans: [{ plan_id: nextPaid.id }],
				},
			],
		});

		const nextPaidPhase = response.phases.find(
			(phase) => Math.abs(phase.starts_at - nextPaidStartsAt) < ms.minutes(1),
		);
		expect(nextPaidPhase).toBeDefined();
		const [nextPaidCustomerProduct] = await ctx.db
			.select()
			.from(customerProducts)
			.where(eq(customerProducts.id, nextPaidPhase!.customer_product_ids[0]!));

		expect(nextPaidCustomerProduct?.billing_cycle_anchor_resets_at).toBe(
			nextPaidPhase!.starts_at,
		);
	},
);
