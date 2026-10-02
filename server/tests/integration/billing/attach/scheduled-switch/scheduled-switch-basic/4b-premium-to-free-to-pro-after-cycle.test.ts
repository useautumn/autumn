/**
 * Scheduled Switch Basic Tests (Attach V2)
 *
 * Tests for basic downgrade scenarios where a lower-tier product takes effect at end of billing cycle.
 *
 * Key behaviors:
 * - Downgrade schedules new product for end of cycle
 * - Current product enters "canceling" state (active with canceled_at set)
 * - New product has "scheduled" status
 * - At cycle end: current product removed, scheduled product becomes active
 * - Scheduled downgrades can be replaced by other downgrades
 *
 * Each scenario is split into an "a" (mid-cycle) and "b" (after cycle) test with
 * separate customers so each test owns its own Stripe test clock.
 *
 * NOTE: Tests for "upgrade cancels scheduled downgrade" are in immediate-switch-basic.test.ts
 */

import { test } from "bun:test";
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

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-basic 4b: premium to free to pro (after cycle)")}`,
	async () => {
		const customerId = "sched-switch-premium-free-pro-b";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({
			id: "free",
			items: [messagesItem],
		});

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

		const { autumnV1: autumnV1After, ctx: ctxAfter } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.billing.attach({ productId: free.id }), // Schedule downgrade to free
				s.billing.attach({ productId: pro.id }), // Replace with pro
				s.advanceToNextInvoice(),
			],
		});

		const customerAfterCycle =
			await autumnV1After.customers.get<ApiCustomerV3>(customerId);

		// After cycle: premium removed, pro active
		await expectCustomerProducts({
			customer: customerAfterCycle,
			active: [pro.id],
			notPresent: [premium.id, free.id],
		});

		// Features updated to pro tier
		expectCustomerFeatureCorrect({
			customer: customerAfterCycle,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
		});

		// Invoices: premium ($50) + pro renewal ($20)
		await expectCustomerInvoiceCorrect({
			customer: customerAfterCycle,
			count: 2,
			latestTotal: 20,
			latestInvoiceProductIds: [pro.id],
		});

		// Verify Stripe subscription after cycle
		await expectSubToBeCorrect({
			db: ctxAfter.db,
			customerId,
			org: ctxAfter.org,
			env: ctxAfter.env,
		});
	},
);
