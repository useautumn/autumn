// Cancel add-on immediately (`cancel: 'immediately'`): add-on removed, base product stays active.
// Paid add-ons get a refund invoice for unused time; usage overage is NOT charged.

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductCanceling,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Cancel with scheduled downgrade - scheduled preserved then activates
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach premium ($30/mo) + recurring add-on ($20/mo)
 * - Downgrade premium -> pro ($20/mo) (schedules pro for end of cycle)
 * - Cancel add-on immediately
 * - Advance test clock to next cycle
 *
 * Expected Result:
 * - After cancel: premium active, pro scheduled, add-on gone
 * - After advance: pro active, premium gone, add-on gone
 */
test.concurrent(
	`${chalk.yellowBright("cancel addon immediately: with scheduled downgrade")}`,
	async () => {
		const customerId = "cancel-addon-imm-4";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		// Premium and pro in same group (default group)
		const premium = products.base({
			id: "premium",
			items: [messagesItem, items.monthlyPrice({ price: 30 })],
		});

		const pro = products.pro({ items: [messagesItem] }); // $20/mo

		const recurringAddon = products.recurringAddOn({
			id: "recurring-addon",
			items: [messagesItem],
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro, recurringAddon] }),
			],
			actions: [
				s.attach({ productId: premium.id }),
				s.attach({ productId: recurringAddon.id }),
				s.attach({ productId: pro.id }), // Schedules downgrade
			],
		});

		// Verify: premium active, pro scheduled, addon active
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [recurringAddon.id],
			canceling: [premium.id],
			scheduled: [pro.id],
		});

		// Cancel add-on immediately
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: recurringAddon.id,
			cancel_action: "cancel_immediately",
		});

		// Verify: premium active, pro still scheduled, addon gone
		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterCancel,
			canceling: [premium.id],
			scheduled: [pro.id],
			notPresent: [recurringAddon.id],
		});

		// Advance test clock to next cycle
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		// Verify: pro active, premium gone, addon gone
		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterAdvance,
			active: [pro.id],
			notPresent: [premium.id, recurringAddon.id],
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Cancel both pro and add-on - only free default remains
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro ($20/mo) + recurring add-on ($20/mo)
 * - Free default product exists
 * - Cancel pro at end of cycle
 * - Cancel add-on immediately
 * - Advance test clock
 *
 * Expected Result:
 * - After cancels: pro canceling, addon removed
 * - After advance: only free default product remains
 */
test.concurrent(
	`${chalk.yellowBright("cancel addon immediately: cancel both pro and addon")}`,
	async () => {
		const customerId = "cancel-addon-imm-6";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const free = products.base({
			id: "free",
			items: [messagesItem],
			isDefault: true,
		});

		const pro = products.pro({ items: [messagesItem] });
		const recurringAddon = products.recurringAddOn({
			id: "recurring-addon",
			items: [messagesItem],
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, recurringAddon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: recurringAddon.id }),
			],
		});

		// Verify both products active
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [pro.id, recurringAddon.id],
		});

		// Cancel pro at end of cycle
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Cancel add-on immediately
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: recurringAddon.id,
			cancel_action: "cancel_immediately",
		});

		// Verify: pro canceling, addon removed
		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({
			customer: customerAfterCancel,
			productId: pro.id,
		});
		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [recurringAddon.id],
		});

		// Advance test clock
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		// Wait for webhooks
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Verify: only free default remains
		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterAdvance,
			active: [free.id],
			notPresent: [pro.id, recurringAddon.id],
		});
	},
);
