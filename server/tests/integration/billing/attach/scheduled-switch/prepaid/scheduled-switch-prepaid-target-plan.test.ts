// Scheduled switch prepaid (Attach V2): downgrades keep the total prepaid quantity, converted and
// rounded to the new plan's billing units when no options are passed.

import { test } from "bun:test";
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
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

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
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-prepaid 5: to product without prepaid feature")}`,
	async () => {
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
	},
);

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
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-prepaid 6: different price per pack")}`,
	async () => {
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
	},
);
