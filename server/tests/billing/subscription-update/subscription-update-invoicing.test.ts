import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0";

const billingUnits = 12;
const pricePerUnit = 8;

/**
 * Subscription Update - Invoice Generation Tests
 *
 * These tests verify that subscription updates correctly generate invoices
 * when required, and respect flags like finalize_invoice that control
 * invoice creation and finalization behavior.
 */

describe(`${chalk.yellowBright("subscription-update: invoice generation")}`, () => {
	const customerId = "sub-update-invoices";
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	const prepaidProduct = constructRawProduct({
		id: "prepaid_messages",
		items: [
			constructPrepaidItem({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [prepaidProduct],
			prefix: customerId,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: prepaidProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 10 * billingUnits,
				},
			],
		});
	});

	test("should create invoice on quantity upgrade", async () => {
		const beforeUpdate = await autumnV1.customers.get<ApiCustomer>(customerId);
		const invoiceCountBefore = beforeUpdate.invoices?.length || 0;

		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: prepaidProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 20 * billingUnits,
				},
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
	});

	test("should not create invoice when finalize_invoice is false", async () => {
		const beforeUpdate = await autumnV1.customers.get<ApiCustomer>(customerId);
		const invoiceCountBefore = beforeUpdate.invoices?.length || 0;

		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: prepaidProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 25 * billingUnits,
				},
			],
			finalize_invoice: false,
		});

		const afterUpdate = await autumnV1.customers.get<ApiCustomer>(customerId);
		const invoiceCountAfter = afterUpdate.invoices?.length || 0;

		// Should not have created a finalized invoice
		expect(invoiceCountAfter).toBe(invoiceCountBefore);

		// But balance should still be updated
		const balance = afterUpdate.balances?.[TestFeature.Messages];
		expect(balance?.purchased_balance).toBe(25 * billingUnits);
	});
});
