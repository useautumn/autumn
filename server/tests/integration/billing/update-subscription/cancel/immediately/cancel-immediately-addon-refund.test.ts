// Cancel add-on immediately (`cancel: 'immediately'`): add-on removed, base product stays active.
// Paid add-ons get a refund invoice for unused time; usage overage is NOT charged.

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Basic immediate cancel - refund issued
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro ($20/mo) + recurring add-on ($20/mo)
 * - Cancel add-on immediately
 *
 * Expected Result:
 * - Add-on is removed
 * - Pro remains active
 * - Refund invoice (-$20) created for add-on
 * - No additional invoices after timeout
 */
test.concurrent(
	`${chalk.yellowBright("cancel addon immediately: basic refund")}`,
	async () => {
		const customerId = "cancel-addon-imm-1";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const pro = products.pro({ items: [messagesItem] });
		const recurringAddon = products.recurringAddOn({
			id: "recurring-addon",
			items: [messagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, recurringAddon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: recurringAddon.id }),
			],
		});

		// Verify both products are active
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [pro.id, recurringAddon.id],
		});

		// Should have 2 invoices (pro attach + addon attach)
		expectCustomerInvoiceCorrect({
			customer: customerBefore,
			count: 2,
		});

		// Cancel add-on immediately
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: recurringAddon.id,
			cancel_action: "cancel_immediately",
		});

		// Wait for async invoice processing
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Verify add-on removed, pro still active
		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfter,
			active: [pro.id],
			notPresent: [recurringAddon.id],
		});

		// Verify refund invoice (-$20) and no extra invoices
		expectCustomerInvoiceCorrect({
			customer: customerAfter,
			count: 3, // pro attach + addon attach + addon refund
			latestTotal: -20,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel with usage overage - usage NOT charged
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro (free base) + usage add-on ($20/mo base + $0.10/msg overage)
 * - Track 1000 messages (all overage since includedUsage: 0)
 * - Cancel usage add-on immediately
 *
 * Expected Result:
 * - Add-on is removed
 * - Pro remains active
 * - Only refund invoice (-$20), usage is NOT charged
 */
test.concurrent(
	`${chalk.yellowBright("cancel addon immediately: usage overage not charged")}`,
	async () => {
		const customerId = "cancel-addon-imm-2";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const pro = products.base({
			id: "pro",
			items: [messagesItem],
		});

		// Usage add-on: $20 base + consumable messages
		const usageAddon = products.base({
			id: "usage-addon",
			isAddOn: true,
			items: [
				items.monthlyPrice({ price: 20 }),
				items.consumableMessages({ includedUsage: 0 }),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, usageAddon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: usageAddon.id }),
			],
		});

		// Track 1000 messages (all overage)
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1000,
		});

		// Wait for track to process
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Cancel usage add-on immediately
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: usageAddon.id,
			cancel_action: "cancel_immediately",
		});

		// Wait for async invoice processing
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Verify add-on removed, pro still active
		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfter,
			active: [pro.id],
			notPresent: [usageAddon.id],
		});

		// Verify only refund invoice (-$20), NO usage charge
		// Invoices: addon attach ($20) + addon refund (-$20)
		expectCustomerInvoiceCorrect({
			customer: customerAfter,
			count: 2,
			latestTotal: -20,
		});
	},
);
