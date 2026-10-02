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
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Recurring add-on to Pro customer
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro ($20/mo) with 100 messages
 * - Attach recurring add-on ($20/mo) with 200 words
 *
 * Expected:
 * - Both Pro and add-on active on same subscription
 * - Combined monthly charge ($40/mo)
 */
test.concurrent(
	`${chalk.yellowBright("addon 5: recurring addon to pro")}`,
	async () => {
		const customerId = "addon-recurring-to-pro";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro", items: [messagesItem] });

		const wordsItem = items.monthlyWords({ includedUsage: 200 });
		const recurringAddon = products.recurringAddOn({
			id: "recurring-addon",
			items: [wordsItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, recurringAddon] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Preview add-on - $20/mo
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: recurringAddon.id,
		});
		expect(preview.total).toBe(20);

		// Attach recurring add-on
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: recurringAddon.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Both products active
		await expectCustomerProducts({
			customer,
			active: [pro.id, recurringAddon.id],
		});

		// Messages from Pro
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// Words from recurring add-on
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			includedUsage: 200,
			balance: 200,
			usage: 0,
		});

		// 2 invoices: Pro ($20) + add-on ($20)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 20,
		});

		// Verify subscription has both products
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
