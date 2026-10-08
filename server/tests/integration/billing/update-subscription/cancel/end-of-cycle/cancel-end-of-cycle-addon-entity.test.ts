// Cancel end-of-cycle add-on tests: add-on cancellation, subscription handling, and interaction with
// main products.

import { test } from "bun:test";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Entity-level add-on cancel EOC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro product ($20/mo)
 * - Entity has Add-on product ($20/mo)
 * - User cancels Add-on at end of cycle on entity
 *
 * Expected Result:
 * - Entity's Pro remains active
 * - Entity's Add-on is canceling
 * - After advancing to next invoice:
 *   - Entity's Pro is still active
 *   - Entity's Add-on is removed
 */
test.concurrent(
	`${chalk.yellowBright("cancel addon EOC: entity-level addon cancel")}`,
	async () => {
		const customerId = "cancel-addon-eoc-entity";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
				s.entities({ count: 1, featureId: "users" }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: addon.id, entityIndex: 0 }),
			],
		});

		const entityId = entities[0].id;

		// Verify pro and add-on are active on entity
		const entityAfterAttach = await autumnV1.entities.get(customerId, entityId);

		await expectProductActive({
			customer: entityAfterAttach,
			productId: pro.id,
		});
		await expectProductActive({
			customer: entityAfterAttach,
			productId: addon.id,
		});

		// Cancel add-on at end of cycle on entity
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entityId,
			product_id: addon.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Verify state after cancel
		const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);

		await expectProductActive({
			customer: entityAfterCancel,
			productId: pro.id,
		});
		await expectProductCanceling({
			customer: entityAfterCancel,
			productId: addon.id,
		});

		// Advance to next billing cycle
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		// Verify state after cycle
		const entityAfterAdvance = await autumnV1.entities.get(
			customerId,
			entityId,
		);

		await expectProductActive({
			customer: entityAfterAdvance,
			productId: pro.id,
		});
		await expectProductNotPresent({
			customer: entityAfterAdvance,
			productId: addon.id,
		});
	},
);
