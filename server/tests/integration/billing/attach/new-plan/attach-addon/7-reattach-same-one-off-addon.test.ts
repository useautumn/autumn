/**
 * Attach Add-on Tests (Attach V2)
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

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Re-attach same one-off add-on (cumulative)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro with one-off add-on (50 words)
 * - Attach same one-off add-on again (50 more words)
 *
 * Expected:
 * - Two separate customer_product records
 * - Cumulative balance (50 + 50 = 100 words)
 */
test.concurrent(
	`${chalk.yellowBright("addon 7: reattach same one-off addon")}`,
	async () => {
		const customerId = "addon-reattach-oneoff";

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

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, oneOffAddon] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// First attach - 50 words
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOffAddon.id,
			options: [{ feature_id: TestFeature.Words, quantity: 50 }],
			redirect_mode: "if_required",
		});

		// Second attach - 50 more words
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOffAddon.id,
			options: [{ feature_id: TestFeature.Words, quantity: 50 }],
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Cumulative words balance (50 + 50 = 100)
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			balance: 100,
			usage: 0,
		});

		// 3 invoices: Pro ($20) + first add-on ($15) + second add-on ($15)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 3,
			latestTotal: 15,
		});
	},
);
