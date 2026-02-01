/**
 * One-Off Customer Product Cleanup Tests - With Other Feature Types
 *
 * Tests for the cleanup cron job that expires one-off customer products
 * when they are depleted and a newer active product exists.
 *
 * Tests covering scenarios with other feature types like boolean, allocated users,
 * monthly messages, etc.
 *
 * Key behaviors:
 * - Only expires products where ALL prices are one_off interval
 * - Only expires products where ALL entitlements are depleted or boolean
 * - Only expires products when a NEWER active product exists
 * - Boolean features must exist in the newer product to expire the older one
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
// TEST 1: One-time product with monthly messages, track to 0, attach again - both active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: oneoff-monthly-messages-both-active")}`, async () => {
	const customerId = "cleanup-oneoff-monthly-messages";

	const monthlyMessagesItem = items.monthlyMessages({ includedUsage: 100 });

	const oneOff = products.oneOff({
		id: "one-off-monthly",
		items: [monthlyMessagesItem],
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

	// Verify: both should be active (monthly messages != one_off interval)
	const fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOff.id,
		expectedStatuses: [CusProductStatus.Active, CusProductStatus.Active],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Lifetime messages -> track to 0 -> attach with monthly - both active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: lifetime-then-monthly-both-active")}`, async () => {
	const customerId = "cleanup-lifetime-then-monthly";

	const lifetimeMessagesItem = items.lifetimeMessages({ includedUsage: 100 });
	const monthlyMessagesItem = items.monthlyMessages({ includedUsage: 100 });

	const oneOffLifetime = products.oneOff({
		id: "one-off-lifetime",
		items: [lifetimeMessagesItem],
	});

	const oneOffMonthly = products.oneOff({
		id: "one-off-monthly",
		items: [monthlyMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffLifetime, oneOffMonthly] }),
		],
		actions: [],
	});

	// Attach lifetime, track to 0
	await autumnV1.billing.attach(
		{ customer_id: customerId, product_id: oneOffLifetime.id },
		{ timeout: 2000 },
	);

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await timeout(2000);

	// Attach monthly (different product)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffMonthly.id,
	});

	await timeout(2000);

	// Run cleanup
	await cleanupOneOffCustomerProducts({ ctx });

	// Verify: both active (different products, can't clean up across products)
	const fullCusAfter = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus: fullCusAfter,
		productId: oneOffLifetime.id,
		expectedStatuses: [CusProductStatus.Active],
	});
	expectProductStatusesByOrder({
		fullCus: fullCusAfter,
		productId: oneOffMonthly.id,
		expectedStatuses: [CusProductStatus.Active],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: One-time prepaid + boolean, track to 0, attach again - only latest active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: oneoff-prepaid-boolean-only-latest")}`, async () => {
	const customerId = "cleanup-oneoff-prepaid-boolean";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const dashboardItem = items.dashboard();

	const oneOff = products.oneOff({
		id: "one-off-bool",
		items: [oneOffMessagesItem, dashboardItem],
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

	// Attach second
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	await timeout(2000);

	// Run cleanup
	await cleanupOneOffCustomerProducts({ ctx });

	// Verify: first should be expired (boolean + depleted prepaid), second active
	const fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOff.id,
		expectedStatuses: [CusProductStatus.Expired, CusProductStatus.Active],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: One-time prepaid + boolean, track to 0, attach WITHOUT boolean - both active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: oneoff-boolean-newer-without-boolean")}`, async () => {
	const customerId = "cleanup-oneoff-boolean-newer-no-bool";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const dashboardItem = items.dashboard();

	const oneOffWithBool = products.oneOff({
		id: "one-off-with-bool",
		items: [oneOffMessagesItem, dashboardItem],
	});

	const oneOffNoBool = products.oneOff({
		id: "one-off-no-bool",
		items: [oneOffMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffWithBool, oneOffNoBool] }),
		],
		actions: [],
	});

	// Attach first (with boolean), track to 0
	await autumnV1.billing.attach(
		{
			customer_id: customerId,
			product_id: oneOffWithBool.id,
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

	// Attach second (without boolean) - different product
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOffNoBool.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	await timeout(2000);

	// Run cleanup
	await cleanupOneOffCustomerProducts({ ctx });

	// Verify: both active (different products)
	const fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOffWithBool.id,
		expectedStatuses: [CusProductStatus.Active],
	});
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOffNoBool.id,
		expectedStatuses: [CusProductStatus.Active],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: One-time lifetime messages + allocated users, track both to 0, attach again - both active
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: oneoff-lifetime-allocated-both-active")}`, async () => {
	const customerId = "cleanup-oneoff-lifetime-allocated";

	const lifetimeMessagesItem = items.lifetimeMessages({ includedUsage: 100 });
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 5 });

	const oneOff = products.oneOff({
		id: "one-off-mixed",
		items: [lifetimeMessagesItem, allocatedUsersItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// Attach first, track both to 0
	await autumnV1.billing.attach(
		{ customer_id: customerId, product_id: oneOff.id },
		{ timeout: 2000 },
	);

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 5,
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

	// Verify: both active (allocated users are not one_off prices, so product doesn't qualify)
	const fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOff.id,
		expectedStatuses: [CusProductStatus.Active, CusProductStatus.Active],
	});
});
