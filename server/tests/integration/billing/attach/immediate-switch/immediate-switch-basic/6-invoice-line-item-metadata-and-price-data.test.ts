/**
 * Immediate Switch Basic Tests (Attach V2)
 *
 * Tests for basic upgrade scenarios where a higher-tier product takes effect immediately.
 *
 * Key behaviors:
 * - Upgrade replaces existing product immediately
 * - Prorated charge for price difference
 * - Scheduled downgrades are cancelled when upgrading
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, atmnToStripeAmount } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Invoice line item metadata and price_data
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product
 * - Upgrade to pro with invoice mode
 *
 * Expected Result:
 * - Invoice line items have correct metadata:
 *   - autumn_product_id
 *   - autumn_price_id
 *   - stripe_product_id (when available)
 * - Line items with positive amounts use price_data (when stripe_product_id exists)
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-basic 6: invoice line item metadata and price_data")}`,
	async () => {
		const customerId = "imm-switch-metadata-price-data";

		const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({
			id: "pro",
			items: [proMessagesItem],
		});

		const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
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
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Upgrade from pro to premium with invoice mode to get invoice response
		const result = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			// invoice: true,
			// finalize_invoice: true,
			// enable_product_immediately: true,
			redirect_mode: "if_required",
		});

		// Verify invoice was created
		expect(result.invoice).toBeDefined();
		expect(result.invoice!.stripe_id).toBeDefined();

		// Retrieve the Stripe invoice with line items expanded
		const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
			result.invoice!.stripe_id,
			{ expand: ["lines.data"] },
		);

		// Verify invoice has line items (charge for premium, refund for pro)
		expect(stripeInvoice.lines.data.length).toBeGreaterThan(0);

		// Check each line item for metadata and price_data
		for (const lineItem of stripeInvoice.lines.data) {
			const metadata = lineItem.metadata;

			// Verify autumn metadata is present
			expect(metadata).toBeDefined();
			expect(metadata?.autumn_product_id).toBeDefined();
			expect(metadata?.autumn_price_id).toBeDefined();

			// Verify shouldUsePriceData logic:
			// - Positive amounts with stripe_product_id should use price_data
			// - This manifests as the line having pricing.price_details with product reference
			// - Negative amounts (refunds) should NOT have price_data
			if (lineItem.amount > 0 && metadata?.stripe_product_id) {
				expect(lineItem.pricing?.price_details).toBeDefined();
				expect(lineItem.pricing?.price_details?.product).toBe(
					metadata.stripe_product_id,
				);
			}
		}

		// Verify the total is correct (upgrade from $20 to $50 = $30 difference)
		expect(stripeInvoice.total).toBe(
			atmnToStripeAmount({ amount: 30, currency: "usd" }),
		);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Verify product states
		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});
	},
);
