/**
 * Scheduled Switch Entity Basic Tests (Attach V2)
 *
 * Tests for basic downgrade scenarios involving multiple entities (sub-accounts).
 *
 * Key behaviors:
 * - Each entity has independent product states
 * - Downgrades on one entity don't affect other entities
 * - Scheduled products can be replaced independently per entity
 */

import { test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Entity 1 pro, entity 2 pro, downgrade entity 1 to free
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both entities on pro ($20/mo each)
 * - Downgrade entity 1 to free
 *
 * Expected Result:
 * - Entity 1 has pro canceling + free scheduled
 * - Entity 2 unchanged (pro active)
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-entities-basic 1: entity 1 pro, entity 2 pro, downgrade entity 1 to free")}`, async () => {
	const customerId = "sched-switch-ent-one-downgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const freeMessages = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({
		id: "free",
		items: [freeMessages],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	// Verify Stripe subscription after initial attaches
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Downgrade entity 1 to free
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		entity_id: entities[0].id,
		redirect_mode: "if_required",
	});

	// Verify entity 1: pro canceling, free scheduled
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entity1,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: entity1,
		productId: free.id,
	});

	// Verify entity 2: pro still active
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity2,
		productId: pro.id,
	});

	// Verify Stripe subscription after scheduling downgrade
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity 1 pro, entity 2 pro, downgrade both to free
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both entities on pro
 * - Downgrade both to free
 * - Advance cycle
 *
 * Expected Result:
 * - Both have free scheduled
 * - After cycle: both on free
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-entities-basic 2: entity 1 pro, entity 2 pro, downgrade both to free")}`, async () => {
	const customerId = "sched-switch-ent-both-downgrade";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const freeMessages = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({
		id: "free",
		items: [freeMessages],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
			s.billing.attach({ productId: free.id, entityIndex: 0 }), // Downgrade entity 1
			s.billing.attach({ productId: free.id, entityIndex: 1 }), // Downgrade entity 2
			s.advanceToNextInvoice(),
		],
	});

	// After cycle: both entities on free
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	await expectCustomerProducts({
		customer: entity1,
		active: [free.id],
		notPresent: [pro.id],
	});
	await expectCustomerProducts({
		customer: entity2,
		active: [free.id],
		notPresent: [pro.id],
	});

	// Features at free tier
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: 50,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		balance: 50,
		usage: 0,
	});

	// After both downgraded to free, there should be no Stripe subscriptions
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Entity 1 & 2 premium, downgrade both to free, entity 2 changes to pro
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both entities on Premium
 * - Downgrade both to Free (scheduled)
 * - Entity 2 changes scheduled product to Pro (replaces Free)
 *
 * Expected Result:
 * - Entity 1: Premium canceling, Free scheduled
 * - Entity 2: Premium canceling, Pro scheduled
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-entities-basic 3: entity 1 & 2 premium, downgrade both to free, entity 2 changes to pro")}`, async () => {
	const customerId = "sched-switch-ent-replace";

	const freeMessages = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({
		id: "free",
		items: [freeMessages],
	});

	const proMessages = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});

	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessages],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, entityIndex: 0 }),
			s.billing.attach({ productId: premium.id, entityIndex: 1 }),
			s.billing.attach({ productId: free.id, entityIndex: 0 }), // Downgrade entity 1
			s.billing.attach({ productId: free.id, entityIndex: 1 }), // Downgrade entity 2
		],
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Entity 2: Change scheduled product to pro (replaces free)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
		redirect_mode: "if_required",
	});

	// Verify entity 1: premium canceling, free scheduled
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entity1,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entity1,
		productId: free.id,
	});

	// Verify entity 2: premium canceling, pro scheduled (free was replaced)
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductCanceling({
		customer: entity2,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entity2,
		productId: pro.id,
	});
	await expectProductNotPresent({
		customer: entity2,
		productId: free.id,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Entity 1 premium, entity 2 premium, downgrade both to pro, then downgrade entity 1 to free
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both entities on Premium
 * - Downgrade both to Pro (scheduled)
 * - Downgrade entity 1 to Free (replaces scheduled Pro)
 *
 * Expected Result:
 * - Entity 1: Premium canceling, Free scheduled
 * - Entity 2: Premium canceling, Pro scheduled
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-entities-basic 4: entity 1 premium, entity 2 premium, downgrade both to pro, then downgrade entity 1 to free")}`, async () => {
	const customerId = "sched-switch-ent-chained";

	const freeMessages = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({
		id: "free",
		items: [freeMessages],
	});

	const proMessages = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [proMessages],
	});

	const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessages],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, entityIndex: 0 }),
			s.billing.attach({ productId: premium.id, entityIndex: 1 }),
			s.billing.attach({ productId: pro.id, entityIndex: 0 }), // Downgrade entity 1 to pro
			s.billing.attach({ productId: pro.id, entityIndex: 1 }), // Downgrade entity 2 to pro
		],
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Downgrade entity 1 to free (replaces scheduled pro)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		entity_id: entities[0].id,
		redirect_mode: "if_required",
	});

	// Verify entity 1: premium canceling, free scheduled (pro was replaced)
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entity1,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entity1,
		productId: free.id,
	});
	await expectProductNotPresent({
		customer: entity1,
		productId: pro.id,
	});

	// Verify entity 2: premium canceling, pro still scheduled
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductCanceling({
		customer: entity2,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entity2,
		productId: pro.id,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
