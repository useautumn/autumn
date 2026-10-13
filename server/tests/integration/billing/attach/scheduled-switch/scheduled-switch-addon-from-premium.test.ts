/** Scheduled Switch Add-on Tests (Attach V2): add-ons persist through main product
 * downgrades, keeping their features and subscription items across the cycle boundary. */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Premium + add-on → Pro (add-on persists after cycle)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Premium ($50/mo) with recurring add-on ($20/mo)
 * - Downgrade to Pro ($20/mo) (scheduled)
 * - Advance to next cycle
 *
 * Expected:
 * - After cycle: Pro active, add-on still active
 * - Renewal: Pro ($20) + add-on ($20) = $40
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-addon 2a: premium+addon to pro (mid-cycle)")}`,
	async () => {
		const customerId = "sched-switch-addon-premium-to-pro-a";

		const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const proMessagesItem = items.monthlyMessages({ includedUsage: 200 });
		const pro = products.pro({ id: "pro", items: [proMessagesItem] });

		const wordsItem = items.monthlyWords({ includedUsage: 200 });
		const recurringAddon = products.recurringAddOn({
			id: "recurring-addon",
			items: [wordsItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro, recurringAddon] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.billing.attach({ productId: recurringAddon.id }),
			],
		});

		// Verify initial state: Premium + add-on
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerBefore,
			active: [premium.id, recurringAddon.id],
		});

		// Schedule downgrade to Pro
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		// Verify mid-cycle state
		const customerMidCycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerMidCycle,
			canceling: [premium.id],
			active: [recurringAddon.id],
			scheduled: [pro.id],
		});

		// Verify subscription with scheduled downgrade
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-addon 2b: premium+addon to pro (after cycle)")}`,
	async () => {
		const customerId = "sched-switch-addon-premium-to-pro-b";

		const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const proMessagesItem = items.monthlyMessages({ includedUsage: 200 });
		const pro = products.pro({ id: "pro", items: [proMessagesItem] });

		const wordsItem = items.monthlyWords({ includedUsage: 200 });
		const recurringAddon = products.recurringAddOn({
			id: "recurring-addon",
			items: [wordsItem],
		});

		// Advance to next cycle
		const { autumnV1: autumnV1After, ctx: ctxAfter } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro, recurringAddon] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.billing.attach({ productId: recurringAddon.id }),
				s.billing.attach({ productId: pro.id }), // Schedule downgrade
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const customerAfterCycle =
			await autumnV1After.customers.get<ApiCustomerV3>(customerId);

		// After cycle: Pro active, Premium removed, ADD-ON STILL ACTIVE
		await expectCustomerProducts({
			customer: customerAfterCycle,
			active: [pro.id, recurringAddon.id],
			notPresent: [premium.id],
		});

		// Messages from Pro (200)
		expectCustomerFeatureCorrect({
			customer: customerAfterCycle,
			featureId: TestFeature.Messages,
			includedUsage: 200,
			balance: 200,
			usage: 0,
		});

		// Words from add-on STILL AVAILABLE
		expectCustomerFeatureCorrect({
			customer: customerAfterCycle,
			featureId: TestFeature.Words,
			includedUsage: 200,
			balance: 200,
			usage: 0,
		});

		// Verify subscription still has Pro + add-on
		await expectSubToBeCorrect({
			db: ctxAfter.db,
			customerId,
			org: ctxAfter.org,
			env: ctxAfter.env,
		});
	},
);
