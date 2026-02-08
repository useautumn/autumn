/**
 * Stripe Checkout Error Tests (Attach V2)
 *
 * Tests for error handling in Stripe Checkout flows.
 *
 * Key error scenarios:
 * - Multi-interval products cannot use Stripe checkout (monthly + annual in same product)
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Multi-interval checkout error (monthly + annual prepaid)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method (triggers checkout flow)
 * - Product has prepaid items with different intervals (monthly + annual)
 *
 * Why this fails:
 * - Stripe checkout sessions can only handle one recurring interval
 * - Having monthly and annual prepaid in same checkout is not supported
 *
 * Expected Result:
 * - Error thrown: "Cannot create Stripe checkout when there are multiple intervals"
 */
test.concurrent(`${chalk.yellowBright("error: multi-interval checkout not supported")}`, async () => {
	const customerId = "stripe-checkout-error-multi-interval";

	// Monthly prepaid messages: $10/pack (100 units)
	const monthlyPrepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	// Annual prepaid words: $50/pack (100 units)
	const annualPrepaidItem = constructPrepaidItem({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits: 100,
		price: 50,
		intervalCount: 12, // Annual (12 months)
	});

	// Product with both monthly and annual prepaid
	const mixedIntervalProduct = products.base({
		id: "mixed-interval",
		items: [monthlyPrepaidItem, annualPrepaidItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method → checkout flow
			s.products({ list: [mixedIntervalProduct] }),
		],
		actions: [],
	});

	// Attempt to attach should fail due to multi-interval checkout
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: mixedIntervalProduct.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: 100 },
					{ feature_id: TestFeature.Words, quantity: 100 },
				],
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Multi-interval checkout error with allocated users + entities
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method (triggers checkout flow)
 * - Create 5 user entities BEFORE attach
 * - Product has monthly allocated users + annual prepaid words
 *
 * Why this fails:
 * - Stripe checkout sessions can only handle one recurring interval
 * - Having monthly allocated users and annual prepaid in same checkout is not supported
 *
 * Expected Result:
 * - Error thrown: "Cannot create Stripe checkout when there are multiple intervals"
 */
test.concurrent(`${chalk.yellowBright("error: multi-interval checkout with allocated users")}`, async () => {
	const customerId = "stripe-checkout-error-multi-allocated";
	const userCount = 5;

	// Monthly allocated users: $10/user
	const allocatedUsersItem = items.allocatedUsers({
		includedUsage: 0,
	});

	// Annual prepaid words: $50/pack (100 units)
	const annualPrepaidItem = constructPrepaidItem({
		featureId: TestFeature.Words,
		includedUsage: 0,
		billingUnits: 100,
		price: 50,
		intervalCount: 12, // Annual (12 months)
	});

	// Product with both monthly allocated users and annual prepaid
	const mixedIntervalProduct = products.base({
		id: "mixed-interval-allocated",
		items: [allocatedUsersItem, annualPrepaidItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method → checkout flow
			s.products({ list: [mixedIntervalProduct] }),
			// Create 5 user entities BEFORE attach
			s.entities({ count: userCount, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	// Verify we have 5 entities
	expect(entities.length).toBe(userCount);

	// Attempt to attach should fail due to multi-interval checkout
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: mixedIntervalProduct.id,
				options: [{ feature_id: TestFeature.Words, quantity: 100 }],
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Zero price checkout error (allocated messages, no usage)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method (triggers checkout flow)
 * - Base product with allocated messages (no base price, no usage)
 *
 * Why this fails:
 * - Stripe checkout doesn't allow $0 total
 * - Allocated with no usage = $0
 *
 * Expected Result:
 * - Error thrown
 */
test.concurrent(`${chalk.yellowBright("error: zero price checkout (allocated, no usage)")}`, async () => {
	const customerId = "stripe-checkout-error-zero-allocated";

	// Allocated messages: $10/unit, no included usage
	const allocatedMessagesItem = items.allocatedMessages({ includedUsage: 0 });

	// Base product (no base price) with allocated messages
	const base = products.base({
		id: "zero-allocated",
		items: [allocatedMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method → checkout flow
			s.products({ list: [base] }),
		],
		actions: [],
	});

	// Attempt to attach should fail - $0 total not allowed in checkout
	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: base.id,
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Zero price checkout error (prepaid messages, quantity 0)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method (triggers checkout flow)
 * - Base product with prepaid messages, attach with quantity: 0
 *
 * Why this fails:
 * - Stripe checkout doesn't allow $0 total
 * - Prepaid with quantity 0 + no base price = $0
 *
 * Expected Result:
 * - Error thrown
 */
test.concurrent(`${chalk.yellowBright("error: zero price checkout (prepaid, quantity 0)")}`, async () => {
	const customerId = "stripe-checkout-error-zero-prepaid";

	// Prepaid messages: $10/pack (100 units), no included usage
	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	// Base product (no base price) with prepaid messages
	const base = products.base({
		id: "zero-prepaid",
		items: [prepaidMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method → checkout flow
			s.products({ list: [base] }),
		],
		actions: [],
	});

	// Attempt to attach with quantity 0 should fail - $0 total not allowed in checkout
	await expectAutumnError({
		func: async () => {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: base.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
			});
		},
	});
});
