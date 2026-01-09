import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: ALLOCATED/SEAT-BASED UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE WITHIN INCLUDED (usage < included)
// ═══════════════════════════════════════════════════════════════════════════════

// Update when usage < included, staying within included
test.concurrent(`${chalk.yellowBright("allocated: increase allowance when usage < included")}`, async () => {
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 5 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [allocatedUsersItem, priceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "alloc-inc-within",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Use 2 seats (within the 5 included)
	const seatsUsed = 2;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: seatsUsed,
		},
		{ timeout: 2000 },
	);

	// Increase to 10 included seats
	const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 10 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newAllocatedUsersItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No price change - usage still within included
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage preserved, more capacity available
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: newAllocatedUsersItem.included_usage,
		balance: newAllocatedUsersItem.included_usage - seatsUsed, // 10 - 2 = 8
		usage: seatsUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// Decrease allowance but usage still within new included
test.concurrent(`${chalk.yellowBright("allocated: decrease allowance, usage still within included")}`, async () => {
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 10 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [allocatedUsersItem, priceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "alloc-dec-within",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Use 3 seats (within the 10 included)
	const seatsUsed = 3;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: seatsUsed,
		},
		{ timeout: 2000 },
	);

	// Decrease to 5 included seats (still covers the 3 used)
	const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 5 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newAllocatedUsersItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No price change - usage (3) still within new included (5)
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: newAllocatedUsersItem.included_usage,
		balance: newAllocatedUsersItem.included_usage - seatsUsed, // 5 - 3 = 2
		usage: seatsUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE EXCEEDS INCLUDED (usage > included)
// ═══════════════════════════════════════════════════════════════════════════════

// Increase seat allowance (original test moved from update-paid-features.test.ts)
test.concurrent(`${chalk.yellowBright("allocated: increase seat allowance")}`, async () => {
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 2 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [allocatedUsersItem, priceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "alloc-inc-seats",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Use 2 seats (at the limit)
	const seatsUsed = 2;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: seatsUsed,
		},
		{ timeout: 2000 },
	);

	// Increase to 5 included seats
	const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 5 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newAllocatedUsersItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No price change, just seat increase
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage preserved, more capacity available
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: newAllocatedUsersItem.included_usage,
		balance: newAllocatedUsersItem.included_usage - seatsUsed,
		usage: seatsUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// Decrease seat allowance below usage (original test moved from update-paid-features.test.ts)
test.concurrent(`${chalk.yellowBright("allocated: decrease seat allowance below usage")}`, async () => {
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 5 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [allocatedUsersItem, priceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "alloc-dec-seats",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Use 5 seats
	const seatsUsed = 5;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: seatsUsed,
		},
		{ timeout: 2000 },
	);

	// Decrease to 3 included seats (using 5, so 2 extra)
	const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 3 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newAllocatedUsersItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should charge $20 for 2 extra seats @ $10 each
	expect(preview.total).toBe(20);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Using 5 with 3 included = -2 balance
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: newAllocatedUsersItem.included_usage,
		balance: newAllocatedUsersItem.included_usage - seatsUsed,
		usage: seatsUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// Update when already in overage, increase allowance but still in overage
test.concurrent(`${chalk.yellowBright("allocated: increase allowance, still in overage")}`, async () => {
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 2 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [allocatedUsersItem, priceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "alloc-inc-still-over",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Use 10 seats (8 over the 2 included)
	// NOTE: For allocated features, tracking usage past the included boundary
	// immediately creates a prorated invoice (see adjustAllowance.ts)
	const seatsUsed = 10;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: seatsUsed,
		},
		{ timeout: 2000 },
	);

	// Increase to 5 included (still 5 over)
	const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 5 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newAllocatedUsersItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Was paying for 8 extra seats, now paying for 5 extra seats
	// Credit for 3 seats @ $10 = -$30
	expect(preview.total).toBe(-30);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: newAllocatedUsersItem.included_usage,
		balance: newAllocatedUsersItem.included_usage - seatsUsed, // 5 - 10 = -5
		usage: seatsUsed,
	});

	// Invoice count: 1 (initial attach) + 1 (track overage) + 1 (update) = 3
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// BOUNDARY CROSSING: USAGE GOES FROM > INCLUDED TO < INCLUDED
// ═══════════════════════════════════════════════════════════════════════════════

// Increase allowance so usage goes from overage to within included
test.concurrent(`${chalk.yellowBright("allocated: increase allowance, usage crosses from overage to within included")}`, async () => {
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 3 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [allocatedUsersItem, priceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "alloc-boundary-over-to-under",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Use 5 seats (2 over the 3 included)
	// NOTE: For allocated features, tracking usage past the included boundary
	// immediately creates a prorated invoice (see adjustAllowance.ts)
	const seatsUsed = 5;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: seatsUsed,
		},
		{ timeout: 2000 },
	);

	// Verify we're in overage initially
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Users].balance).toBe(-2);

	// Increase to 10 included seats - now usage (5) is within included (10)
	const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 10 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newAllocatedUsersItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Was paying for 2 extra seats @ $10 = $20
	// Now paying for 0 extra seats
	// Should get credit of -$20
	expect(preview.total).toBe(-20);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Now balance should be positive (10 - 5 = 5)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: newAllocatedUsersItem.included_usage,
		balance: newAllocatedUsersItem.included_usage - seatsUsed, // 10 - 5 = 5
		usage: seatsUsed,
	});

	// Balance should now be positive
	expect(customer.features[TestFeature.Users].balance).toBeGreaterThan(0);

	// Invoice count: 1 (initial attach) + 1 (track overage) + 1 (update credit) = 3
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// Increase allowance to exactly match usage (boundary case)
test.concurrent(`${chalk.yellowBright("allocated: increase allowance to exactly match usage")}`, async () => {
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 3 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [allocatedUsersItem, priceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "alloc-boundary-exact",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Use 5 seats (2 over the 3 included)
	// NOTE: For allocated features, tracking usage past the included boundary
	// immediately creates a prorated invoice (see adjustAllowance.ts)
	const seatsUsed = 5;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: seatsUsed,
		},
		{ timeout: 2000 },
	);

	// Increase to exactly 5 included seats - matches usage exactly
	const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 5 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newAllocatedUsersItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Was paying for 2 extra seats @ $10 = $20
	// Now paying for 0 extra seats
	// Should get credit of -$20
	expect(preview.total).toBe(-20);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance should be exactly 0 (5 - 5 = 0)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: newAllocatedUsersItem.included_usage,
		balance: 0, // 5 - 5 = 0
		usage: seatsUsed,
	});

	// Invoice count: 1 (initial attach) + 1 (track overage) + 1 (update credit) = 3
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// Decrease allowance so usage goes from within included to overage
test.concurrent(`${chalk.yellowBright("allocated: decrease allowance, usage crosses from within to overage")}`, async () => {
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 10 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [allocatedUsersItem, priceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "alloc-boundary-under-to-over",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Use 5 seats (within the 10 included)
	const seatsUsed = 5;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: seatsUsed,
		},
		{ timeout: 2000 },
	);

	// Verify we're within included initially
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Users].balance).toBe(5); // 10 - 5 = 5

	// Decrease to 3 included seats - now usage (5) exceeds included (3)
	const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 3 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newAllocatedUsersItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Was paying for 0 extra seats
	// Now paying for 2 extra seats @ $10 = $20
	expect(preview.total).toBe(20);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Now balance should be negative (3 - 5 = -2)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: newAllocatedUsersItem.included_usage,
		balance: newAllocatedUsersItem.included_usage - seatsUsed, // 3 - 5 = -2
		usage: seatsUsed,
	});

	// Balance should now be negative
	expect(customer.features[TestFeature.Users].balance).toBeLessThan(0);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

// Zero usage, increase allowance
test.concurrent(`${chalk.yellowBright("allocated: zero usage, increase allowance")}`, async () => {
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 2 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [allocatedUsersItem, priceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "alloc-zero-inc",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// No usage tracked - 0 seats used

	const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 10 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newAllocatedUsersItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// No price change
	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: newAllocatedUsersItem.included_usage,
		balance: newAllocatedUsersItem.included_usage, // 10 - 0 = 10
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// No included seats (all paid), increase to some included
test.concurrent(`${chalk.yellowBright("allocated: no included to some included")}`, async () => {
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 0 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [allocatedUsersItem, priceItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "alloc-none-to-some",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Use 5 seats (all paid since 0 included)
	const seatsUsed = 5;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: seatsUsed,
		},
		{ timeout: 2000 },
	);

	// Increase to 3 included seats (still 2 paid)
	const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 3 });

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [newAllocatedUsersItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Was paying for 5 seats @ $10 = $50
	// Now paying for 2 seats @ $10 = $20
	// Credit of -$30
	expect(preview.total).toBe(-30);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: newAllocatedUsersItem.included_usage,
		balance: newAllocatedUsersItem.included_usage - seatsUsed, // 3 - 5 = -2
		usage: seatsUsed,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
