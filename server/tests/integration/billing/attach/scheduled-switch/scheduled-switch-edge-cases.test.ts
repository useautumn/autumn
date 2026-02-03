/**
 * Scheduled Switch Edge Cases Tests (Attach V2)
 *
 * Tests for edge cases and complex scheduling scenarios.
 *
 * Key behaviors:
 * - Multiple scheduled changes replace each other
 * - Only the final scheduled product takes effect at cycle end
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Multiple scheduled changes on same entity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Growth ($100/mo)
 * - Downgrade to Free (scheduled)
 * - Change to Pro (replaces scheduled)
 * - Change to Premium (replaces scheduled)
 * - Change to Free (replaces scheduled)
 *
 * Expected Result:
 * - Each change replaces the previous scheduled product
 * - Final state: Growth canceling, Free scheduled
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-edge-cases 1: multiple scheduled changes on same entity")}`, async () => {
	const customerId = "sched-switch-multi-changes";

	const freeMessages = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({
		id: "free",
		items: [freeMessages],
	});

	const proMessages = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});

	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessages],
	});

	const growthMessages = items.monthlyMessages({ includedUsage: 1000 });
	const growth = products.growth({
		id: "growth",
		items: [growthMessages],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium, growth] }),
		],
		actions: [s.billing.attach({ productId: growth.id })],
	});

	// Verify Stripe subscription after initial attach
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Step 1: Downgrade to Free (scheduled)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer,
		productId: growth.id,
	});
	await expectProductScheduled({
		customer,
		productId: free.id,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Step 2: Change scheduled to Pro (replaces Free)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer,
		productId: growth.id,
	});
	await expectProductScheduled({
		customer,
		productId: pro.id,
	});
	await expectProductNotPresent({
		customer,
		productId: free.id,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Step 3: Change scheduled to Premium (replaces Pro)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer,
		productId: growth.id,
	});
	await expectProductScheduled({
		customer,
		productId: premium.id,
	});
	await expectProductNotPresent({
		customer,
		productId: pro.id,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Step 4: Change scheduled back to Free (replaces Premium)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer,
		productId: growth.id,
	});
	await expectProductScheduled({
		customer,
		productId: free.id,
	});
	await expectProductNotPresent({
		customer,
		productId: premium.id,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Features still at growth tier until cycle end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1000,
		balance: 1000,
		usage: 0,
	});

	// Only 1 invoice (initial growth attach)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 100,
	});
});
