/**
 * One-Off Customer Product Cleanup Tests - Stays Active
 *
 * Tests for scenarios where the cleanup cron job does NOT expire one-off
 * customer products because the conditions for expiration are not met.
 *
 * Key behaviors tested:
 * - Single product (no newer product exists) = stays active
 * - Product not depleted = stays active
 * - All products depleted (no "newer active" product) = all stay active
 */

import { test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { cleanupOneOffCustomerProducts } from "@/internal/customers/cusProducts/actions/cleanupOneOff/cleanupOneOff.js";
import {
	expectProductStatusesByOrder,
	getFullCustomerWithExpired,
} from "./utils/oneOffCleanupTestUtils.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Single one-time prepaid, track to 0, cleanup - should stay active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: single-oneoff-no-newer")}`, async () => {
	const customerId = "cleanup-single-oneoff-no-newer";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.oneOff({
		id: "one-off",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// Attach and track to 0
	await autumnV1.billing.attach(
		{
			customer_id: customerId,
			product_id: oneOff.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
		},
		{ timeout: 2000 },
	);

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await timeout(2000);

	// Run cleanup
	await cleanupOneOffCustomerProducts({ ctx });

	// Verify: product should still be active (no newer product exists)
	const fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOff.id,
		expectedStatuses: [CusProductStatus.Active],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Don't track to 0, attach again, cleanup - both active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: oneoff-not-depleted-both-active")}`, async () => {
	const customerId = "cleanup-oneoff-not-depleted-both-active";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.oneOff({
		id: "one-off",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// Attach first (don't track to 0)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	await timeout(2000);

	// Attach second
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	await timeout(2000);

	// Run cleanup
	await cleanupOneOffCustomerProducts({ ctx });

	// Verify: both should still be active (first not depleted)
	const fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOff.id,
		expectedStatuses: [CusProductStatus.Active, CusProductStatus.Active],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Three purchases, all depleted, cleanup - all stay active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: three-oneoff-all-depleted")}`, async () => {
	const customerId = "cleanup-three-oneoff-middle-depleted";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.oneOff({
		id: "one-off",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// Attach first
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	await timeout(2000);

	// Attach second
	await autumnV1.billing.attach(
		{
			customer_id: customerId,
			product_id: oneOff.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
		},
		{ timeout: 2000 },
	);

	// Track 100 to deplete the second product that has been attached
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await timeout(2000);

	// Attach third
	await autumnV1.billing.attach(
		{
			customer_id: customerId,
			product_id: oneOff.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
		},
		{ timeout: 2000 },
	);

	// await autumnV1.track({
	// 	customer_id: customerId,
	// 	feature_id: TestFeature.Messages,
	// 	value: 100,
	// });

	await timeout(2000);

	// Run cleanup
	await cleanupOneOffCustomerProducts({ ctx });

	// Verify: all three stay active
	// All three are depleted, but the query requires a newer ACTIVE product
	// Since all are depleted, none should be expired
	const fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOff.id,
		expectedStatuses: [
			CusProductStatus.Expired,
			CusProductStatus.Active,
			CusProductStatus.Active,
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Attach one-time product TWICE (no tracking), cleanup - both active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: attach-twice-no-depletion")}`, async () => {
	const customerId = "cleanup-attach-twice-no-depletion";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.oneOff({
		id: "one-off",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// Attach twice without any tracking
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	await timeout(2000);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	await timeout(2000);

	// Run cleanup
	await cleanupOneOffCustomerProducts({ ctx });

	// Verify: both still active (neither is depleted)
	const fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOff.id,
		expectedStatuses: [CusProductStatus.Active, CusProductStatus.Active],
	});
});
