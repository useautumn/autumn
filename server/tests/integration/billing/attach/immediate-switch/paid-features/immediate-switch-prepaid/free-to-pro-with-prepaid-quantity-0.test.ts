/**
 * Immediate Switch Prepaid Tests (Attach V2)
 *
 * Tests for upgrades involving prepaid features.
 *
 * IMPORTANT: Immediate switch always involves a DIFFERENT product.
 * You cannot update quantity on the same product via attach.
 *
 * Key behaviors:
 * - Prepaid items require options with quantity
 * - Quantity represents actual units, not packs
 * - Upgrading calculates price difference (refund old + charge new)
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Free to Pro with prepaid (quantity 0)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Free product
 * - Upgrade to pro with prepaid, quantity 0
 *
 * Expected Result:
 * - Only base price charged ($20)
 * - Balance = 0
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-prepaid 1: free to pro with prepaid, quantity 0")}`,
	async () => {
		const customerId = "imm-switch-prepaid-free-pro-0";

		const freeMessages = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({
			id: "free",
			items: [freeMessages],
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

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
			],
			actions: [s.billing.attach({ productId: free.id })],
		});

		// 1. Preview upgrade
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
		});
		expect(preview.total).toBe(20);

		// 2. Attach pro
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 0 }],
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [pro.id],
			notPresent: [free.id],
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 0,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 20,
		});
	},
);
