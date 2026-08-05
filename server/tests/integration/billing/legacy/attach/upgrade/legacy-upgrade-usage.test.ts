/**
 * Legacy Upgrade Tests - Usage-based Billing (slice 1 of 2)
 *
 * Migrated from:
 * - server/tests/attach/upgrade/upgrade1.test.ts (Pro → Premium → Growth with consumable Words)
 * - server/tests/attach/upgrade/upgrade2.test.ts (Pro monthly → Pro annual → Premium annual)
 *
 * Tests V1 attach behavior for product upgrades with usage-based billing:
 * - Consumable (arrear) billing upgrades
 * - Monthly to annual interval changes
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { quiesceCustomerWebhooks } from "@tests/integration/billing/utils/quiesceCustomerWebhooks";
import { waitForCustomerUsageInDb } from "@tests/integration/billing/utils/waitForUsageInDb";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade with consumable (arrear) billing - Pro → Premium → Growth
// (from upgrade1)
//
// Scenario:
// - Pro ($20/month) with consumable Words (100 included, $0.05/overage)
// - Premium ($50/month) with consumable Words (100 included)
// - Growth ($100/month) with consumable Words (100 included)
// - Attach Pro, track 200 words (100 overage = $5), upgrade to Premium
// - Track 300 words (200 overage = $10), upgrade to Growth
//
// Expected:
// - Customer has correct product and balance after each upgrade
// - Invoice totals include base price diff + overage charges
// - Usage resets after each upgrade
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-upgrade-usage 1: consumable upgrades Pro → Premium → Growth")}`,
	async () => {
		const customerId = "legacy-upgrade-usage-1";

		// Consumable words: 100 included, $0.05/overage
		const proWords = items.consumableWords({ includedUsage: 100 });
		const premiumWords = items.consumableWords({ includedUsage: 100 });
		const growthWords = items.consumableWords({ includedUsage: 100 });

		const pro = products.pro({ id: "pro", items: [proWords] });
		const premium = products.premium({ id: "premium", items: [premiumWords] });
		const growth = products.growth({ id: "growth", items: [growthWords] });

		// Setup: Create customer and products, attach Pro
		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, premium, growth] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		// Verify initial state after Pro attach
		const customerInitial =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerInitial,
			active: [pro.id],
		});

		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Words,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer: customerInitial,
			count: 1,
			latestTotal: 20, // Pro base price
		});

		// Let the Pro attach's Stripe webhooks land BEFORE tracking: one arriving
		// inside the track→sync window deletes the cached balance and the deduction
		// is dropped, which reads back as the balance never having moved.
		await quiesceCustomerWebhooks({
			stripeCli: ctx.stripeCli,
			autumn: autumnV1,
			customerId,
		});

		// Track 200 words (100 overage at $0.05 = $5)
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: 200,
		});

		// Gate on the deduction reaching Postgres: while it lives only in Redis, a
		// late Stripe webhook from the Pro attach can invalidate the cache and drop
		// it, and the balance silently reverts to 100.
		await waitForCustomerUsageInDb({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Words,
			balance: -100,
			usage: 200,
		});

		// Verify state before upgrade (in overage)
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Words,
			includedUsage: 100,
			balance: -100, // 100 - 200 = -100 (overage)
			usage: 200,
		});

		// Upgrade to Premium
		// Expected: $50 - $20 = $30 price diff + $5 overage = $35
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		const customerAfterPremium =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterPremium,
			active: [premium.id],
		});

		// Usage resets after upgrade
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Words,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer: customerAfterPremium,
			count: 2,
			latestTotal: 35, // $30 price diff + $5 overage
		});

		// Same sequencing for the Premium upgrade's own webhooks.
		await quiesceCustomerWebhooks({
			stripeCli: ctx.stripeCli,
			autumn: autumnV1,
			customerId,
		});

		// Track 300 words (200 overage at $0.05 = $10)
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: 300,
		});

		await waitForCustomerUsageInDb({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Words,
			balance: -200,
			usage: 300,
		});

		// Verify state before Growth upgrade (in overage)
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Words,
			includedUsage: 100,
			balance: -200, // 100 - 300 = -200 (overage)
			usage: 300,
		});

		// Upgrade to Growth
		// Expected: $100 - $50 = $50 price diff + $10 overage = $60
		await autumnV1.attach({
			customer_id: customerId,
			product_id: growth.id,
		});

		const customerAfterGrowth =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterGrowth,
			active: [growth.id],
		});

		// Usage resets after upgrade
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Words,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer: customerAfterGrowth,
			count: 3,
			latestTotal: 60, // $50 price diff + $10 overage
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade with interval change - Monthly → Annual
// (from upgrade2)
//
// Scenario:
// - Pro monthly ($20/month) with consumable Words (100 included, $0.05/overage)
// - Pro annual ($200/year) with consumable Words (100 included)
// - Premium annual ($500/year) with consumable Words (100 included)
// - Attach Pro monthly, track 150 words (50 overage = $2.50), advance 2 weeks
// - Upgrade to Pro annual
// - Track 200 words (100 overage = $5), upgrade to Premium annual
//
// Expected:
// - Customer has correct product and balance after each upgrade
// - Interval changes correctly from monthly to annual
// - Invoice totals include prorated price diff + overage charges
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-upgrade-usage 2: monthly → annual interval change")}`,
	async () => {
		const customerId = "legacy-upgrade-usage-2";

		const proMonthlyWords = items.consumableWords({ includedUsage: 100 });
		const proAnnualWords = items.consumableWords({ includedUsage: 100 });
		const premiumAnnualWords = items.consumableWords({ includedUsage: 100 });

		const proMonthly = products.pro({
			id: "pro-monthly",
			items: [proMonthlyWords],
		});
		const proAnnual = products.proAnnual({
			id: "pro-annual",
			items: [proAnnualWords],
		});
		const premiumAnnual = constructProduct({
			id: "premium-annual",
			items: [premiumAnnualWords],
			type: "premium",
			isAnnual: true,
		});

		// Setup: Create customer and products, attach Pro monthly
		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [proMonthly, proAnnual, premiumAnnual] }),
			],
			actions: [s.attach({ productId: proMonthly.id })],
		});

		// Verify initial state after Pro monthly attach
		const customerInitial =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerInitial,
			active: [proMonthly.id],
		});

		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Words,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer: customerInitial,
			count: 1,
			latestTotal: 20, // Pro monthly base price
		});

		// Attach webhooks first, then track (see quiesceCustomerWebhooks).
		await quiesceCustomerWebhooks({
			stripeCli: ctx.stripeCli,
			autumn: autumnV1,
			customerId,
		});

		// Track 150 words (50 overage at $0.05 = $2.50)
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: 150,
		});

		// See the note on waitForCustomerUsageInDb — the deduction must reach
		// Postgres before anything else can invalidate the cached balance.
		await waitForCustomerUsageInDb({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Words,
			balance: -50,
			usage: 150,
		});

		// Verify state before Pro Annual upgrade
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Words,
			includedUsage: 100,
			balance: -50, // 100 - 150 = -50 (overage)
			usage: 150,
		});

		// Upgrade to Pro Annual
		// Price diff: $200 - $20 = $180 (but prorated based on remaining cycle)
		// Overage: 50 × $0.05 = $2.50
		await autumnV1.attach({
			customer_id: customerId,
			product_id: proAnnual.id,
		});

		const customerAfterProAnnual =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterProAnnual,
			active: [proAnnual.id],
		});

		// Usage resets after upgrade
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Words,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// Verify invoice count increased (exact total depends on proration)
		await expectCustomerInvoiceCorrect({
			customer: customerAfterProAnnual,
			count: 2,
		});

		// Same sequencing for the Pro Annual upgrade's own webhooks.
		await quiesceCustomerWebhooks({
			stripeCli: ctx.stripeCli,
			autumn: autumnV1,
			customerId,
		});

		// Track 200 words (100 overage at $0.05 = $5)
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: 200,
		});

		await waitForCustomerUsageInDb({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Words,
			balance: -100,
			usage: 200,
		});

		// Verify state before Premium Annual upgrade
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Words,
			includedUsage: 100,
			balance: -100, // 100 - 200 = -100 (overage)
			usage: 200,
		});

		// Upgrade to Premium Annual
		// Price diff: $500 - $200 = $300 (but prorated)
		// Overage: 100 × $0.05 = $5
		await autumnV1.attach({
			customer_id: customerId,
			product_id: premiumAnnual.id,
		});

		const customerAfterPremiumAnnual =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterPremiumAnnual,
			active: [premiumAnnual.id],
		});

		// Usage resets after upgrade
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Words,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// Verify invoice count increased
		await expectCustomerInvoiceCorrect({
			customer: customerAfterPremiumAnnual,
			count: 3,
		});
	},
);
