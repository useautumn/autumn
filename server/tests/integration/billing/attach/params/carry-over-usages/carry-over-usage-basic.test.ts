/**
 * Carry Over Usages - Basic Tests
 *
 * Tests for carry_over_usages: { enabled: true } on immediate plan upgrades.
 *
 * Key behaviors:
 * - Existing usage is deducted from the new plan's allowance on upgrade
 * - Zero usage is a silent no-op (new plan starts at full allowance)
 * - New plan balance is clamped to zero — cannot go negative from carried usage
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
// TEST 1: Basic usage carry over (deduction)
//
// Pro: 50 messages, 40 used (balance=10)
// Upgrade to Premium (200) with carry_over_usages: { enabled: true }
// Expected: balance = 160 (200 - 40 carried usage), usage = 40
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("carry-over-usage 1: existing usage is deducted from new plan allowance on upgrade")}`, async () => {
	const proMessages = items.monthlyMessages({ includedUsage: 50 });
	const premiumMessages = items.monthlyMessages({ includedUsage: 200 });

	const pro = products.pro({ id: "pro", items: [proMessages] });
	const premium = products.premium({ id: "premium", items: [premiumMessages] });

	const { customerId, autumnV2_1, autumnV1 } = await initScenario({
		customerId: "carry-over-usage-basic1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	// Track 40 units (balance: 50 → 10)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 40,
	});

	// Wait for Redis → Postgres sync
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Upgrade to Premium with carry_over_usages enabled
	await autumnV2_1.billing.attach({
		customer_id: customerId,
		plan_id: premium.id,
		carry_over_usages: { enabled: true },
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance = 200 (Premium allowance) - 40 (carried usage) = 160
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 160,
		usage: 40,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Zero usage — nothing to carry
//
// Pro: 50 messages, 0 used (balance=50, nothing consumed)
// Upgrade to Premium (200) with carry_over_usages: { enabled: true }
// Expected: balance = 200 (no deduction — usage was zero)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("carry-over-usage 2: zero usage is a no-op — new plan starts at full allowance")}`, async () => {
	const proMessages = items.monthlyMessages({ includedUsage: 50 });
	const premiumMessages = items.monthlyMessages({ includedUsage: 200 });

	const pro = products.pro({ id: "pro", items: [proMessages] });
	const premium = products.premium({ id: "premium", items: [premiumMessages] });

	const { customerId, autumnV2_1, autumnV1 } = await initScenario({
		customerId: "carry-over-usage-zero",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	// No tracking — usage stays at 0

	// Upgrade with carry_over_usages — zero usage is a silent no-op
	await autumnV2_1.billing.attach({
		customer_id: customerId,
		plan_id: premium.id,
		carry_over_usages: { enabled: true },
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance = 200 only (no deduction — nothing was used)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Clamp to zero — usage exceeds new plan allowance
//
// Pro: 50 messages, 50 used (balance=0, all used)
// Upgrade to Premium (30 messages) with carry_over_usages: { enabled: true }
// Expected: balance = 0 (50 usage > 30 new allowance — clamped, not negative)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("carry-over-usage 3: balance is clamped to zero when carried usage exceeds new plan allowance")}`, async () => {
	const proMessages = items.monthlyMessages({ includedUsage: 50 });
	const premiumMessages = items.monthlyMessages({ includedUsage: 30 });

	const pro = products.pro({ id: "pro", items: [proMessages] });
	const premium = products.premium({ id: "premium", items: [premiumMessages] });

	const { customerId, autumnV2_1, autumnV1 } = await initScenario({
		customerId: "carry-over-usage-clamp",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	// Exhaust all 50 allowance (balance: 50 → 0)
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	// Wait for Redis → Postgres sync
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Upgrade with carry_over_usages — 50 usage > 30 new allowance, must clamp to 0
	await autumnV2_1.billing.attach({
		customer_id: customerId,
		plan_id: premium.id,
		carry_over_usages: { enabled: true },
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance = 0 (clamped — cannot go negative)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 0,
	});
});
