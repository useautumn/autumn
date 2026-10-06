// Scheduled switch prepaid (Attach V2): downgrades keep the total prepaid quantity, converted and
// rounded to the new plan's billing units when no options are passed.

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
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
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-prepaid 3: no options, different billing units")}`,
	async () => {
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
	},
);

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
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-prepaid 4: to quantity 0")}`,
	async () => {
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
	},
);
