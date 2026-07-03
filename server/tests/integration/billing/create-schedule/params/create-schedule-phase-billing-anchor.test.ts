// Regression: phase-level billing_cycle_anchor must persist the phase-start
// reset timestamp so Stripe schedule phases can reset anchors.

import { expect, test } from "bun:test";
import { customerProducts, ms } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";

test.concurrent(
	`${chalk.yellowBright("create-schedule phase billing anchor: scheduled phase can reset anchor at phase start")}`,
	async () => {
		const customerId = "create-schedule-phase-anchor-reset";
		const starter = products.pro({
			id: "starter",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const commercial = products.premium({
			id: "commercial-quarterly",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [starter, commercial] }),
			],
			actions: [s.billing.attach({ productId: starter.id })],
		});

		const phaseStartsAt = advancedTo + ms.days(30);
		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
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

		const [scheduledCustomerProduct] = await ctx.db
			.select()
			.from(customerProducts)
			.where(eq(customerProducts.id, scheduledCustomerProductId!));

		expect(scheduledCustomerProduct?.billing_cycle_anchor_resets_at).toBe(
			phaseStartsAt,
		);
	},
);
