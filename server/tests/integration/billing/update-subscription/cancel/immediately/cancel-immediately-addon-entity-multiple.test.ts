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
// TEST 5: Cancel entity product - entity's base product unaffected
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create entity
 * - Attach pro ($20/mo) to entity
 * - Attach recurring add-on ($20/mo) to entity
 * - Cancel add-on immediately (with entity_id)
 *
 * Expected Result:
 * - Entity's pro still active
 * - Add-on removed from entity
 */
test.concurrent(
	`${chalk.yellowBright("cancel addon immediately: entity product cancel")}`,
	async () => {
		const customerId = "cancel-addon-imm-5";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const pro = products.pro({ items: [messagesItem] });
		const recurringAddon = products.recurringAddOn({
			id: "recurring-addon",
			items: [messagesItem],
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, recurringAddon] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: recurringAddon.id, entityIndex: 0 }),
			],
		});

		// Verify both products attached to entity
		const entityBefore = await autumnV1.entities.get(
			customerId,
			entities[0].id,
		);
		await expectCustomerProducts({
			customer: entityBefore,
			active: [pro.id, recurringAddon.id],
		});

		// Cancel add-on immediately for entity
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entities[0].id,
			product_id: recurringAddon.id,
			cancel_action: "cancel_immediately",
		});

		// Wait for processing
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Verify entity's pro still active, addon removed
		const entityAfter = await autumnV1.entities.get(customerId, entities[0].id);
		await expectCustomerProducts({
			customer: entityAfter,
			active: [pro.id],
			notPresent: [recurringAddon.id],
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Multiple add-ons - cancel one, other remains
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach recurring add-on ($20/mo) + pro add-on ($20/mo)
 * - Cancel pro add-on immediately
 *
 * Expected Result:
 * - Recurring add-on still active
 * - Pro add-on removed
 * - Refund invoice (-$20) for pro add-on
 */
test.concurrent(
	`${chalk.yellowBright("cancel addon immediately: multiple addons cancel one")}`,
	async () => {
		const customerId = "cancel-addon-imm-7";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const recurringAddon = products.recurringAddOn({
			id: "recurring-addon",
			items: [messagesItem],
		});

		const proAddon = products.recurringAddOn({
			id: "pro-addon",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [recurringAddon, proAddon] }),
			],
			actions: [
				s.attach({ productId: recurringAddon.id }),
				s.attach({ productId: proAddon.id }),
			],
		});

		// Verify both add-ons active
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [recurringAddon.id, proAddon.id],
		});

		// Should have 2 invoices (both add-ons attach)
		expectCustomerInvoiceCorrect({
			customer: customerBefore,
			count: 2,
		});

		// Cancel pro add-on immediately
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: proAddon.id,
			cancel_action: "cancel_immediately",
		});

		// Wait for processing
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Verify recurring addon still active, pro addon removed
		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfter,
			active: [recurringAddon.id],
			notPresent: [proAddon.id],
		});

		// Verify refund invoice (-$20)
		expectCustomerInvoiceCorrect({
			customer: customerAfter,
			count: 3, // recurring attach + pro attach + pro refund
			latestTotal: -20,
		});
	},
);
