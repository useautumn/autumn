/**
 * Immediate Switch Allocated Tests (Attach V2)
 *
 * Tests for upgrades involving allocated (seat-based) features.
 *
 * Key behaviors:
 * - Usage carries over on upgrade (seats are persistent)
 * - Overage is charged immediately when tracking over limit
 * - Upgrading to higher limit may resolve existing overage
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Free with free allocated to Pro with allocated (same included)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Free with free allocated users (3 included, no overage price)
 * - Track 2 users
 * - Upgrade to pro with allocated (3 included, $10/seat overage)
 *
 * Expected Result:
 * - Usage carries over (still 2)
 * - Balance = 3 - 2 = 1
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-allocated 1: free allocated to pro allocated")}`, async () => {
	const customerId = "imm-switch-free-alloc-to-pro";

	const freeAllocated = items.monthlyUsers({ includedUsage: 3 });
	const free = products.base({
		id: "free",
		items: [freeAllocated],
	});

	const proAllocated = items.allocatedUsers({ includedUsage: 3 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.billing.attach({ productId: free.id })],
	});

	// Track 2 users
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	// Wait for track to sync
	await new Promise((r) => setTimeout(r, 2000));

	// Verify usage before upgrade
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 1,
		usage: 2,
	});

	// 1. Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	// Pro base price: $20
	expect(preview.total).toBe(20);

	// 2. Attach pro (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [free.id],
	});

	// Verify usage carries over
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 1, // 3 - 2 = 1
		usage: 2,
	});

	// Verify invoice: pro ($20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Pro with allocated, under limit, to pro-variant (same included)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with 3 allocated (using 2)
 * - Upgrade to pro-variant with 3 allocated (same)
 *
 * Expected Result:
 * - No overage charge
 * - Usage carries over
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-allocated 2: allocated under limit, same included")}`, async () => {
	const customerId = "imm-switch-alloc-under-same";

	const proAllocated = items.allocatedUsers({ includedUsage: 3 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	// Pro variant with same allocated but different base price
	const proVariantAllocated = items.allocatedUsers({ includedUsage: 3 });
	const proVariant = products.premium({
		id: "pro-variant",
		items: [proVariantAllocated],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, proVariant] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Track 2 users
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	// Wait for track to sync
	await new Promise((r) => setTimeout(r, 2000));

	// 1. Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proVariant.id,
	});
	// Price difference: $50 - $20 = $30
	expect(preview.total).toBe(30);

	// 2. Attach pro-variant (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proVariant.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify pro-variant is active
	await expectProductActive({
		customer,
		productId: proVariant.id,
	});

	// Verify usage carries over
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 1, // 3 - 2 = 1
		usage: 2,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Pro with allocated, at limit, to pro-variant (same included)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with 3 allocated (using 3 - at limit)
 * - Upgrade to pro-variant with 3 allocated
 *
 * Expected Result:
 * - No overage charge (at limit, not over)
 * - Usage carries over
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-allocated 3: allocated at limit, same included")}`, async () => {
	const customerId = "imm-switch-alloc-at-limit";

	const proAllocated = items.allocatedUsers({ includedUsage: 3 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	const proVariantAllocated = items.allocatedUsers({ includedUsage: 3 });
	const proVariant = products.premium({
		id: "pro-variant",
		items: [proVariantAllocated],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, proVariant] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Track 3 users (at limit)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 3,
	});

	// Wait for track to sync
	await new Promise((r) => setTimeout(r, 2000));

	// Verify at limit before upgrade
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 0, // At limit
		usage: 3,
	});

	// 1. Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proVariant.id,
	});
	// Price difference: $50 - $20 = $30
	expect(preview.total).toBe(30);

	// 2. Attach pro-variant (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proVariant.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify pro-variant is active
	await expectProductActive({
		customer,
		productId: proVariant.id,
	});

	// Verify usage carries over
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 0, // 3 - 3 = 0
		usage: 3,
	});

	// Verify invoices: pro ($20) + upgrade ($30)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 30,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Pro with allocated, under limit, to premium with higher limit
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with 3 allocated (using 2)
 * - Upgrade to premium with 5 allocated
 *
 * Expected Result:
 * - No overage charge
 * - Usage carries over
 * - Balance = 5 - 2 = 3
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-allocated 4: allocated under limit, higher included")}`, async () => {
	const customerId = "imm-switch-alloc-under-higher";

	const proAllocated = items.allocatedUsers({ includedUsage: 3 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	const premiumAllocated = items.allocatedUsers({ includedUsage: 5 });
	const premium = products.premium({
		id: "premium",
		items: [premiumAllocated],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Track 2 users
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	// Wait for track to sync
	await new Promise((r) => setTimeout(r, 2000));

	// 1. Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// Price difference: $50 - $20 = $30
	expect(preview.total).toBe(30);

	// 2. Attach premium (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify premium is active
	await expectProductActive({
		customer,
		productId: premium.id,
	});

	// Verify usage carries over with higher limit
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: 3, // 5 - 2 = 3
		usage: 2,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Pro with allocated, over limit, to premium with higher limit
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with 3 allocated (using 5 - over by 2)
 * - Upgrade to premium with 10 allocated
 *
 * Expected Result:
 * - Existing overage handled (already billed at track time)
 * - Usage carries over
 * - Balance = 10 - 5 = 5 (now within limit)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-allocated 5: allocated over limit, higher included")}`, async () => {
	const customerId = "imm-switch-alloc-over-higher";

	const proAllocated = items.allocatedUsers({ includedUsage: 3 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	const premiumAllocated = items.allocatedUsers({ includedUsage: 10 });
	const premium = products.premium({
		id: "premium",
		items: [premiumAllocated],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Track 5 users (2 over limit at $10/seat = $20 overage)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 5,
	});

	// Wait for track to sync
	await new Promise((r) => setTimeout(r, 4000));

	// Verify over limit before upgrade
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: -2, // 3 - 5 = -2 (overage)
		usage: 5,
	});

	// Verify overage invoice was created on track
	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 2, // pro + overage
		latestTotal: 20, // 2 seats * $10/seat
	});

	// 1. Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// Base price difference: $50 - $20 = $30
	// Allocated seat adjustment:
	//   - Pro had 5 users with 3 included → 2 paid seats at $10 = $20 on subscription
	//   - Premium has 10 included → 5 users means 0 paid seats
	//   - Refund for 2 pro seats: -$20
	// Total: $30 (base diff) - $20 (seat refund) = $10
	expect(preview.total).toBe(10);

	// 2. Attach premium (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify premium is active
	await expectProductActive({
		customer,
		productId: premium.id,
	});

	// Verify usage carries over, now within new limit
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 10,
		balance: 5, // 10 - 5 = 5 (within limit now)
		usage: 5,
	});

	// Verify invoices: pro ($20) + overage ($20) + upgrade ($10)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 10,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Basic allocated usage carries over on upgrade
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with allocated users (3 included)
 * - Track 2 users
 * - Upgrade to premium with allocated (5 included)
 *
 * Expected Result:
 * - Usage carries over (still 2)
 * - Balance = 5 - 2 = 3
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-allocated 6: allocated usage carries over")}`, async () => {
	const customerId = "imm-switch-allocated-carry";

	const proAllocated = items.allocatedUsers({ includedUsage: 3 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	const premiumAllocated = items.allocatedUsers({ includedUsage: 5 });
	const premium = products.premium({
		id: "premium",
		items: [premiumAllocated],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Track 2 users
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 2,
	});

	// Wait for track to sync
	await new Promise((r) => setTimeout(r, 2000));

	// Verify usage before upgrade
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 1,
		usage: 2,
	});

	// 1. Preview upgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
	});
	// Price difference: $50 - $20 = $30
	expect(preview.total).toBe(30);

	// 2. Attach premium (upgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify premium is active
	await expectProductActive({
		customer,
		productId: premium.id,
	});

	// Verify usage carries over after upgrade
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: 3, // 5 included - 2 usage = 3
		usage: 2,
	});
});
