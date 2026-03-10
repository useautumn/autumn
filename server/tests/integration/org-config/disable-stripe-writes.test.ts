/**
 * Invoice Created Webhook Tests - Consumable Edge Cases
 *
 * Tests for edge case scenarios involving consumable (usage-in-arrear) prices
 * during downgrades, multiple subscriptions, and complex billing scenarios.
 */

import { expect, test } from "bun:test";
import type { AttachParamsV0Input } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { db } from "@/db/initDrizzle";
import { CusService } from "@/internal/customers/CusService";
import { OrgService } from "@/internal/orgs/OrgService";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Disable stripe writes
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro ($20/mo) with consumable messages (100 included, $0.10/unit)
 * - Recurring Addon ($20/mo) with consumable words (50 included, $0.05/unit)
 *   - Addon attached with new_billing_subscription: true (separate Stripe subscription)
 * - Track 200 messages (100 overage) and 150 words (100 overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Pro invoice: $20 base + $10 message overage = $30
 * - Addon invoice: $20 base + $5 word overage = $25
 * - Each subscription's invoice has its own product's overage
 */
test.concurrent(`${chalk.yellowBright("disable stripe writes")}`, async () => {
	const customerId = "disable-stripe-writes";

	const freeProduct = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	// Save original org config and enable void_invoices_on_subscription_deletion
	// This must be set in the database because webhooks read config from DB, not request headers

	const { ctx, autumnV1 } = await initScenario({
		// customerId,
		setup: [s.deleteCustomer({ customerId })],
		actions: [s.products({ list: [freeProduct] })],
	});

	await OrgService.update({
		db: db,
		orgId: ctx.org.id,
		updates: {
			config: {
				...ctx.org.config,
				disable_stripe_writes: true,
			},
		},
	});

	await autumnV1.customers.create({
		id: customerId,
		name: "Disable Stripe Writes Customer",
		email: `${customerId}@example.com`,
		internalOptions: {
			disable_defaults: true,
		},
	});

	await autumnV1.billing.attach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: freeProduct.id,
	});

	const customer = await CusService.get({
		db: db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	expect(customer?.processor?.id).toBeFalsy();
	const apiCustomer = await autumnV1.customers.get(customerId);
	expect(apiCustomer?.stripe_id).toBeFalsy();

	await OrgService.update({
		db: db,
		orgId: ctx.org.id,
		updates: {
			config: {
				...ctx.org.config,
				disable_stripe_writes: false,
			},
		},
	});
});
