/**
 * Attach Add-on Tests (Attach V2) — slice 1 of 2
 *
 * Tests for attaching add-on products to customers.
 * Add-ons are additive - they never expire/cancel existing products.
 *
 * Key behaviors:
 * - Add-ons are always attached (never replace existing products)
 * - Features from add-ons combine with main product features
 * - Re-attaching same add-on creates separate customer_product records
 * - Multiple different add-ons can coexist
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Free add-on to Pro customer
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro ($20/mo) with 100 messages
 * - Attach free add-on with 200 words
 *
 * Expected:
 * - Both Pro and add-on active
 * - Messages from Pro (100), Words from add-on (200)
 * - No additional charge for add-on
 */
test.concurrent(
	`${chalk.yellowBright("addon 1: free addon to pro")}`,
	async () => {
		const customerId = "addon-free-to-pro";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro", items: [messagesItem] });

		const wordsItem = items.monthlyWords({ includedUsage: 200 });
		const freeAddon = products.base({
			id: "free-addon",
			items: [wordsItem],
			isAddOn: true,
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, freeAddon] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Preview add-on - should be free
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: freeAddon.id,
		});
		expect(preview.total).toBe(0);

		// Attach free add-on
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: freeAddon.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Both products active
		await expectCustomerProducts({
			customer,
			active: [pro.id, freeAddon.id],
		});

		// Messages from Pro
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// Words from add-on
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			includedUsage: 200,
			balance: 200,
			usage: 0,
		});

		// Only 1 invoice (Pro $20), no charge for free add-on
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 20,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Free add-on to Free customer
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product with 50 messages
 * - Attach free add-on with 100 words
 *
 * Expected:
 * - Both products active
 * - No invoices (both free)
 */
test.concurrent(
	`${chalk.yellowBright("addon 2: free addon to free")}`,
	async () => {
		const customerId = "addon-free-to-free";

		const messagesItem = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({ id: "free", items: [messagesItem] });

		const wordsItem = items.monthlyWords({ includedUsage: 100 });
		const freeAddon = products.base({
			id: "free-addon",
			items: [wordsItem],
			isAddOn: true,
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [free, freeAddon] })],
			actions: [s.billing.attach({ productId: free.id })],
		});

		// Preview add-on - should be free
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: freeAddon.id,
		});
		expect(preview.total).toBe(0);

		// Attach free add-on
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: freeAddon.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Both products active
		await expectCustomerProducts({
			customer,
			active: [free.id, freeAddon.id],
		});

		// Messages from free
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 50,
			balance: 50,
			usage: 0,
		});

		// Words from add-on
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// No invoices (both free)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 0,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: One-off add-on to Pro customer
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro ($20/mo) with 100 messages
 * - Attach one-off add-on with prepaid words ($10 base + $5/50 words)
 *
 * Expected:
 * - Both Pro and add-on active
 * - Invoice for add-on ($15)
 */
test.concurrent(
	`${chalk.yellowBright("addon 3: one-off addon to pro")}`,
	async () => {
		const customerId = "addon-oneoff-to-pro";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro", items: [messagesItem] });

		const oneOffWordsItem = items.oneOffWords({
			includedUsage: 0,
			billingUnits: 50,
			price: 5,
		});
		const oneOffAddon = products.oneOffAddOn({
			id: "oneoff-addon",
			items: [oneOffWordsItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, oneOffAddon] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Preview add-on - $10 base + $5 for 50 words = $15
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: oneOffAddon.id,
			options: [{ feature_id: TestFeature.Words, quantity: 50 }],
		});
		expect(preview.total).toBe(15);

		// Attach one-off add-on
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOffAddon.id,
			options: [{ feature_id: TestFeature.Words, quantity: 50 }],
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Both products active
		await expectCustomerProducts({
			customer,
			active: [pro.id, oneOffAddon.id],
		});

		// Messages from Pro
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// Words from one-off add-on
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			balance: 50,
			usage: 0,
		});

		// 2 invoices: Pro ($20) + add-on ($15)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 15,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: One-off add-on to Free customer (with payment method)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on free product with payment method
 * - Attach one-off add-on ($10 base + prepaid)
 *
 * Expected:
 * - Both products active
 * - Invoice for add-on only
 */
test.concurrent(
	`${chalk.yellowBright("addon 4: one-off addon to free")}`,
	async () => {
		const customerId = "addon-oneoff-to-free";

		const messagesItem = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({ id: "free", items: [messagesItem] });

		const oneOffWordsItem = items.oneOffWords({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const oneOffAddon = products.oneOffAddOn({
			id: "oneoff-addon",
			items: [oneOffWordsItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, oneOffAddon] }),
			],
			actions: [s.billing.attach({ productId: free.id })],
		});

		// Preview add-on - $10 base + $10 for 100 words = $20
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: oneOffAddon.id,
			options: [{ feature_id: TestFeature.Words, quantity: 100 }],
		});
		expect(preview.total).toBe(20);

		// Attach one-off add-on
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOffAddon.id,
			options: [{ feature_id: TestFeature.Words, quantity: 100 }],
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Both products active
		await expectCustomerProducts({
			customer,
			active: [free.id, oneOffAddon.id],
		});

		// Words from one-off add-on
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			balance: 100,
			usage: 0,
		});

		// 1 invoice for add-on ($20)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 20,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Recurring add-on to Pro customer
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro ($20/mo) with 100 messages
 * - Attach recurring add-on ($20/mo) with 200 words
 *
 * Expected:
 * - Both Pro and add-on active on same subscription
 * - Combined monthly charge ($40/mo)
 */
test.concurrent(
	`${chalk.yellowBright("addon 5: recurring addon to pro")}`,
	async () => {
		const customerId = "addon-recurring-to-pro";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro", items: [messagesItem] });

		const wordsItem = items.monthlyWords({ includedUsage: 200 });
		const recurringAddon = products.recurringAddOn({
			id: "recurring-addon",
			items: [wordsItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, recurringAddon] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Preview add-on - $20/mo
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: recurringAddon.id,
		});
		expect(preview.total).toBe(20);

		// Attach recurring add-on
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: recurringAddon.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Both products active
		await expectCustomerProducts({
			customer,
			active: [pro.id, recurringAddon.id],
		});

		// Messages from Pro
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// Words from recurring add-on
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			includedUsage: 200,
			balance: 200,
			usage: 0,
		});

		// 2 invoices: Pro ($20) + add-on ($20)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 20,
		});

		// Verify subscription has both products
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
