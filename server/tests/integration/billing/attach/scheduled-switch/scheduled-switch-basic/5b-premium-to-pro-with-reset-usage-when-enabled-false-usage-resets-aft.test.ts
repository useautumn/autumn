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
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-basic 5b: premium to pro with reset_usage_when_enabled: false (usage resets after cycle)")}`,
	async () => {
		const customerId = "sched-switch-reset-usage-false-premium-to-pro-b";

		const premiumMessagesItem = items.monthlyMessages({
			includedUsage: 1000,
			resetUsageWhenEnabled: false,
		});
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const proMessagesItem = items.monthlyMessages({
			includedUsage: 500,
			resetUsageWhenEnabled: false,
		});
		const pro = products.pro({
			id: "pro",
			items: [proMessagesItem],
		});

		const { autumnV1: autumnV1After, ctx: ctxAfter } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.track({ featureId: TestFeature.Messages, value: 300, timeout: 2000 }),
				s.billing.attach({ productId: pro.id }), // Schedule downgrade
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const customerAfterCycle =
			await autumnV1After.customers.get<ApiCustomerV3>(customerId);

		// Verify products after cycle
		await expectCustomerProducts({
			customer: customerAfterCycle,
			active: [pro.id],
			notPresent: [premium.id],
		});

		// Verify usage RESET (scheduled switches always reset, regardless of reset_usage_when_enabled)
		expectCustomerFeatureCorrect({
			customer: customerAfterCycle,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500, // RESET - not 500 - 300 = 200
			usage: 0, // RESET
		});

		// Verify Stripe subscription
		await expectSubToBeCorrect({
			db: ctxAfter.db,
			customerId,
			org: ctxAfter.org,
			env: ctxAfter.env,
		});
	},
);
