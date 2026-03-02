/**
 * Carry Over Balances - Basic Tests
 *
 * Tests for carry_over_balances: { enabled: true } on immediate plan upgrades.
 *
 * Key behaviors:
 * - Remaining balance is carried as a loose entitlement on upgrade
 * - Zero balance is a silent no-op (no loose entitlement created)
 * - Negative balance (overage) is not carried — new plan starts at full allowance
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Basic balance carry over
//
// Pro: 100 messages, 30 used (balance=70)
// Upgrade to Premium (500) with carry_over_balances: { enabled: true }
// Expected: balance = 570 (500 + 70 loose), usage = 0
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("carry-over-balance 1: remaining balance carried as loose entitlement on immediate upgrade")}`, async () => {
	const proMessages = items.monthlyMessages({ includedUsage: 100 });
	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });

	const pro = products.pro({ id: "pro", items: [proMessages] });
	const premium = products.premium({ id: "premium", items: [premiumMessages] });

	const { customerId, autumnV2_1, autumnV1 } = await initScenario({
		customerId: "carry-over-balance-basic1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	// Track 30 units (balance: 100 → 70)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});

	// Wait for Redis → Postgres sync
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Upgrade to Premium with carry_over_balances enabled
	await autumnV2_1.billing.attach({
		customer_id: customerId,
		plan_id: premium.id,
		carry_over_balances: { enabled: true },
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance = 500 (Premium grant) + 70 (loose carried entitlement)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 570,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Zero balance — nothing to carry
//
// Pro: 100 messages, 100 used (balance=0)
// Upgrade to Premium (500) with carry_over_balances: { enabled: true }
// Expected: balance = 500 (no loose entitlement created)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("carry-over-balance 2: zero balance is a no-op — new plan starts at full allowance")}`, async () => {
	const proMessages = items.monthlyMessages({ includedUsage: 100 });
	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });

	const pro = products.pro({ id: "pro", items: [proMessages] });
	const premium = products.premium({ id: "premium", items: [premiumMessages] });

	const { customerId, autumnV2_1, autumnV1 } = await initScenario({
		customerId: "carry-over-balance-zero",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	// Exhaust the full 100 allowance (balance: 100 → 0)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	// Wait for Redis → Postgres sync
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Upgrade with carry_over_balances — zero balance is a silent no-op
	await autumnV2_1.billing.attach({
		customer_id: customerId,
		plan_id: premium.id,
		carry_over_balances: { enabled: true },
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance = 500 only (no loose entitlement — nothing to carry)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Negative balance (overage) — don't carry negative
//
// Pro: 100 messages + consumable overage, 120 used (balance=-20)
// Upgrade to Premium (500) with carry_over_balances: { enabled: true }
// Expected: balance = 500 (negative balance is not carried)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("carry-over-balance 3: negative balance (overage) is not carried — new plan starts at full allowance")}`, async () => {
	// Use a consumable item to allow overage past the included usage
	const proMessages = items.consumableMessages({ includedUsage: 100 });
	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });

	const pro = products.pro({ id: "pro", items: [proMessages] });
	const premium = products.premium({ id: "premium", items: [premiumMessages] });

	const { customerId, autumnV2_1, autumnV1 } = await initScenario({
		customerId: "carry-over-balance-negative",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	// Track 120 — 20 over the 100 allowance (balance: 100 → -20)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 120,
	});

	// Wait for Redis → Postgres sync
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Upgrade with carry_over_balances — negative balance must not be carried
	await autumnV2_1.billing.attach({
		customer_id: customerId,
		plan_id: premium.id,
		carry_over_balances: { enabled: true },
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance = 500 only (negative not carried — no loose entitlement)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
		usage: 0,
	});
});
