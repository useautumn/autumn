/**
 * Migration Entity Tests (Downgrades & Cancellations)
 *
 * Tests for migrating products when entities have downgrade or cancellation states.
 * Each entity's subscription state should be preserved independently.
 *
 * Key behaviors:
 * - Downgrading entities preserve their scheduled product
 * - Cancelled entities preserve their cancellation state
 * - Mixed states (cancel + downgrade) are handled correctly
 */

import { test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
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

const waitForMigration = (ms = 40000) =>
	new Promise((resolve) => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Both Entities Downgrading - States Preserved
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has 2 entities, both on premium
 * - Entity 1: scheduled downgrade to pro
 * - Entity 2: scheduled downgrade to pro
 * - Premium product updated to v2
 * - Migrate premium
 *
 * Expected Result:
 * - Both entities: migrated to premium v2, still cancelling with pro scheduled
 */
test.concurrent(`${chalk.yellowBright("migrate-entities-4: both entities downgrading - states preserved")}`, async () => {
	const customerId = "migrate-entities-both-downgrade";

	const pro = products.pro({
		id: "pro",
		items: [
			items.monthlyMessages({
				includedUsage: 500,
			}),
		],
	});

	const premium = products.premium({
		id: "premium",
		items: [
			items.monthlyMessages({
				includedUsage: 1000,
			}),
		],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: "premium", entityIndex: 0 }),
			s.billing.attach({ productId: "premium", entityIndex: 1, timeout: 5000 }), // timeout before track

			// Both entities downgrade to pro (scheduled)
			s.billing.attach({ productId: "pro", entityIndex: 0 }),
			s.billing.attach({ productId: "pro", entityIndex: 1 }),
		],
	});

	// Both entities should have premium cancelling and pro scheduled
	for (let i = 0; i < entities.length; i++) {
		const entityBefore = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[i].id,
		);
		await expectProductCanceling({
			customer: entityBefore,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: entityBefore,
			productId: pro.id,
		});
	}

	// Update premium product to v2
	const v2Items = [
		items.monthlyPrice({ price: 50 }),
		items.monthlyMessages({
			includedUsage: 1500,
		}),
	];
	await autumnV1.products.update(premium.id, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: premium.id,
		to_product_id: premium.id,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify both entities have premium v2 cancelling, pro still scheduled
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// Entity 1
	await expectProductCanceling({
		customer: entity1After,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entity1After,
		productId: pro.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		includedUsage: 1500,
		balance: 1500,
		usage: 0,
	});

	// Entity 2
	await expectProductCanceling({
		customer: entity2After,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entity2After,
		productId: pro.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Messages,
		includedUsage: 1500,
		balance: 1500, // 1500 - 150
		usage: 0,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: One Cancelled, One Downgrading - States Preserved
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has 2 entities, both on premium
 * - Entity 1: cancelled at end of cycle
 * - Entity 2: scheduled downgrade to pro
 * - Premium product updated to v2
 * - Migrate premium
 *
 * Expected Result:
 * - Entity 1: migrated to premium v2, still cancelling (no replacement)
 * - Entity 2: migrated to premium v2, still cancelling with pro scheduled
 */
test.concurrent(`${chalk.yellowBright("migrate-entities-5: one cancelled, one downgrading - states preserved")}`, async () => {
	const customerId = "migrate-entities-cancel-downgrade";

	const pro = products.pro({
		id: "pro",
		items: [
			items.monthlyMessages({
				includedUsage: 500,
			}),
		],
	});

	const premium = products.premium({
		id: "premium",
		items: [
			items.monthlyMessages({
				includedUsage: 1000,
			}),
		],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: "premium", entityIndex: 0 }),
			s.billing.attach({ productId: "premium", entityIndex: 1 }),

			// Entity 1 cancels at end of cycle
			s.updateSubscription({
				productId: "premium",
				entityIndex: 0,
				cancelAction: "cancel_end_of_cycle",
			}),
			// Entity 2 downgrades to pro (scheduled)
			s.billing.attach({ productId: "pro", entityIndex: 1 }),
		],
	});

	// Entity 1 should have premium cancelling (no scheduled product)
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductCanceling({
		customer: entity1Before,
		productId: premium.id,
	});

	// Entity 2 should have premium cancelling and pro scheduled
	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	await expectProductCanceling({
		customer: entity2Before,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entity2Before,
		productId: pro.id,
	});

	// Update premium product to v2
	const v2Items = [
		items.monthlyPrice({ price: 50 }),
		items.monthlyMessages({
			includedUsage: 1200,
		}),
	];
	await autumnV1.products.update(premium.id, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: premium.id,
		to_product_id: premium.id,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify states preserved
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// Entity 1: premium v2 still cancelling (no scheduled replacement)
	await expectProductCanceling({
		customer: entity1After,
		productId: premium.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		includedUsage: 1200,
		balance: 1200,
		usage: 0,
	});

	// Entity 2: premium v2 still cancelling, pro still scheduled
	await expectProductCanceling({
		customer: entity2After,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: entity2After,
		productId: pro.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Messages,
		includedUsage: 1200,
		balance: 1200,
		usage: 0,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Both Entities Cancelled at End of Cycle - States Preserved
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has 2 entities, both on premium
 * - Entity 1: cancelled at end of cycle
 * - Entity 2: cancelled at end of cycle
 * - Premium product updated to v2
 * - Migrate premium
 *
 * Expected Result:
 * - Both entities: migrated to premium v2, still cancelling
 */
test.concurrent(`${chalk.yellowBright("migrate-entities-6: both entities cancelled - states preserved")}`, async () => {
	const customerId = "migrate-entities-both-cancelled";

	const premium = products.premium({
		id: "premium",
		items: [
			items.monthlyMessages({
				includedUsage: 1000,
			}),
		],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: "premium", entityIndex: 0 }),
			s.billing.attach({ productId: "premium", entityIndex: 1 }), // timeout before track

			// Both entities cancel at end of cycle
			s.updateSubscription({
				productId: "premium",
				entityIndex: 0,
				cancelAction: "cancel_end_of_cycle",
			}),
			s.updateSubscription({
				productId: "premium",
				entityIndex: 1,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	// Both entities should have premium cancelling
	for (let i = 0; i < entities.length; i++) {
		const entityBefore = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[i].id,
		);
		await expectProductCanceling({
			customer: entityBefore,
			productId: premium.id,
		});
	}

	// Update premium product to v2
	const v2Items = [
		items.monthlyPrice({ price: 50 }),
		items.monthlyMessages({
			includedUsage: 1500,
			entityFeatureId: TestFeature.Users,
		}),
	];
	await autumnV1.products.update(premium.id, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: premium.id,
		to_product_id: premium.id,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify both entities have premium v2 still cancelling
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// Entity 1
	await expectProductCanceling({
		customer: entity1After,
		productId: premium.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		includedUsage: 1500,
		balance: 1500,
		usage: 0,
	});

	// Entity 2
	await expectProductCanceling({
		customer: entity2After,
		productId: premium.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Messages,
		includedUsage: 1500,
		balance: 1500,
		usage: 0,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
