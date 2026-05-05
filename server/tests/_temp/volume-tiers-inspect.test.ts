/**
 * Scratch test: attach a plan with prepaid VOLUME tiers, then update
 * quantity into a higher tier. No assertions — for manual Stripe inspection.
 *
 * Tier setup (billingUnits = 100):
 *   Tier 1: 0–500 units → $10 / pack
 *   Tier 2: 501+ units  → $5  / pack
 */

import { test } from "bun:test";
import chalk from "chalk";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

test(
	`${chalk.yellowBright("volume-tiers-inspect: attach 300, update to 800")}`,
	async () => {
		const customerId = "volume-tiers-inspect";
		const initQuantity = 300; // tier 1
		const newQuantity = 800; // tier 2

		const volumeItem = items.volumePrepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			tiers: [
				{ to: 500, amount: 10 },
				{ to: "inf", amount: 5 },
			],
		});

		const product = products.base({
			id: "volume-tiers-inspect",
			items: [volumeItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.billing.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: initQuantity },
					],
				}),
			],
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: product.id,
			options: [{ feature_id: TestFeature.Messages, quantity: newQuantity }],
		});
	},
);
