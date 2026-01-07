import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import {
	initScenario,
	s,
} from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";

const billingUnits = 12;
const pricePerUnit = 8;

/**
 * Subscription Update - Invoice Generation Tests
 *
 * These tests verify that subscription updates correctly generate invoices
 * when required, and respect flags like finalize_invoice that control
 * invoice creation and finalization behavior.
 */

test.concurrent(
	`${chalk.yellowBright("update-quantity: create invoice on upgrade")}`,
	async () => {
		const customerId = "invoicing-upgrade";

		const product = constructRawProduct({
			id: "prepaid",
			items: [
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					billingUnits,
					price: pricePerUnit,
				}),
			],
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
						{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
					],
				}),
			],
		});

		const beforeUpdate = await autumnV1.customers.get<ApiCustomer>(customerId);
		const invoiceCountBefore = beforeUpdate.invoices?.length || 0;

		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
			],
		});

		const afterUpdate = await autumnV1.customers.get<ApiCustomer>(customerId);
		const invoiceCountAfter = afterUpdate.invoices?.length || 0;

		// Should have created a new prorated invoice
		expect(invoiceCountAfter).toBeGreaterThan(invoiceCountBefore);

		const latestInvoice = afterUpdate.invoices?.[0];
		expect(latestInvoice).toBeDefined();
		expect(latestInvoice?.status).toBe("paid");
		// Invoice total should be prorated amount for 10 additional units
		expect(latestInvoice?.total).toBeGreaterThan(0);
	},
);
