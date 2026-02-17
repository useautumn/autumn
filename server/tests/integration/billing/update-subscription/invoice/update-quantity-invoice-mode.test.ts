import { expect, test } from "bun:test";
import { type ApiCustomerV3, CusExpand } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { completeInvoiceCheckout } from "@tests/utils/stripeUtils/completeInvoiceCheckout.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import { timeout } from "@/utils/genUtils.js";

const billingUnits = 12;

/**
 * Invoice Mode Tests
 *
 * These tests verify different invoice mode configurations:
 * - Default: draft invoice with immediate entitlements
 * - Draft invoice with immediate entitlements (explicit)
 * - Finalized invoice with immediate entitlements
 * - Entitlements after payment (via checkout)
 */

test.concurrent(`${chalk.yellowBright("update-quantity: default invoice mode (draft, immediate entitlements)")}`, async () => {
	const customerId = "inv-mode-default";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
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

	const beforeUpdate = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const customerProduct = beforeUpdate.customer_products.find(
		(cp) => cp.product.id === product.id,
	);
	const beforeEntitlement = customerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const beforeBalance = beforeEntitlement?.balance || 0;

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 15 * billingUnits },
		],
		invoice: true,
		enable_product_immediately: true,
		finalize_invoice: false,
	});

	const afterUpdate = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
		expand: [CusExpand.Invoices],
	});

	const afterCustomerProduct = afterUpdate.customer_products.find(
		(cp) => cp.product.id === product.id,
	);
	const afterEntitlement = afterCustomerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const afterBalance = afterEntitlement?.balance || 0;

	expect(afterBalance).toBe(beforeBalance + 60);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const feature = customer.features?.[TestFeature.Messages];
	expect(feature?.balance).toBe(180);

	const draftInvoice = customer.invoices?.find((inv) => inv.status === "draft");
	expect(draftInvoice).toBeDefined();
});

test.concurrent(`${chalk.yellowBright("update-quantity: draft invoice with immediate entitlements (explicit)")}`, async () => {
	const customerId = "inv-mode-draft-explicit";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
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

	const beforeUpdate = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const customerProduct = beforeUpdate.customer_products.find(
		(cp) => cp.product.id === product.id,
	);
	const beforeEntitlement = customerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const beforeBalance = beforeEntitlement?.balance || 0;

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 15 * billingUnits },
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
		(cp) => cp.product.id === product.id,
	);
	const afterEntitlement = afterCustomerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const afterBalance = afterEntitlement?.balance || 0;

	// +5 units × 12 billing_units = +60 messages
	expect(afterBalance).toBe(beforeBalance + 60);

	// Verify via API that balance is updated and invoice is draft
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const feature = customer.features?.[TestFeature.Messages];
	expect(feature?.balance).toBe(180); // 15 units × 12 = 180

	const draftInvoice = customer.invoices?.find((inv) => inv.status === "draft");
	expect(draftInvoice).toBeDefined();
});

test.concurrent(`${chalk.yellowBright("update-quantity: finalized invoice with immediate entitlements")}`, async () => {
	const customerId = "inv-mode-finalized";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
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

	const beforeUpdate = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const customerProduct = beforeUpdate.customer_products.find(
		(cp) => cp.product.id === product.id,
	);
	const beforeEntitlement = customerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const beforeBalance = beforeEntitlement?.balance || 0;

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
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
		(cp) => cp.product.id === product.id,
	);
	const afterEntitlement = afterCustomerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const afterBalance = afterEntitlement?.balance || 0;

	// +10 units × 12 billing_units = +120 messages
	expect(afterBalance).toBe(beforeBalance + 120);

	// Verify via API that balance is updated and invoice is paid
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const feature = customer.features?.[TestFeature.Messages];
	expect(feature?.balance).toBe(240); // 20 units × 12 = 240

	const paidInvoice = customer.invoices?.find((inv) => inv.status === "paid");
	expect(paidInvoice).toBeDefined();
});

test.concurrent(`${chalk.yellowBright("update-quantity: entitlements after payment via checkout")}`, async () => {
	const customerId = "inv-mode-payment-required";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
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

	const beforeUpdate = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const customerProduct = beforeUpdate.customer_products.find(
		(cp) => cp.product.id === product.id,
	);
	const beforeEntitlement = customerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const beforeBalance = beforeEntitlement?.balance || 0;

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: 25 * billingUnits },
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
		(cp) => cp.product.id === product.id,
	);
	const afterEntitlement = afterCustomerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const afterBalance = afterEntitlement?.balance || 0;

	// Balance should remain unchanged until payment
	expect(afterBalance).toBe(beforeBalance);

	// Verify via API that balance is NOT updated and invoice is open
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const feature = customer.features?.[TestFeature.Messages];
	expect(feature?.balance).toBe(120); // Still 10 units × 12 = 120

	const openInvoice = customer.invoices?.find((inv) => inv.status === "open");
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
		(cp) => cp.product.id === product.id,
	);
	const paidEntitlement = paidCustomerProduct?.customer_entitlements.find(
		(ent) => ent.entitlement.feature_id === TestFeature.Messages,
	);
	const paidBalance = paidEntitlement?.balance || 0;

	// +15 units × 12 billing_units = +180 messages
	expect(paidBalance).toBe(beforeBalance + 180);

	// Verify via API that balance is now updated and invoice is paid
	const customerAfterPayment =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const featureAfterPayment =
		customerAfterPayment.features?.[TestFeature.Messages];
	expect(featureAfterPayment?.balance).toBe(300); // 25 units × 12 = 300

	// All invoices should now be paid
	const unpaidInvoices = customerAfterPayment.invoices?.filter(
		(inv) => inv.status !== "paid",
	);
	expect(unpaidInvoices?.length ?? 0).toBe(0);
});
