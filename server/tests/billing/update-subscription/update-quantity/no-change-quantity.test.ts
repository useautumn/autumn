import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import {
	initScenario,
	s,
} from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";

/**
 * Subscription Update - No Change (No-Op) Tests
 *
 * These tests verify that updating to the same quantity doesn't create
 * unnecessary invoices or modify balances.
 */

test.concurrent(
	`${chalk.yellowBright("update-quantity: same quantity is no-op")}`,
	async () => {
		const customerId = "no-change-qty-noop";
		const billingUnits = 12;
		const pricePerUnit = 8;

		const prepaidItem = constructPrepaidItem({
			featureId: TestFeature.Messages,
			billingUnits,
			price: pricePerUnit,
		});

		const product = constructRawProduct({
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
						{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
					],
				}),
			],
		});

		const beforeUpdate =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const beforeFeature = beforeUpdate.features?.[TestFeature.Messages];
		const beforeInvoiceCount = beforeUpdate.invoices?.length ?? 0;

		// Update to same quantity (no-op)
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
			],
		});

		const afterUpdate =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const afterFeature = afterUpdate.features?.[TestFeature.Messages];
		const afterInvoiceCount = afterUpdate.invoices?.length ?? 0;

		// Balance should remain the same
		expect(afterFeature?.balance).toBe(beforeFeature?.balance);

		// No-op should not create a new invoice
		expect(afterInvoiceCount).toBe(beforeInvoiceCount);
	},
);
