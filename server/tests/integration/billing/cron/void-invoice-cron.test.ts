/**
 * Void Invoice Cron Tests
 *
 * Tests that the handleVoidInvoiceCron function correctly voids open invoices
 * from failed payment attempts (e.g., 3DS required but not completed).
 *
 * Migrated from: invoice-action-required2.test.ts
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { handleVoidInvoiceCron } from "@/cron/invoiceCron/runInvoiceCron";
import { MetadataService } from "@/internal/metadata/MetadataService";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Void open invoice from failed upgrade
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro with success PM
 * - Swap to authenticate PM
 * - Upgrade to premium → open invoice (checkout_url returned)
 * - Retrieve Stripe invoice, get autumn metadata
 * - Call handleVoidInvoiceCron → invoice voided
 * - Verify customer reflects voided invoice
 */
test.concurrent(`${chalk.yellowBright("void-invoice-cron 1: void open invoice from failed upgrade")}`, async () => {
	const customerId = "void-invoice-cron-upgrade";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({
		includedUsage: 100,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "authenticate" }),
		],
	});

	// Upgrade to premium — should fail with checkout_url
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
	});

	// Verify open invoice on customer
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customer.invoices?.[0].status).toBe("open");

	// Get the Stripe invoice and its autumn metadata
	const stripeInvoices = await ctx.stripeCli.invoices.list({
		customer: customer.stripe_id!,
	});
	const latestInvoice = stripeInvoices.data[0];

	expect(latestInvoice.metadata?.autumn_metadata_id).toBeDefined();

	const metadata = await MetadataService.get({
		db: ctx.db,
		id: latestInvoice.metadata?.autumn_metadata_id ?? "",
	});

	expect(metadata).toBeDefined();

	// Run the void invoice cron handler
	await handleVoidInvoiceCron({
		metadata: metadata!,
		ctx,
	});

	// Verify the Stripe invoice is now voided
	const voidedInvoice = await ctx.stripeCli.invoices.retrieve(latestInvoice.id);
	expect(voidedInvoice.status).toBe("void");

	// Wait for cache to update, then verify customer reflects voided status
	await timeout(3000);
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfter.invoices?.[0].status).toBe("void");
});
