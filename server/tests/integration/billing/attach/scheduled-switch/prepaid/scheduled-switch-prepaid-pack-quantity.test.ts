// Scheduled switch prepaid (Attach V2): downgrades keep the total prepaid quantity, converted and
// rounded to the new plan's billing units when no options are passed.

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
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
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-prepaid 1: 5 packs to 2 packs (explicit options)")}`,
	async () => {
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
	},
);

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
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-prepaid 2: no options passed in")}`,
	async () => {
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
	},
);
