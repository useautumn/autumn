/**
 * Carry Over Usages — feature_ids Filter Tests
 *
 * When feature_ids is provided, only the listed features have their usage
 * carried over. All other consumable features start at their full new allowance.
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
// TEST 1: feature_ids filter — only listed feature has usage carried over
//
// Pro: 50 messages (30 used), 100 words (60 used)
// Upgrade to Premium (200 messages, 300 words)
// with carry_over_usages: { enabled: true, feature_ids: ["messages"] }
// Expected:
//   messages: balance = 170 (200 - 30 carried usage), usage = 30
//   words:    balance = 300 (full new allowance — words not in feature_ids), usage = 0
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("carry-over-usage-feature-ids 1: only feature_ids listed have usage carried — other features start at full new allowance")}`, async () => {
	const proMessages = items.monthlyMessages({ includedUsage: 50 });
	const proWords = items.monthlyWords({ includedUsage: 100 });

	const premiumMessages = items.monthlyMessages({ includedUsage: 200 });
	const premiumWords = items.monthlyWords({ includedUsage: 300 });

	const pro = products.pro({ id: "pro", items: [proMessages, proWords] });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessages, premiumWords],
	});

	const { customerId, autumnV2_1, autumnV1 } = await initScenario({
		customerId: "carry-over-usage-feature-ids1",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	// Track 30 messages and 60 words
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
	});
	await autumnV2_1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: 60,
	});

	// Wait for Redis → Postgres sync
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Upgrade with carry_over_usages scoped to messages only
	await autumnV2_1.billing.attach({
		customer_id: customerId,
		plan_id: premium.id,
		carry_over_usages: {
			enabled: true,
			feature_ids: [TestFeature.Messages],
		},
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// messages: 200 - 30 carried usage = 170
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 170,
		usage: 30,
	});

	// words: full new allowance (not in feature_ids — usage not carried)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		balance: 300,
		usage: 0,
	});
});
