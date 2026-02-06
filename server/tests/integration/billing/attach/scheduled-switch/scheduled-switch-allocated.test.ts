/**
 * Scheduled Switch Allocated Tests (Attach V2)
 *
 * Tests for downgrades involving allocated (seat-based) features.
 *
 * Key behaviors:
 * - Allocated features: usage CARRIES OVER on product switch
 * - Overage is billed at cycle end when downgrade completes
 * - Scheduled downgrades complete at cycle end
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Premium to Pro downgrade with overage - full cycle test
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Key test: Downgrade with overage, usage carries over to new product
 *
 * Scenario:
 * - Premium ($50/mo) with 3 allocated users included
 * - Track 10 users (7 overage on Premium)
 * - Schedule downgrade to Pro ($20/mo) with 5 allocated users
 * - Advance to next cycle
 *
 * Expected:
 * - Preview = $0 (downgrade)
 * - After cycle: Pro active, Premium removed
 * - Usage carries over: 10 users
 * - Balance on Pro: 5 - 10 = -5 (overage)
 * - Invoice: Pro with 5 overage seats (10 usage - 5 included)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-allocated 1: premium to pro with overage, full cycle")}`, async () => {
	const customerId = "sched-switch-alloc-overage-full";

	const premiumAllocated = items.allocatedUsers({ includedUsage: 3 });
	const premium = products.premium({
		id: "premium",
		items: [premiumAllocated],
	});

	const proAllocated = items.allocatedUsers({ includedUsage: 5 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id }),
			s.track({ featureId: TestFeature.Users, value: 10, timeout: 2000 }),
		],
	});

	// Preview the downgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Downgrade = no charge
	expect(preview.total).toBe(0);

	// Schedule the downgrade
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify scheduled states
	await expectProductCanceling({
		customer,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer,
		productId: pro.id,
	});

	// Verify Stripe subscription before cycle advance
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Advance to next cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfterCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify products after cycle
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [pro.id],
		notPresent: [premium.id],
	});

	// Verify feature state after cycle
	// Usage carries over: 10 users
	// Pro included: 5 users
	// Balance: 5 - 10 = -5 (overage)
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: -5,
		usage: 10,
	});

	// Invoices: 1) Premium attach, 2) Premium overage from track, 3) Pro overage after cycle
	await expectCustomerInvoiceCorrect({
		customer: customerAfterCycle,
		count: 3,
		latestTotal: 5 * (proAllocated.price ?? 0) + 20, // Pro with 5 overage seats + base price
		latestInvoiceProductIds: [pro.id],
	});

	// Verify Stripe subscription after cycle
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Downgrade first, then track - usage carries over
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Key test: Schedule downgrade FIRST, then track usage - verifies usage
 * tracked while product is "canceling" still carries over
 *
 * Scenario:
 * - Premium ($50/mo) with 3 allocated users included
 * - Schedule downgrade to Pro ($20/mo) with 5 allocated users FIRST
 * - Track 10 users AFTER downgrade scheduled (7 overage on Premium)
 * - Advance to next cycle
 *
 * Expected:
 * - Usage tracked after scheduling carries over
 * - Invoice includes: Pro with 5 overage seats (10 usage - 5 included)
 * - Balance on Pro: 5 - 10 = -5 (overage)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-allocated 2: downgrade first, then track with overage")}`, async () => {
	const customerId = "sched-switch-alloc-downgrade-then-track";

	const premiumAllocated = items.allocatedUsers({ includedUsage: 3 });
	const premium = products.premium({
		id: "premium",
		items: [premiumAllocated],
	});

	const proAllocated = items.allocatedUsers({ includedUsage: 5 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	// Schedule downgrade FIRST (before tracking)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customerAfterSchedule =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify scheduled states
	await expectProductCanceling({
		customer: customerAfterSchedule,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerAfterSchedule,
		productId: pro.id,
	});

	// Now track usage AFTER downgrade is scheduled
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 10,
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Verify usage is tracked against the canceling product
	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfterTrack,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: -7, // 3 included - 10 used = -7 (overage on Premium)
		usage: 10,
	});

	// Advance to next cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfterCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify products after cycle
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [pro.id],
		notPresent: [premium.id],
	});

	// Verify feature state - usage carries over
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: -5, // 5 included - 10 usage = -5 (overage on Pro)
		usage: 10,
	});

	// Invoices: 1) Premium attach, 2) Premium overage from track, 3) Pro renewal after cycle
	await expectCustomerInvoiceCorrect({
		customer: customerAfterCycle,
		count: 3,
		latestTotal: 20 + 5 * (proAllocated.price ?? 0), // Pro base ($20) + 5 overage seats
		latestInvoiceProductIds: [pro.id],
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Pro to Free downgrade - no overage pricing on free
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Key test: Downgrade to free product (no overage pricing)
 *
 * Scenario:
 * - Pro ($20/mo) with 5 allocated users included
 * - Track 7 users (2 overage on Pro)
 * - Schedule downgrade to Free with 2 allocated users (no overage pricing)
 * - Advance to next cycle
 *
 * Expected:
 * - After cycle: Free active, Pro removed
 * - Invoice includes: Pro overage (2 users)
 * - Usage carries over: 7 users
 * - Balance on Free: 2 - 7 = -5 (overage, but no overage charge on free)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-allocated 3: pro to free, overage on old product")}`, async () => {
	const customerId = "sched-switch-alloc-pro-to-free";

	const proAllocated = items.allocatedUsers({ includedUsage: 5 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	const freeUsers = items.freeUsers({ includedUsage: 2 });
	const free = products.base({
		id: "free",
		items: [freeUsers],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Users, value: 7, timeout: 2000 }),
		],
	});

	// Schedule downgrade to free
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	const customerScheduled =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify scheduled states
	await expectProductCanceling({
		customer: customerScheduled,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerScheduled,
		productId: free.id,
	});

	// Advance to next cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfterCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify products after cycle
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [free.id],
		notPresent: [pro.id],
	});

	// Verify feature state - usage carries over
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Users,
		includedUsage: 2,
		balance: -5, // 2 included - 7 usage = -5 (overage)
		usage: 7,
	});

	// Invoices: 1) Pro attach, 2) Pro overage from track, 3) cycle end (no charge on free)
	await expectCustomerInvoiceCorrect({
		customer: customerAfterCycle,
		count: 3,
		latestTotal: 0, // Free has no renewal charge
		latestInvoiceProductIds: [],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Pro to Free - downgrade first, then track with overage
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Key test: Schedule downgrade to free FIRST, then track usage
 *
 * Scenario:
 * - Pro ($20/mo) with 5 allocated users included
 * - Schedule downgrade to Free with 2 allocated users FIRST
 * - Track 7 users AFTER downgrade scheduled (2 overage on Pro)
 * - Advance to next cycle
 *
 * Expected:
 * - Usage tracked after scheduling carries over
 * - Invoice includes: Pro overage (2 users)
 * - Usage carries over: 7 users
 * - Balance on Free: 2 - 7 = -5 (overage)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-allocated 4: pro to free, downgrade first then track")}`, async () => {
	const customerId = "sched-switch-alloc-pro-free-downgrade-first";

	const proAllocated = items.allocatedUsers({ includedUsage: 5 });
	const pro = products.pro({
		id: "pro",
		items: [proAllocated],
	});

	const freeUsers = items.freeUsers({ includedUsage: 2 });
	const free = products.base({
		id: "free",
		items: [freeUsers],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Schedule downgrade FIRST (before tracking)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	const customerAfterSchedule =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify scheduled states
	await expectProductCanceling({
		customer: customerAfterSchedule,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterSchedule,
		productId: free.id,
	});

	// Now track usage AFTER downgrade is scheduled
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 7,
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Verify usage is tracked against the canceling product
	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfterTrack,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: -2, // 5 included - 7 used = -2 (overage on Pro)
		usage: 7,
	});

	// Advance to next cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfterCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify products after cycle
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [free.id],
		notPresent: [pro.id],
	});

	// Verify feature state - usage carries over
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Users,
		includedUsage: 2,
		balance: -5, // 2 included - 7 usage = -5 (overage on Free)
		usage: 7,
	});

	// Invoices: 1) Pro attach, 2) Pro overage from track, 3) cycle end (no charge on free)
	await expectCustomerInvoiceCorrect({
		customer: customerAfterCycle,
		count: 3,
		latestTotal: 0, // Free has no renewal charge
		latestInvoiceProductIds: [],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Premium to Pro with FREE allocated users (usage carries over)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Key test: Downgrade with FREE allocated users - usage carries over
 *
 * Scenario:
 * - Premium ($50/mo) with 10 FREE allocated users (no overage pricing)
 * - Track 8 users
 * - Schedule downgrade to Pro ($20/mo) with 5 FREE allocated users
 * - Advance to next cycle
 *
 * Expected:
 * - Preview = $0 (downgrade)
 * - After cycle: Pro active, Premium removed
 * - Usage carries over: 8 users
 * - Balance on Pro: 5 - 8 = -3 (overage, but no overage charge since free allocated)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-allocated 5: premium to pro with FREE allocated users")}`, async () => {
	const customerId = "sched-switch-free-alloc-premium-to-pro";

	const premiumFreeUsers = items.freeAllocatedUsers({ includedUsage: 10 });
	const premium = products.premium({
		id: "premium",
		items: [premiumFreeUsers],
	});

	const proFreeUsers = items.freeAllocatedUsers({ includedUsage: 5 });
	const pro = products.pro({
		id: "pro",
		items: [proFreeUsers],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id }),
			s.track({ featureId: TestFeature.Users, value: 8, timeout: 2000 }),
		],
	});

	// Verify usage tracked on premium
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 10,
		balance: 2, // 10 - 8
		usage: 8,
	});

	// Preview the downgrade
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(0); // Downgrade = no charge

	// Schedule the downgrade
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customerScheduled =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify scheduled states
	await expectProductCanceling({
		customer: customerScheduled,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerScheduled,
		productId: pro.id,
	});

	// Advance to next cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfterCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify products after cycle
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [pro.id],
		notPresent: [premium.id],
	});

	// Verify feature state - usage carries over (FREE allocated)
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: -3, // 5 included - 8 usage = -3 (overage)
		usage: 8, // Usage CARRIES OVER
	});

	// Invoices: 1) Premium attach, 2) Pro renewal after cycle (no overage since free allocated)
	await expectCustomerInvoiceCorrect({
		customer: customerAfterCycle,
		count: 2,
		latestTotal: 20, // Pro base price only, no overage on free allocated
		latestInvoiceProductIds: [pro.id],
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Pro to Free with FREE allocated users (usage carries over)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Key test: Downgrade to free product with FREE allocated users
 *
 * Scenario:
 * - Pro ($20/mo) with 5 FREE allocated users (no overage pricing)
 * - Track 4 users
 * - Schedule downgrade to Free with 2 FREE allocated users
 * - Advance to next cycle
 *
 * Expected:
 * - After cycle: Free active, Pro removed
 * - Usage carries over: 4 users
 * - Balance on Free: 2 - 4 = -2 (overage, but no charge on free)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-allocated 6: pro to free with FREE allocated users")}`, async () => {
	const customerId = "sched-switch-free-alloc-pro-to-free";

	const proFreeUsers = items.freeAllocatedUsers({ includedUsage: 5 });
	const pro = products.pro({
		id: "pro",
		items: [proFreeUsers],
	});

	const freeFreeUsers = items.freeAllocatedUsers({ includedUsage: 2 });
	const free = products.base({
		id: "free",
		items: [freeFreeUsers],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Users, value: 4, timeout: 2000 }),
		],
	});

	// Verify usage tracked on pro
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: 1, // 5 - 4
		usage: 4,
	});

	// Schedule downgrade to free
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	const customerScheduled =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify scheduled states
	await expectProductCanceling({
		customer: customerScheduled,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerScheduled,
		productId: free.id,
	});

	// Advance to next cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfterCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify products after cycle
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [free.id],
		notPresent: [pro.id],
	});

	// Verify feature state - usage carries over (FREE allocated)
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Users,
		includedUsage: 2,
		balance: -2, // 2 included - 4 usage = -2 (overage)
		usage: 4, // Usage CARRIES OVER
	});

	// Invoices: 1) Pro attach, 2) cycle end (no charge on free, no overage on free allocated)
	await expectCustomerInvoiceCorrect({
		customer: customerAfterCycle,
		count: 2,
		latestTotal: 0, // Free has no renewal charge
		latestInvoiceProductIds: [],
	});
});
