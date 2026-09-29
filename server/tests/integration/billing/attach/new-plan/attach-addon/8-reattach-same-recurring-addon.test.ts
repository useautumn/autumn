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
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Re-attach same recurring add-on (doubles subscription items)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro with recurring add-on (200 words, $20/mo)
 * - Attach same recurring add-on again
 *
 * Expected:
 * - Two separate customer_product records
 * - Double subscription items in Stripe
 * - Double balance/included usage (200 + 200 = 400 words)
 */
test.concurrent(
	`${chalk.yellowBright("addon 8: reattach same recurring addon")}`,
	async () => {
		const customerId = "addon-reattach-recurring";

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

		// First attach - 200 words, $20/mo
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: recurringAddon.id,
			redirect_mode: "if_required",
		});

		// Second attach - 200 more words, another $20/mo
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: recurringAddon.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Messages from Pro
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// Double words balance/included (200 + 200 = 400)
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			includedUsage: 400,
			balance: 400,
			usage: 0,
		});

		// 3 invoices: Pro ($20) + first add-on ($20) + second add-on ($20)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 3,
			latestTotal: 20,
		});

		// Verify subscription has doubled items - expectSubToBeCorrect validates this
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
