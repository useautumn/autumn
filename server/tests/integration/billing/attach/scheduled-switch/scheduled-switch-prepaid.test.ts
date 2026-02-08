/**
 * Scheduled Switch Prepaid Tests (Attach V2)
 *
 * Tests for downgrades involving prepaid features.
 *
 * Key behaviors:
 * - Total prepaid quantity is preserved on downgrade (rounded to new billing units)
 * - Example: 5 packs × 100 units = 500 units → new plan with 50 units/pack = 10 packs
 * - Without options, quantity is auto-converted to match total units
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Prepaid 5 packs to 2 packs (explicit options)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium with prepaid (500 units = 5 packs × 100 units/pack)
 * - Downgrade to pro with prepaid (200 units = 2 packs × 100 units/pack)
 *
 * Expected Result:
 * - 2 packs on next cycle
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-prepaid 1: 5 packs to 2 packs (explicit options)")}`, async () => {
	const customerId = "sched-switch-prepaid-5to2";

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
				timeout: 2000,
			}),
		],
	});

	// Verify Stripe subscription after initial attach
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Verify initial state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 500,
		usage: 0,
	});

	// Preview downgrade - should be $0 (scheduled)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});
	expect(preview.total).toBe(0);

	// Attach pro with explicit 2 packs (200 units)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify premium canceling, pro scheduled
	await expectProductCanceling({
		customer,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer,
		productId: pro.id,
	});

	// Balance still at premium's 500 until cycle end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
		usage: 0,
	});

	// Verify Stripe subscription after scheduling downgrade
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Prepaid downgrade, no options passed
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium with prepaid (500 units)
 * - Downgrade to pro with no options
 *
 * Expected Result:
 * - Total units preserved, converted to new billing units
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-prepaid 2: no options passed in")}`, async () => {
	const customerId = "sched-switch-prepaid-no-opts";

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
				timeout: 2000,
			}),
		],
	});

	// Verify Stripe subscription after initial attach
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Downgrade with NO options - should preserve 500 units
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify premium canceling, pro scheduled
	await expectProductCanceling({
		customer,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer,
		productId: pro.id,
	});

	// Verify Stripe subscription after scheduling downgrade
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Prepaid, no options, different billing units
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium with prepaid (500 units = 5 packs × 100 units/pack)
 * - Downgrade to pro with different billing units (50 units/pack)
 * - No options passed
 *
 * Expected Result:
 * - 500 units preserved → 10 packs on new plan (500 / 50 = 10)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-prepaid 3: no options, different billing units")}`, async () => {
	const customerId = "sched-switch-prepaid-diff-units";

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 50,
		price: 5,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
				timeout: 2000,
			}),
		],
	});

	// Verify Stripe subscription after initial attach
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Downgrade with NO options
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify premium canceling, pro scheduled
	await expectProductCanceling({
		customer,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer,
		productId: pro.id,
	});

	// Verify Stripe subscription after scheduling downgrade
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Prepaid to quantity 0
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium with prepaid (500 units)
 * - Downgrade to pro with quantity: 0
 *
 * Expected Result:
 * - No prepaid charged on next cycle
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-prepaid 4: to quantity 0")}`, async () => {
	const customerId = "sched-switch-prepaid-to-0";

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
				timeout: 2000,
			}),
		],
	});

	// Verify Stripe subscription after initial attach
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Preview downgrade with quantity 0
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
	});
	expect(preview.total).toBe(0); // Scheduled, no charge

	// Downgrade with quantity 0
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify states
	await expectProductCanceling({
		customer,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer,
		productId: pro.id,
	});

	// Verify Stripe subscription after scheduling downgrade
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Prepaid to product without prepaid feature
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium with prepaid (500 units)
 * - Downgrade to free (no prepaid feature)
 *
 * Expected Result:
 * - Balance lost at cycle end (free has no prepaid)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-prepaid 5: to product without prepaid feature")}`, async () => {
	const customerId = "sched-switch-prepaid-to-free";

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const freeMessages = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [freeMessages],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, free] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
			}),
		],
	});

	// Verify Stripe subscription after initial attach
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Downgrade to free
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify states
	await expectProductCanceling({
		customer,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer,
		productId: free.id,
	});

	// Balance still at premium's 500 until cycle end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
		usage: 0,
	});

	// Verify Stripe subscription after scheduling downgrade (scheduled to free)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Prepaid with different price per pack
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium with prepaid ($15/pack)
 * - Downgrade to pro with prepaid ($10/pack)
 *
 * Expected Result:
 * - Next cycle uses new price ($10/pack)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-prepaid 6: different price per pack")}`, async () => {
	const customerId = "sched-switch-prepaid-diff-price";

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
			}),
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
			}), // Downgrade with same quantity
			s.advanceToNextInvoice(),
		],
	});

	// Verify Stripe subscription after all operations
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After cycle: pro active
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [premium.id],
	});

	// Pro with 500 units active
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
		usage: 0,
	});

	// Invoices:
	// 1. Premium ($50 base + 5 packs * $15 = $125)
	// 2. Pro ($20 base + 5 packs * $10 = $70)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 70,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Prepaid included usage increase
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium with prepaid (0 included)
 * - Downgrade to pro with prepaid (100 included)
 *
 * Expected Result:
 * - Included usage changes on next cycle
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-prepaid 7: included usage increase")}`, async () => {
	const customerId = "sched-switch-prepaid-included-inc";

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const proPrepaid = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				timeout: 2000,
			}),
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				timeout: 2000,
			}),
			s.advanceToNextInvoice(),
		],
	});

	// Verify Stripe subscription after all operations
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After cycle: pro active with 100 included + 200 purchased = 300
	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 300, // 100 included + 200 purchased
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Prepaid included usage decrease
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Premium with prepaid (100 included)
 * - Downgrade to pro with prepaid (0 included)
 *
 * Expected Result:
 * - Included usage changes on next cycle
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-prepaid 8: included usage decrease")}`, async () => {
	const customerId = "sched-switch-prepaid-included-dec";

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 15,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumPrepaid],
	});

	const proPrepaid = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const pro = products.pro({
		id: "pro",
		items: [proPrepaid],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			s.billing.attach({
				productId: premium.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				timeout: 2000,
			}),
		],
	});

	// Verify Stripe subscription after initial attach
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Verify initial: 100 included + 200 purchased = 300
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		balance: 300,
		usage: 0,
	});

	// Downgrade to pro
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "if_required",
	});

	await timeout(2000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify states
	await expectProductCanceling({
		customer,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer,
		productId: pro.id,
	});

	// Balance still at premium's 300 until cycle end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 300,
		usage: 0,
	});

	// Verify Stripe subscription after scheduling downgrade
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
