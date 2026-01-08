import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	findPriceByFeatureId,
	priceToLineAmount,
} from "@autumn/shared";
import { expectLatestInvoiceCorrect } from "@tests/billing/utils/expectLatestInvoiceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

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

		// Get price for invoice validation
		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: product.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const prepaidMessagesPrice = findPriceByFeatureId({
			prices: fullProduct.prices,
			featureId: TestFeature.Messages,
		});

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

		// Expect credit invoice for downgrade (20 -> 5 = -15 units)
		const expectedAmount = priceToLineAmount({
			price: prepaidMessagesPrice!,
			overage: -15 * billingUnits,
		});

		expectLatestInvoiceCorrect({
			customer,
			productId: product.id,
			amount: expectedAmount,
		});
	},
);
