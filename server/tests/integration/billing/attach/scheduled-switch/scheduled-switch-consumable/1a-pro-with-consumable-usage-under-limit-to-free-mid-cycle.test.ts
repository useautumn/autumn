/**
 * Scheduled Switch Consumable Tests (Attach V2)
 *
 * Tests for downgrades involving consumable (usage-in-arrear) features.
 *
 * Key behaviors:
 * - Consumable overage is charged at cycle end via invoice-created webhook
 * - These tests verify the downgrade flow works correctly with consumable usage
 * - Overage from the old product is billed when downgrade completes
 */

import { test } from "bun:test";
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
// TEST 1: Pro with consumable, usage under limit, to free
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 50 messages (under included usage)
 * - Downgrade to free
 * - Advance to cycle end
 *
 * Expected Result:
 * - Scheduled downgrade with no overage charged at cycle end
 * - After cycle: pro removed, free active
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-consumable 1a: pro with consumable, usage under limit, to free (mid-cycle)")}`,
	async () => {
		const customerId = "sched-switch-cons-under-limit-a";

		const consumableItem = items.consumableMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [consumableItem],
		});

		const freeMessages = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({
			id: "free",
			items: [freeMessages],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({ featureId: TestFeature.Messages, value: 50 }), // Under included
			],
		});

		// Verify Stripe subscription after initial attach
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		// Verify balance before downgrade (100 included - 50 used = 50)
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Messages,
			balance: 50,
			usage: 50,
		});

		// Downgrade to free
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: free.id,
			redirect_mode: "if_required",
		});

		const customerMidCycle =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Verify states
		await expectProductCanceling({
			customer: customerMidCycle,
			productId: pro.id,
		});
		await expectProductScheduled({
			customer: customerMidCycle,
			productId: free.id,
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
