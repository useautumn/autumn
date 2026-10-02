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
// TEST 2: Free add-on to Free customer
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product with 50 messages
 * - Attach free add-on with 100 words
 *
 * Expected:
 * - Both products active
 * - No invoices (both free)
 */
test.concurrent(
	`${chalk.yellowBright("addon 2: free addon to free")}`,
	async () => {
		const customerId = "addon-free-to-free";

		const messagesItem = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({ id: "free", items: [messagesItem] });

		const wordsItem = items.monthlyWords({ includedUsage: 100 });
		const freeAddon = products.base({
			id: "free-addon",
			items: [wordsItem],
			isAddOn: true,
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [free, freeAddon] })],
			actions: [s.billing.attach({ productId: free.id })],
		});

		// Preview add-on - should be free
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: freeAddon.id,
		});
		expect(preview.total).toBe(0);

		// Attach free add-on
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: freeAddon.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Both products active
		await expectCustomerProducts({
			customer,
			active: [free.id, freeAddon.id],
		});

		// Messages from free
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 50,
			balance: 50,
			usage: 0,
		});

		// Words from add-on
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// No invoices (both free)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 0,
		});
	},
);
