/**
 * One-Off Customer Product Cleanup Tests - Expires
 *
 * Tests for scenarios where the cleanup cron job DOES expire one-off customer
 * products when they are depleted and a newer active product exists.
 *
 * Key behaviors tested:
 * - Depleted product + newer active product = older product expires
 * - Works with one-off prepaid, lifetime messages, and base products
 */

import { test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import {
	expectProductStatusesByOrder,
	getFullCustomerWithExpired,
} from "@tests/integration/cron/one-off-cleanup/utils/oneOffCleanupTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { cleanupOneOffCustomerProducts } from "@/internal/customers/cusProducts/actions/cleanupOneOff/cleanupOneOff.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Two one-time prepaid, both track to 0, cleanup - first expired
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: two-oneoff-both-depleted")}`, async () => {
	const customerId = "cleanup-two-oneoff-both-depleted";

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

	// Attach first, track to 0
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

	// Attach second, track to 0
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

	// Verify: first should be expired (depleted + has newer active product)
	// Second stays active (depleted but no newer active product)
	const fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOff.id,
		expectedStatuses: [CusProductStatus.Expired, CusProductStatus.Active],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Track to 0, attach again (don't track), cleanup - only latest active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: oneoff-depleted-newer-active")}`, async () => {
	const customerId = "cleanup-oneoff-depleted-newer-active";

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

	// Attach first, track to 0
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

	// Attach second (don't track)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	await timeout(2000);

	// Run cleanup
	await cleanupOneOffCustomerProducts({ ctx });

	// Verify: first should be expired, second should be active
	const fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOff.id,
		expectedStatuses: [CusProductStatus.Expired, CusProductStatus.Active],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: One-time product with lifetime messages, track to 0, attach again - only latest active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: oneoff-lifetime-messages-only-latest")}`, async () => {
	const customerId = "cleanup-oneoff-lifetime-messages";

	const lifetimeMessagesItem = items.lifetimeMessages({ includedUsage: 100 });

	const oneOff = products.oneOff({
		id: "one-off-lifetime",
		items: [lifetimeMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// Attach first, track to 0
	await autumnV1.billing.attach(
		{ customer_id: customerId, product_id: oneOff.id },
		{ timeout: 2000 },
	);

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await timeout(2000);

	// Attach second
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
	});

	await timeout(2000);

	// Run cleanup
	await cleanupOneOffCustomerProducts({ ctx });

	// Verify: first should be expired, second should be active
	// Note: lifetime messages are single_use consumables, so they qualify for cleanup
	const fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOff.id,
		expectedStatuses: [CusProductStatus.Expired, CusProductStatus.Active],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: One-off prepaid, track to 0, attach again - only latest active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: oneoff-prepaid-then-attach-again")}`, async () => {
	const customerId = "cleanup-oneoff-then-lifetime-prepaid";

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

	// Attach first with prepaid, track to 0
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

	// Attach second (same product)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	await timeout(2000);

	// Run cleanup
	await cleanupOneOffCustomerProducts({ ctx });

	// Verify: first should be expired, second should be active
	const fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOff.id,
		expectedStatuses: [CusProductStatus.Expired, CusProductStatus.Active],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Base product with one-off prepaid credits - use up, attach again, cleanup - first expired
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: base-oneoff-prepaid-depleted")}`, async () => {
	const customerId = "cleanup-base-oneoff-prepaid-depleted";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const baseProduct = products.base({
		id: "base-with-credits",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [baseProduct] }),
		],
		actions: [],
	});

	// 1. Attach base product with one-off prepaid credits
	await autumnV1.billing.attach(
		{
			customer_id: customerId,
			product_id: baseProduct.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
		},
		{ timeout: 2000 },
	);

	// 2. Use up credits
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await timeout(2000);

	// 3. Attach again
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: baseProduct.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	await timeout(2000);

	// 4. Cleanup
	await cleanupOneOffCustomerProducts({ ctx });

	// 5. First product expired, second active
	const fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: baseProduct.id,
		expectedStatuses: [CusProductStatus.Expired, CusProductStatus.Active],
	});
});
