/**
 * Attach Add-on Tests (Attach V2)
 *
 * Tests for attaching add-on products to customers.
 * Add-ons are additive - they never expire/cancel existing products.
 *
 * Key behaviors:
 * - Add-ons are always attached (never replace existing products)
 * - Features from add-ons combine with main product features
 * - Re-attaching same add-on creates separate customer_product records
 * - Multiple different add-ons can coexist
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: One-off add-on to Free customer (with payment method)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product with payment method
 * - Attach one-off add-on ($10 base + prepaid)
 *
 * Expected:
 * - Both products active
 * - Invoice for add-on only
 */
test.concurrent(
	`${chalk.yellowBright("addon 4: one-off addon to free")}`,
	async () => {
		const customerId = "addon-oneoff-to-free";

		const messagesItem = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({ id: "free", items: [messagesItem] });

		const oneOffWordsItem = items.oneOffWords({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const oneOffAddon = products.oneOffAddOn({
			id: "oneoff-addon",
			items: [oneOffWordsItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, oneOffAddon] }),
			],
			actions: [s.billing.attach({ productId: free.id })],
		});

		// Preview add-on - $10 base + $10 for 100 words = $20
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: oneOffAddon.id,
			options: [{ feature_id: TestFeature.Words, quantity: 100 }],
		});
		expect(preview.total).toBe(20);

		// Attach one-off add-on
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOffAddon.id,
			options: [{ feature_id: TestFeature.Words, quantity: 100 }],
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Both products active
		await expectCustomerProducts({
			customer,
			active: [free.id, oneOffAddon.id],
		});

		// Words from one-off add-on
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			balance: 100,
			usage: 0,
		});

		// 1 invoice for add-on ($20)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 20,
		});
	},
);
