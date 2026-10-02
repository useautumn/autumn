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
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-basic 6b: pro to free (usage resets after cycle)")}`,
	async () => {
		const customerId = "sched-switch-reset-usage-false-pro-to-free-b";

		const proMessagesItem = items.monthlyMessages({
			includedUsage: 500,
			resetUsageWhenEnabled: false,
		});
		const pro = products.pro({
			id: "pro",
			items: [proMessagesItem],
		});

		const freeMessagesItem = items.monthlyMessages({
			includedUsage: 100,
			resetUsageWhenEnabled: false,
		});
		const free = products.base({
			id: "free",
			items: [freeMessagesItem],
		});

		const { autumnV1: autumnV1After, ctx: ctxAfter } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.Messages, value: 200, timeout: 2000 }),
				s.billing.attach({ productId: free.id }), // Schedule downgrade
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const customerAfterCycle =
			await autumnV1After.customers.get<ApiCustomerV3>(customerId);

		// Verify products after cycle
		await expectCustomerProducts({
			customer: customerAfterCycle,
			active: [free.id],
			notPresent: [pro.id],
		});

		// Verify usage RESET (scheduled switches always reset)
		expectCustomerFeatureCorrect({
			customer: customerAfterCycle,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100, // RESET
			usage: 0, // RESET
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
