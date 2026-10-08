// Scheduled switch prepaid (Attach V2): downgrades keep the total prepaid quantity, converted and
// rounded to the new plan's billing units when no options are passed.

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
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
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-prepaid 7: included usage increase")}`,
	async () => {
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
				}),
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
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
			balance: 200, // 100 included + 200 purchased
			usage: 0,
		});
	},
);

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
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-prepaid 8: included usage decrease")}`,
	async () => {
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
			balance: 200,
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
			balance: 200,
			usage: 0,
		});

		// Verify Stripe subscription after scheduling downgrade
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
