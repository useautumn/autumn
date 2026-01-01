import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { completeInvoiceCheckout } from "@tests/utils/stripeUtils/completeInvoiceCheckout.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { timeout } from "@/utils/genUtils.js";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0";

const billingUnits = 12;
const pricePerUnit = 8;

describe(`${chalk.yellowBright("subscription-update: invoice mode - default behavior (draft invoice, immediate entitlements)")}`, () => {
	const customerId = "sub-update-invoice-default";
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

	test("should default to draft invoice with immediate entitlements when only invoice: true is passed", async () => {
		const beforeUpdate = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const customerProduct = beforeUpdate.customer_products.find(
			(cp) => cp.product.id === prepaidProduct.id,
		);
		const beforeEntitlement = customerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const beforeBalance = beforeEntitlement?.balance || 0;

		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: prepaidProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 15 * billingUnits,
				},
			],
			invoice: true,
		});

		const afterUpdate = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const afterCustomerProduct = afterUpdate.customer_products.find(
			(cp) => cp.product.id === prepaidProduct.id,
		);
		const afterEntitlement = afterCustomerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const afterBalance = afterEntitlement?.balance || 0;

		expect(afterBalance).toBe(beforeBalance + 60);

		const customer = await autumnV1.customers.get<ApiCustomer>(customerId);
		const balance = customer.balances?.[TestFeature.Messages];
		expect(balance?.purchased_balance).toBe(180);

		const draftInvoice = customer.invoices?.find(
			(inv) => inv.status === "draft",
		);
		expect(draftInvoice).toBeDefined();
	});
});

describe(`${chalk.yellowBright("subscription-update: invoice mode - draft invoice with immediate entitlements (explicit)")}`, () => {
	const customerId = "sub-update-invoice-draft";
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

	test("should create draft invoice and update entitlements immediately", async () => {
		const beforeUpdate = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const customerProduct = beforeUpdate.customer_products.find(
			(cp) => cp.product.id === prepaidProduct.id,
		);
		const beforeEntitlement = customerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const beforeBalance = beforeEntitlement?.balance || 0;

		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: prepaidProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 15 * billingUnits, // +5 units
				},
			],
			invoice: true,
			finalize_invoice: false,
			enable_product_immediately: true,
		});

		// Entitlements should be updated immediately
		const afterUpdate = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const afterCustomerProduct = afterUpdate.customer_products.find(
			(cp) => cp.product.id === prepaidProduct.id,
		);
		const afterEntitlement = afterCustomerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const afterBalance = afterEntitlement?.balance || 0;

		// +5 units × 12 billing_units = +60 messages
		expect(afterBalance).toBe(beforeBalance + 60);

		// Verify via API that balance is updated and invoice is draft
		const customer = await autumnV1.customers.get<ApiCustomer>(customerId);
		const balance = customer.balances?.[TestFeature.Messages];
		expect(balance?.purchased_balance).toBe(180); // 15 units × 12 = 180

		const draftInvoice = customer.invoices?.find(
			(inv) => inv.status === "draft",
		);
		expect(draftInvoice).toBeDefined();
	});
});

describe(`${chalk.yellowBright("subscription-update: invoice mode - finalized invoice with immediate entitlements")}`, () => {
	const customerId = "sub-update-invoice-finalized";
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

	test("should finalize invoice immediately and update entitlements", async () => {
		const beforeUpdate = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const customerProduct = beforeUpdate.customer_products.find(
			(cp) => cp.product.id === prepaidProduct.id,
		);
		const beforeEntitlement = customerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const beforeBalance = beforeEntitlement?.balance || 0;

		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: prepaidProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 20 * billingUnits, // +10 units
				},
			],
			invoice: true,
			finalize_invoice: true,
			enable_product_immediately: true,
		});

		// Entitlements should be updated immediately
		const afterUpdate = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const afterCustomerProduct = afterUpdate.customer_products.find(
			(cp) => cp.product.id === prepaidProduct.id,
		);
		const afterEntitlement = afterCustomerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const afterBalance = afterEntitlement?.balance || 0;

		// +10 units × 12 billing_units = +120 messages
		expect(afterBalance).toBe(beforeBalance + 120);

		// Verify via API that balance is updated and invoice is paid
		const customer = await autumnV1.customers.get<ApiCustomer>(customerId);
		const balance = customer.balances?.[TestFeature.Messages];
		expect(balance?.purchased_balance).toBe(240); // 20 units × 12 = 240

		const paidInvoice = customer.invoices?.find(
			(inv) => inv.status === "paid",
		);
		expect(paidInvoice).toBeDefined();
	});
});

describe(`${chalk.yellowBright("subscription-update: invoice mode - entitlements after payment")}`, () => {
	const customerId = "sub-update-invoice-payment-required";
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

	test("should not update entitlements until payment is received via checkout", async () => {
		const beforeUpdate = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const customerProduct = beforeUpdate.customer_products.find(
			(cp) => cp.product.id === prepaidProduct.id,
		);
		const beforeEntitlement = customerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const beforeBalance = beforeEntitlement?.balance || 0;

		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: prepaidProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 25 * billingUnits, // +15 units
				},
			],
			invoice: true,
			finalize_invoice: true,
			enable_product_immediately: false,
		});

		// Entitlements should NOT be updated yet (waiting for payment)
		const afterUpdate = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const afterCustomerProduct = afterUpdate.customer_products.find(
			(cp) => cp.product.id === prepaidProduct.id,
		);
		const afterEntitlement = afterCustomerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const afterBalance = afterEntitlement?.balance || 0;

		// Balance should remain unchanged until payment
		expect(afterBalance).toBe(beforeBalance);

		// Verify via API that balance is NOT updated and invoice is open
		const customer = await autumnV1.customers.get<ApiCustomer>(customerId);
		const balance = customer.balances?.[TestFeature.Messages];
		expect(balance?.purchased_balance).toBe(120); // Still 10 units × 12 = 120

		const openInvoice = customer.invoices?.find(
			(inv) => inv.status === "open",
		);
		expect(openInvoice).toBeDefined();
		expect(openInvoice?.hosted_invoice_url).toBeDefined();

		// Complete payment via checkout using Puppeteer
		await completeInvoiceCheckout({
			url: openInvoice!.hosted_invoice_url!,
		});

		// Wait for webhook processing
		await timeout(10000);

		// Entitlements should now be updated after payment
		const afterPayment = await CusService.getFull({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const paidCustomerProduct = afterPayment.customer_products.find(
			(cp) => cp.product.id === prepaidProduct.id,
		);
		const paidEntitlement = paidCustomerProduct?.customer_entitlements.find(
			(ent) => ent.entitlement.feature_id === TestFeature.Messages,
		);
		const paidBalance = paidEntitlement?.balance || 0;

		// +15 units × 12 billing_units = +180 messages
		expect(paidBalance).toBe(beforeBalance + 180);

		// Verify via API that balance is now updated and invoice is paid
		const customerAfterPayment =
			await autumnV1.customers.get<ApiCustomer>(customerId);
		const balanceAfterPayment =
			customerAfterPayment.balances?.[TestFeature.Messages];
		expect(balanceAfterPayment?.purchased_balance).toBe(300); // 25 units × 12 = 300

		// All invoices should now be paid
		const unpaidInvoices = customerAfterPayment.invoices?.filter(
			(inv) => inv.status !== "paid",
		);
		expect(unpaidInvoices?.length ?? 0).toBe(0);
	});
});
