// Regression: phase-level billing_cycle_anchor must persist the phase-start
// reset timestamp so Stripe schedule phases can reset anchors.

import { expect, test } from "bun:test";
import { BillingInterval, customerProducts, ms } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";

test.concurrent(
	`${chalk.yellowBright("create-schedule phase billing anchor: backdated monthly to current quarterly resets anchor")}`,
	async () => {
		const customerId = "create-schedule-phase-anchor-reset";
		const starter = products.pro({
			id: "starter",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const commercial = products.base({
			id: "commercial-quarterly",
			items: [
				items.monthlyMessages({ includedUsage: 500 }),
				constructPriceItem({
					price: 2000,
					interval: BillingInterval.Quarter,
				}),
			],
		});

		const { autumnV1, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [starter, commercial] }),
			],
			actions: [],
		});

		const phaseStartsAt = advancedTo;
		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo - ms.days(2),
					plans: [{ plan_id: starter.id }],
				},
				{
					starts_at: phaseStartsAt,
					billing_cycle_anchor: "phase_start",
					plans: [{ plan_id: commercial.id }],
				},
			],
		});

		const scheduledCustomerProductId =
			response.phases[1]?.customer_product_ids[0];
		expect(scheduledCustomerProductId).toBeDefined();
		const activeCustomerProductId = response.phases[0]?.customer_product_ids[0];
		expect(activeCustomerProductId).toBeDefined();
		const resolvedPhaseStartsAt = response.phases[1]?.starts_at;
		expect(resolvedPhaseStartsAt).toBeDefined();

		const [scheduledCustomerProduct] = await ctx.db
			.select()
			.from(customerProducts)
			.where(eq(customerProducts.id, scheduledCustomerProductId!));

		expect(scheduledCustomerProduct?.billing_cycle_anchor_resets_at).toBe(
			resolvedPhaseStartsAt,
		);

		const [activeCustomerProduct] = await ctx.db
			.select()
			.from(customerProducts)
			.where(eq(customerProducts.id, activeCustomerProductId!));

		const stripeSubscriptionId = activeCustomerProduct?.subscription_ids?.[0];
		expect(stripeSubscriptionId).toBeDefined();

		const stripeSubscription = await ctx.stripeCli.subscriptions.retrieve(
			stripeSubscriptionId!,
		);
		const stripeScheduleId =
			typeof stripeSubscription.schedule === "string"
				? stripeSubscription.schedule
				: stripeSubscription.schedule?.id;
		expect(stripeScheduleId).toBeDefined();

		const stripeSchedule = await ctx.stripeCli.subscriptionSchedules.retrieve(
			stripeScheduleId!,
			{ expand: ["phases.items.price"] },
		);
		const stripePhase = stripeSchedule.phases.find(
			(phase) =>
				Math.abs(phase.start_date * 1000 - resolvedPhaseStartsAt!) < 60_000,
		);
		expect(stripePhase).toBeDefined();
		expect(stripePhase?.billing_cycle_anchor).toBe("phase_start");

		const stripePrice = stripePhase?.items[0]?.price;
		const expandedStripePrice =
			stripePrice && typeof stripePrice !== "string" ? stripePrice : undefined;
		expect(expandedStripePrice).toBeDefined();
		expect(expandedStripePrice && "recurring" in expandedStripePrice).toBe(
			true,
		);
		const recurring =
			expandedStripePrice && "recurring" in expandedStripePrice
				? expandedStripePrice.recurring
				: undefined;
		expect(recurring?.interval).toBe("month");
		expect(recurring?.interval_count).toBe(3);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule phase billing anchor: a later phase keeps its cycle anchor while the next resets")}`,
	async () => {
		const customerId = "create-schedule-phase-anchor-mixed";
		const starter = products.pro({
			id: "starter",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const growth = products.pro({
			id: "growth",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});
		const scale = products.pro({
			id: "scale",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [starter, growth, scale] }),
			],
			actions: [],
		});

		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{ starts_at: advancedTo, plans: [{ plan_id: starter.id }] },
				{
					starts_at: advancedTo + ms.days(10),
					plans: [{ plan_id: growth.id }],
				},
				{
					starts_at: advancedTo + ms.days(40),
					billing_cycle_anchor: "phase_start",
					plans: [{ plan_id: scale.id }],
				},
			],
		});

		const [activePhase, keptPhase, resetPhase] = response.phases;
		expect(keptPhase?.starts_at).toBeDefined();
		expect(resetPhase?.starts_at).toBeDefined();

		const loadCustomerProduct = async (customerProductId?: string) => {
			const [customerProduct] = await ctx.db
				.select()
				.from(customerProducts)
				.where(eq(customerProducts.id, customerProductId ?? ""));
			return customerProduct;
		};

		const keptCustomerProduct = await loadCustomerProduct(
			keptPhase?.customer_product_ids[0],
		);
		const resetCustomerProduct = await loadCustomerProduct(
			resetPhase?.customer_product_ids[0],
		);
		expect(keptCustomerProduct?.billing_cycle_anchor_resets_at).toBeNull();
		expect(resetCustomerProduct?.billing_cycle_anchor_resets_at).toBe(
			resetPhase?.starts_at,
		);

		const activeCustomerProduct = await loadCustomerProduct(
			activePhase?.customer_product_ids[0],
		);
		const stripeSubscriptionId = activeCustomerProduct?.subscription_ids?.[0];
		expect(stripeSubscriptionId).toBeDefined();
		const stripeSubscription = await ctx.stripeCli.subscriptions.retrieve(
			stripeSubscriptionId!,
		);
		const stripeScheduleId =
			typeof stripeSubscription.schedule === "string"
				? stripeSubscription.schedule
				: stripeSubscription.schedule?.id;
		expect(stripeScheduleId).toBeDefined();

		const stripeSchedule = await ctx.stripeCli.subscriptionSchedules.retrieve(
			stripeScheduleId!,
		);
		const stripePhaseStartingAt = (startsAt?: number) =>
			stripeSchedule.phases.find(
				(phase) => Math.abs(phase.start_date * 1000 - (startsAt ?? 0)) < 60_000,
			);

		const keptStripePhase = stripePhaseStartingAt(keptPhase?.starts_at);
		const resetStripePhase = stripePhaseStartingAt(resetPhase?.starts_at);
		expect(keptStripePhase).toBeDefined();
		expect(keptStripePhase?.billing_cycle_anchor).not.toBe("phase_start");
		expect(resetStripePhase?.billing_cycle_anchor).toBe("phase_start");
	},
);
