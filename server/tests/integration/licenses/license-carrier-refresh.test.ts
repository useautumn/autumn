/**
 * Carrier convergence for priced licenses: an existing carrier picks up
 * license price changes on the next reconcile (stale-carrier update), and
 * repeated reconciles with no changes do not churn the carrier.
 */

import { expect, test } from "bun:test";
import { customerProducts, customers } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

test.concurrent(
	`${chalk.yellowBright("licenses-carrier: price edit refreshes the carrier; unchanged reconciles do not churn")}`,
	async () => {
		const customerId = "license-carrier-refresh";
		const parent = products.base({
			id: "carrier-refresh-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "carrier-refresh-seat",
			items: [items.consumableMessages({ price: 0.1 })],
		});

		const { entities, autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [parent, license] }),
			],
			actions: [s.billing.attach({ productId: parent.id })],
		});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: parent.id,
			license_plan_id: license.id,
			included: 1,
		});
		await autumnV2_2.post("/licenses.attach", {
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: license.id,
		});

		const customer = await ctx.db.query.customers.findFirst({
			where: and(
				eq(customers.id, customerId),
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
			),
		});
		const fetchCarrier = async () =>
			await ctx.db.query.customerProducts.findFirst({
				where: and(
					eq(customerProducts.internal_customer_id, customer?.internal_id ?? ""),
					isNotNull(customerProducts.license_parent_customer_product_id),
					isNull(customerProducts.internal_entity_id),
					eq(customerProducts.status, "active"),
				),
				with: { customer_prices: { with: { price: true } } },
			});
		const carrier = await fetchCarrier();
		expect(carrier).toBeDefined();

		await autumnV1.products.update(license.id, {
			items: [items.consumableMessages({ price: 0.25 })],
		});
		await autumnV2_2.post("/licenses.list_pools", { customer_id: customerId });

		const refreshed = await fetchCarrier();
		expect(refreshed).toBeDefined();
		const amounts = (
			refreshed as unknown as {
				customer_prices: { price: { config: { usage_tiers?: { amount: number }[] } } }[];
			}
		).customer_prices.map(
			(customerPrice) =>
				customerPrice.price.config.usage_tiers?.[0]?.amount ??
				(customerPrice.price.config as { amount?: number }).amount,
		);
		expect(amounts).toContain(0.25);

		const before = await fetchCarrier();
		await autumnV2_2.post("/licenses.list_pools", { customer_id: customerId });
		await autumnV2_2.post("/licenses.list_pools", { customer_id: customerId });
		const after = await fetchCarrier();
		expect(after?.id).toBe(before?.id ?? "");
		expect(after?.updated_at).toEqual(before?.updated_at);
	},
);
