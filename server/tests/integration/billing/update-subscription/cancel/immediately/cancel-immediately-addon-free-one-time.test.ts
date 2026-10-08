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
// TEST 3: Cancel free add-on - premium unaffected
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach premium ($30/mo) + free add-on (no base price)
 * - Cancel free add-on immediately
 *
 * Expected Result:
 * - Free add-on is removed
 * - Premium remains active
 * - No new invoices (add-on was free)
 */
test.concurrent(
	`${chalk.yellowBright("cancel addon immediately: free addon cancel")}`,
	async () => {
		const customerId = "cancel-addon-imm-3";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const premium = products.base({
			id: "premium",
			items: [messagesItem, items.monthlyPrice({ price: 30 })],
		});

		const freeAddon = products.base({
			id: "free-addon",
			isAddOn: true,
			items: [messagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, freeAddon] }),
			],
			actions: [
				s.attach({ productId: premium.id }),
				s.attach({ productId: freeAddon.id }),
			],
		});

		// Verify both products active, 1 invoice (premium only)
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [premium.id, freeAddon.id],
		});
		expectCustomerInvoiceCorrect({
			customer: customerBefore,
			count: 1, // Only premium attach (free addon has no invoice)
			latestTotal: 30,
		});

		// Cancel free add-on immediately
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: freeAddon.id,
			cancel_action: "cancel_immediately",
		});

		// Wait for processing
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Verify free add-on removed, premium still active
		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfter,
			active: [premium.id],
			notPresent: [freeAddon.id],
		});

		// No new invoices (free add-on has no refund)
		expectCustomerInvoiceCorrect({
			customer: customerAfter,
			count: 1,
			latestTotal: 30,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: One-time add-on cancel - other add-on remains
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach one-time add-on (oneOffMessages) + pro add-on ($20/mo)
 * - Cancel one-time add-on immediately
 *
 * Expected Result:
 * - One-time add-on removed
 * - Pro add-on still active
 */
test.concurrent(
	`${chalk.yellowBright("cancel addon immediately: one-time addon cancel")}`,
	async () => {
		const customerId = "cancel-addon-imm-8";

		const oneTimeAddon = products.base({
			id: "one-time-addon",
			isAddOn: true,
			items: [items.oneOffMessages({ price: 20, billingUnits: 100 })],
		});

		const proAddon = products.recurringAddOn({
			id: "pro-addon",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [oneTimeAddon, proAddon] }),
			],
			actions: [
				s.attach({
					productId: oneTimeAddon.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
				s.attach({ productId: proAddon.id }),
			],
		});

		// Verify both add-ons active
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [oneTimeAddon.id, proAddon.id],
		});

		// Cancel one-time add-on immediately
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: oneTimeAddon.id,
			cancel_action: "cancel_immediately",
		});

		// Wait for processing
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Verify one-time addon removed, pro addon still active
		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfter,
			active: [proAddon.id],
			notPresent: [oneTimeAddon.id],
		});
	},
);
