/**
 * Scheduled Switch Consumable Tests (Attach V2)
 *
 * Tests for downgrades involving consumable (usage-in-arrear) features.
 *
 * Key behaviors:
 * - Consumable overage is charged at cycle end via invoice-created webhook
 * - These tests verify the downgrade flow works correctly with consumable usage
 * - Overage from the old product is billed when downgrade completes
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-consumable 1b: pro with consumable, usage under limit, to free (after cycle)")}`,
	async () => {
		const customerId = "sched-switch-cons-under-limit-b";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [consumableItem],
		});

		const freeMessages = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({
			id: "free",
			items: [freeMessages],
		});

		const { autumnV1: autumnV1After, ctx: ctxAfter } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.Messages, value: 50 }),
				s.billing.attach({ productId: free.id }), // Schedule downgrade
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const customerAfterCycle =
			await autumnV1After.customers.get<ApiCustomerV3>(customerId);

		// After cycle: free active, pro removed
		await expectCustomerProducts({
			customer: customerAfterCycle,
			active: [free.id],
			notPresent: [pro.id],
		});

		// Features at free tier (50 included)
		expectCustomerFeatureCorrect({
			customer: customerAfterCycle,
			featureId: TestFeature.Messages,
			balance: 50,
			usage: 0,
		});

		// Only pro invoice ($20), no overage since usage was under included.
		// The cycle-end invoice lands via webhook, so poll.
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1After,
			customerId,
			count: 2,
			latestTotal: 0,
			latestInvoiceProductIds: [pro.id],
		});

		// After downgrading to free, there should be no Stripe subscription
		await expectNoStripeSubscription({
			db: ctxAfter.db,
			customerId,
			org: ctxAfter.org,
			env: ctxAfter.env,
		});
	},
);
