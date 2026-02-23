/**
 * Legacy Attach V1 Upgrade Tests
 *
 * Migrated from:
 * - server/tests/attach/upgradeOld/upgradeOld4.test.ts (upgrade with payment method validation)
 * - server/tests/interval/upgrade/interval1.test.ts (upgrade monthly to annual mid-cycle)
 * - server/tests/interval/upgrade/interval2.test.ts (upgrade monthly to annual after 1.5 cycles)
 *
 * Tests V1 attach behavior for product upgrades:
 * - Payment method validation during upgrade
 * - Billing interval changes (monthly to annual)
 * - next_cycle verification
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ProductItemInterval } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addYears } from "date-fns";
import { attachPmToCus } from "@/external/stripe/stripeCusUtils";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";
import { getCusSub } from "@/utils/scriptUtils/testUtils/cusTestUtils";
import { toMilliseconds } from "@/utils/timeUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade with payment method validation
// (from upgradeOld4)
//
// Scenario:
// - Pro product ($20/month) with Dashboard (boolean), Messages (10 included), Admin (unlimited)
// - Premium product ($50/month) with Messages (100 included)
// - Attach Pro without payment method
// - Try to upgrade with force_checkout (should fail)
// - Attach successful payment method
// - Upgrade to Premium (should succeed)
//
// Expected:
// - force_checkout fails without valid payment method
// - Upgrade succeeds after attaching payment method
// - Customer has Premium active with correct features
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-upgrade 1: upgrade with payment method validation")}`, async () => {
	const customerId = "legacy-upgrade-1";

	// Pro: $20/month with Dashboard, Messages (10), Admin (unlimited)
	const proProduct = constructProduct({
		id: "pro",
		type: "pro",
		items: [
			constructFeatureItem({
				featureId: TestFeature.Dashboard,
				isBoolean: true,
			}),
			constructFeatureItem({
				featureId: TestFeature.Messages,
				includedUsage: 10,
				interval: ProductItemInterval.Month,
			}),
			constructFeatureItem({
				featureId: TestFeature.Admin,
				unlimited: true,
			}),
		],
	});

	// Premium: $50/month with Messages (100)
	const premiumProduct = constructProduct({
		id: "premium",
		type: "premium",

		items: [
			constructFeatureItem({
				featureId: TestFeature.Messages,
				includedUsage: 100,
				interval: ProductItemInterval.Month,
			}),
		],
	});

	// Setup without payment method initially
	const { autumnV1, customer } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }), // No payment method
			s.products({ list: [proProduct, premiumProduct] }),
		],
		actions: [],
	});

	// Attach Pro (no payment = free/trial)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: proProduct.id,
	});

	const customerAfterPro =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPro,
		active: [proProduct.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterPro,
		featureId: TestFeature.Messages,
		includedUsage: 10,
		balance: 10,
		usage: 0,
	});

	// Try force_checkout without payment method - should fail
	await expectAutumnError({
		func: async () => {
			await autumnV1.attach({
				customer_id: customerId,
				product_id: premiumProduct.id,
				force_checkout: true,
			});
		},
	});

	// Attach successful payment method
	await attachPmToCus({
		db: ctx.db,
		customer,
		org: ctx.org,
		env: ctx.env,
	});

	// Now upgrade to Premium should succeed
	await autumnV1.attach({
		customer_id: customerId,
		product_id: premiumProduct.id,
	});

	const customerAfterPremium =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterPremium,
		active: [premiumProduct.id],
	});

	expectCustomerFeatureCorrect({
		customer: customerAfterPremium,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Should have invoice for upgrade
	await expectCustomerInvoiceCorrect({
		customer: customerAfterPremium,
		count: 2, // Just the upgrade invoice since Pro was trial/free
		latestTotal: 30, // Premium $50
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade from Pro monthly to Pro Annual mid-cycle
// (from interval1)
//
// Scenario:
// - Pro monthly ($20/month) with Words feature
// - Pro Annual ($200/year) with Words feature
// - Attach Pro monthly
// - Advance clock 2 weeks (mid-cycle)
// - Upgrade to Pro Annual
//
// Expected:
// - next_cycle.starts_at ≈ 1 year from now
// - Stripe subscription period_end matches next_cycle
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-upgrade 2: upgrade monthly to annual mid-cycle")}`, async () => {
	const customerId = "legacy-upgrade-2";

	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [wordsItem] });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [wordsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, proAnnual] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ weeks: 2 }),
		],
	});

	// Get checkout preview with next_cycle
	const checkoutRes = await autumnV1.checkout({
		customer_id: customerId,
		product_id: proAnnual.id,
	});

	expect(checkoutRes.next_cycle).toBeDefined();
	expect(checkoutRes.next_cycle?.starts_at).toBeCloseTo(
		addYears(new Date(), 1).getTime(),
		-Math.log10(toMilliseconds.days(1)),
	);

	// Upgrade to Pro Annual
	await autumnV1.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});

	// Verify Stripe subscription period_end matches checkout preview
	const sub = await getCusSub({
		ctx,
		customerId,
		productId: proAnnual.id,
	});

	const subItem = sub!.items.data[0];
	expect(subItem.current_period_end * 1000).toBeCloseTo(
		checkoutRes.next_cycle?.starts_at ?? 0,
		-Math.log10(toMilliseconds.days(1)),
	);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Upgrade from Pro monthly to Pro Annual after 1.5 cycles
// (from interval2)
//
// Scenario:
// - Pro monthly ($20/month) with Words feature
// - Pro Annual ($200/year) with Words feature
// - Attach Pro monthly
// - Advance clock 1 month + 2 weeks (1.5 cycles)
// - Upgrade to Pro Annual
//
// Expected:
// - next_cycle.starts_at ≈ 1 year from now
// - Stripe subscription period_end matches next_cycle
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("legacy-upgrade 3: upgrade monthly to annual after 1.5 cycles")}`, async () => {
	const customerId = "legacy-upgrade-3";

	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [wordsItem] });
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [wordsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro, proAnnual] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ months: 1, weeks: 2 }),
		],
	});

	// Get checkout preview with next_cycle
	const checkoutRes = await autumnV1.checkout({
		customer_id: customerId,
		product_id: proAnnual.id,
	});

	expect(checkoutRes.next_cycle).toBeDefined();
	expect(checkoutRes.next_cycle?.starts_at).toBeCloseTo(
		addYears(new Date(), 1).getTime(),
		-Math.log10(toMilliseconds.days(1)),
	);

	// Upgrade to Pro Annual
	await autumnV1.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});

	// Verify Stripe subscription period_end matches checkout preview
	const sub = await getCusSub({
		ctx,
		customerId,
		productId: proAnnual.id,
	});

	const subItem = sub!.items.data[0];
	expect(subItem.current_period_end * 1000).toBeCloseTo(
		checkoutRes.next_cycle?.starts_at ?? 0,
		-Math.log10(toMilliseconds.days(1)),
	);
});
