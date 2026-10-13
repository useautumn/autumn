// Regression: active subscriptions can be corrected with a prepaid/free first
// phase, then resume paid billing on a future phase.

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	BillingInterval,
	CusProductStatus,
	customerProducts,
	stripeRefToId,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { and, eq } from "drizzle-orm";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";
import { expandedStripePrice, findSchedulePhase } from "./freeFirstPhaseUtils";

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
		const stripeScheduleId = stripeRefToId(subscription.schedule);
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

test.concurrent(
	`${chalk.yellowBright("create-schedule free first phase: replaces paid state and cancels its subscription")}`,
	async () => {
		const paid = products.pro({
			id: "paid-state",
			items: [items.monthlyMessages()],
		});
		const freePrimary = products.base({
			id: "free-primary",
			items: [items.monthlyMessages()],
		});
		const freeSecondary = products.base({
			id: "free-secondary",
			group: "secondary",
			items: [items.monthlyWords()],
		});
		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "create-schedule-free-state",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [paid, freePrimary, freeSecondary] }),
			],
			actions: [s.billing.attach({ productId: paid.id })],
		});

		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			billing_behavior: "none",
			preserve_add_ons: true,
			phases: [
				{
					starts_at: "now",
					plans: [{ plan_id: freePrimary.id }, { plan_id: freeSecondary.id }],
				},
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [freePrimary.id, freeSecondary.id],
			notPresent: [paid.id],
		});
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
