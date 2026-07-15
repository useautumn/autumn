/**
 * TDD test for plan billing controls disappearing after a Stripe test-clock advance.
 *
 * Red-failure mode (current behavior):
 *  - An immediately attached active plan starts in Stripe's future clock, so its spend limit is omitted.
 *
 * Green-success criteria (after fix):
 *  - The active plan's spend limit remains present in the customer response.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	CusProductStatus,
	customerProducts,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";

test.concurrent(
	`${chalk.yellowBright("plan spend limit test clock: immediate attach keeps active plan controls after clock advance")}`,
	async () => {
		const customerId = "plan-spend-limit-test-clock";
		const initialPlan = products.pro({
			id: "initial",
			items: [items.consumableMessages({ includedUsage: 100, price: 0.5 })],
		});
		const controlledPlan = products.pro({
			id: "controlled",
			items: [items.consumableMessages({ includedUsage: 200, price: 0.5 })],
			billingControls: {
				spend_limits: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						overage_limit: 25,
					},
				],
			},
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [initialPlan, controlledPlan] }),
			],
			actions: [
				s.billing.attach({ productId: initialPlan.id }),
				s.advanceTestClock({ months: 1, waitForSeconds: 30 }),
				s.billing.attach({
					productId: controlledPlan.id,
					planSchedule: "immediate",
				}),
			],
		});

		const [activeControlledPlan] = await ctx.db
			.select({
				status: customerProducts.status,
				startsAt: customerProducts.starts_at,
			})
			.from(customerProducts)
			.where(
				and(
					eq(customerProducts.customer_id, customerId),
					eq(customerProducts.product_id, controlledPlan.id),
					eq(customerProducts.status, CusProductStatus.Active),
				),
			);

		expect(activeControlledPlan?.startsAt).toBeGreaterThan(Date.now());

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});

		expect(customer.billing_controls?.spend_limits ?? []).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				enabled: true,
				overage_limit: 25,
				source: "plan",
			}),
		);
	},
	300_000,
);
