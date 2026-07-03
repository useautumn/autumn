// Regression: active subscriptions can be corrected with a prepaid/free first
// phase, then resume paid billing on a future phase.

import { expect, test } from "bun:test";
import {
	BillingInterval,
	CusProductStatus,
	customerProducts,
	ms,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { addMonths } from "date-fns";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";
import chalk from "chalk";

const findSchedulePhase = ({
	schedule,
	startsAt,
}: {
	schedule: Stripe.SubscriptionSchedule;
	startsAt: number;
}) =>
	schedule.phases.find(
		(phase) => Math.abs(phase.start_date * 1000 - startsAt) < ms.minutes(1),
	);

const expandedStripePrice = (
	price: Stripe.SubscriptionSchedule.Phase.Item["price"] | undefined,
) => (price && typeof price !== "string" && !("deleted" in price) ? price : undefined);

test.concurrent(
	`${chalk.yellowBright("create-schedule free first phase: active subscription resumes paid future phase")}`,
	async () => {
		const customerId = "create-schedule-free-first-active-sub";
		const paid = products.base({
			id: "commercial-quarterly",
			items: [
				items.monthlyMessages({ includedUsage: 500 }),
				constructPriceItem({
					price: 2000,
					interval: BillingInterval.Quarter,
				}),
			],
		});
		const free = products.base({
			id: "commercial-free-access",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [paid, free] }),
			],
			actions: [s.billing.attach({ productId: paid.id })],
		});

		const [paidBefore] = await ctx.db
			.select()
			.from(customerProducts)
			.where(
				and(
					eq(customerProducts.customer_id, customerId),
					eq(customerProducts.product_id, paid.id),
					eq(customerProducts.status, CusProductStatus.Active),
				),
			);
		const stripeSubscriptionId = paidBefore?.subscription_ids?.[0];
		expect(stripeSubscriptionId).toBeDefined();

		const paidPhaseStartsAt = addMonths(advancedTo, 3).getTime();
		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			billing_behavior: "none",
			phases: [
				{
					starts_at: advancedTo,
					plans: [{ plan_id: free.id }],
				},
				{
					starts_at: paidPhaseStartsAt,
					billing_cycle_anchor: "phase_start",
					plans: [{ plan_id: paid.id }],
				},
			],
		});

		const freeCustomerProductId = response.phases[0]?.customer_product_ids[0];
		expect(freeCustomerProductId).toBeDefined();
		const [freeCustomerProduct] = await ctx.db
			.select()
			.from(customerProducts)
			.where(eq(customerProducts.id, freeCustomerProductId!));
		expect(freeCustomerProduct?.status).toBe(CusProductStatus.Active);
		expect(freeCustomerProduct?.ended_at).toBe(response.phases[1]?.starts_at);

		const subscription = await ctx.stripeCli.subscriptions.retrieve(
			stripeSubscriptionId!,
		);
		const stripeScheduleId =
			typeof subscription.schedule === "string"
				? subscription.schedule
				: subscription.schedule?.id;
		expect(stripeScheduleId).toBeDefined();

		const schedule = await ctx.stripeCli.subscriptionSchedules.retrieve(
			stripeScheduleId!,
			{ expand: ["phases.items.price"] },
		);
		const freeStripePhase = findSchedulePhase({
			schedule,
			startsAt: response.phases[0]!.starts_at,
		});
		expect(freeStripePhase).toBeDefined();
		const freePrice = expandedStripePrice(freeStripePhase?.items[0]?.price);
		expect(freePrice?.unit_amount).toBe(0);

		const paidStripePhase = findSchedulePhase({
			schedule,
			startsAt: response.phases[1]!.starts_at,
		});
		expect(paidStripePhase?.billing_cycle_anchor).toBe("phase_start");
		const paidPrice = expandedStripePrice(paidStripePhase?.items[0]?.price);
		expect(paidPrice?.recurring?.interval).toBe("month");
		expect(paidPrice?.recurring?.interval_count).toBe(3);
	},
);
