// Advancing Stripe's test clock through a same-plan reset-billing-cycle
// transition charges the full base on a single invoice, with no unused-time
// proration credit — matching the next-cycle preview.

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type CreateScheduleParamsV0Input,
	ms,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { hoursToFinalizeInvoice } from "@tests/utils/constants";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { addHours, addMonths } from "date-fns";

test.concurrent(
	"create-schedule Stripe clock: same-plan reset-billing-cycle charges the full base",
	async () => {
		const plan = products.pro({
			id: "reset-cycle-clock-plan",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV1, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId: "create-schedule-reset-cycle-clock",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [plan] }),
				],
				actions: [],
			});

		const currentPlanEndsAt = truncateMsToSecondPrecision(
			addMonths(advancedTo, 1).getTime(),
		);
		const transitionAt = currentPlanEndsAt - ms.hours(16);

		const phases: CreateScheduleParamsV0Input["phases"] = [
			{ starts_at: advancedTo, plans: [{ plan_id: plan.id }] },
			{
				starts_at: transitionAt,
				plans: [{ plan_id: plan.id }],
				billing_cycle_anchor: "phase_start",
			},
		];

		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			billing_behavior: "none",
			phases,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: addHours(transitionAt, hoursToFinalizeInvoice).getTime(),
			waitForSeconds: 30,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const latestInvoiceStripeId = customer.invoices?.[0]?.stripe_id;
		if (!latestInvoiceStripeId) {
			throw new Error("Expected the reset transition to create an invoice");
		}

		const transitionInvoice =
			await ctx.stripeCli.invoices.retrieve(latestInvoiceStripeId);
		expect(transitionInvoice.total / 100).toBeCloseTo(20, 2);
	},
);
