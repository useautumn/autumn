import { test } from "bun:test";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

/**
 * Compatibility Tests: v2 Update Subscription + v1 Attach/Cancel
 *
 * These tests verify that the new v2 scheduling code (handleUpdateSubscription)
 * works correctly with the old attach/cancel flows (handleScheduleFlow2, handleUpgradeFlow).
 *
 * The key interaction is when BOTH systems modify the same Stripe subscription schedule.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN A: Attach/Cancel Creates Schedule → v2 Update Modifies It
// ═══════════════════════════════════════════════════════════════════════════════

// Test 1: Downgrade via attach creates schedule, then v2 update modifies the current phase items
test.concurrent(`${chalk.yellowBright("compat: downgrade creates schedule, v2 update modifies it")}`, async () => {
	const customerId = "compat-downgrade-then-update";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const premium = constructProduct({
		id: "premium",
		items: [messagesItem],
		type: "premium",
		isDefault: false,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: "premium", entityIndex: 0 })],
	});

	// Step 1: Downgrade from Premium to Pro via attach (creates schedule)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
	});

	// Verify entity has Premium canceling (active but with canceled_at set) and Pro scheduled
	const entityAfterDowngrade = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entityAfterDowngrade,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entityAfterDowngrade,
		productId: pro.id,
	});

	// Step 2: Update Premium's items via v2 (should modify the schedule's current phase)
	const newPriceItem = items.monthlyPrice({ price: 60 }); // Add a price to Premium

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: premium.id,
		items: [messagesItem, newPriceItem],
	});

	// Verify Premium still canceling with updated items, Pro still scheduled
	const entityAfterUpdate = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entityAfterUpdate,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entityAfterUpdate,
		productId: pro.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// After cycle: Premium gone, Pro active
	const entityAfterCycle = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	await expectProductNotPresent({
		customer: entityAfterCycle,
		productId: premium.id,
	});
	await expectProductActive({
		customer: entityAfterCycle,
		productId: pro.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN B: Multi-Entity - One Creates Schedule, v2 Updates, Then Attach Also Modifies
// ═══════════════════════════════════════════════════════════════════════════════

// Test 2: Entity 1 downgrades (creates schedule), Entity 2 updates via v2, then Entity 2 downgrades
test.concurrent(`${chalk.yellowBright("compat: e1 downgrade, e2 v2 update, e2 downgrade")}`, async () => {
	const customerId = "compat-multi-entity-mixed";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const premium = constructProduct({
		id: "premium",
		items: [messagesItem],
		type: "premium",
		isDefault: false,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: "premium", entityIndex: 0 }),
			s.attach({ productId: "premium", entityIndex: 1 }),
		],
	});

	// Step 1: Entity 1 downgrades from Premium to Pro (creates schedule)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
	});

	// Verify Entity 1 has Premium canceling and Pro scheduled
	const entity1AfterDowngrade = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entity1AfterDowngrade,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entity1AfterDowngrade,
		productId: pro.id,
	});

	// Step 2: Entity 2 updates Premium's items via v2 (modifies the schedule)
	const newPriceItem = items.monthlyPrice({ price: 70 });

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: premium.id,
		items: [messagesItem, newPriceItem],
	});

	// Verify Entity 2 still on Premium with updated items
	const entity2AfterUpdate = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity2AfterUpdate,
		productId: premium.id,
	});

	// Step 3: Entity 2 also downgrades to Pro (modifies the same schedule again)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
	});

	// Verify both entities have Premium canceling and Pro scheduled
	const entity1Final = await autumnV1.entities.get(customerId, entities[0].id);
	const entity2Final = await autumnV1.entities.get(customerId, entities[1].id);

	await expectProductCanceling({
		customer: entity1Final,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entity1Final,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: entity2Final,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entity2Final,
		productId: pro.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// After cycle: Both entities on Pro
	const entity1AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);

	await expectProductNotPresent({
		customer: entity1AfterCycle,
		productId: premium.id,
	});
	await expectProductActive({
		customer: entity1AfterCycle,
		productId: pro.id,
	});
	await expectProductNotPresent({
		customer: entity2AfterCycle,
		productId: premium.id,
	});
	await expectProductActive({
		customer: entity2AfterCycle,
		productId: pro.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});
