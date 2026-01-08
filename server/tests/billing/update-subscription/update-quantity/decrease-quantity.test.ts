import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectLatestInvoiceCorrect } from "@tests/billing/utils/expectLatestInvoiceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Subscription Update - Decrease Quantity Tests
 *
 * These tests verify quantity downgrades:
 * - Basic single-feature downgrade (20 → 5 units)
 */

test.concurrent(
	`${chalk.yellowBright("update-quantity: downgrade 20 to 5 units")}`,
	async () => {
		const customerId = "dec-qty-basic-downgrade";
		const billingUnits = 12;
		const pricePerUnit = 8;

		const prepaidItem = items.prepaid({
			featureId: TestFeature.Messages,
			billingUnits,
			price: pricePerUnit,
		});

		const product = products.base({
			id: "prepaid",
			items: [prepaidItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
					],
				}),
			],
		});

		// Preview the downgrade
		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
			],
		});

		// Verify preview total matches expected (20 -> 5 = -15 units * $8)
		expect(preview.total).toBe(-15 * pricePerUnit);

		// Downgrade from 20 to 5 units
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const feature = customer.features?.[TestFeature.Messages];

		// Should have 60 messages (5 units × 12 billing_units)
		expect(feature?.balance).toBe(60);

		// Expect credit invoice for downgrade (20 -> 5 = -15 units * $8)
		expectLatestInvoiceCorrect({
			customer,
			productId: product.id,
			amount: -15 * pricePerUnit,
		});
	},
);
