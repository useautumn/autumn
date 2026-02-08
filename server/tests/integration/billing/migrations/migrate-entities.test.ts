/**
 * Migration Entity Tests
 *
 * Tests for migrating products when customer has multiple entities.
 * Each entity should be migrated correctly with its own state preserved.
 *
 * Key behaviors:
 * - Both active entities are migrated
 * - Entity states (active/cancelled) are preserved independently
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
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

const waitForMigration = (ms = 40000) =>
	new Promise((resolve) => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Two Entities Both Active - Both Migrated
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has 2 entities, both on pro
 * - Product updated to v2
 * - Migrate
 *
 * Expected Result:
 * - Both entities migrated to v2
 * - Both entities have updated features
 */
test.concurrent(`${chalk.yellowBright("migrate-entities-1: two active entities, both migrated")}`, async () => {
	const customerId = "migrate-entities-both";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: "pro", entityIndex: 0 }),
			s.billing.attach({ productId: "pro", entityIndex: 1, timeout: 4000 }), // timeout before track
			s.track({
				featureId: TestFeature.Messages,
				value: 100,
				entityIndex: 0,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Messages,
				value: 50,
				entityIndex: 1,
				timeout: 2000,
			}),
		],
	});

	// Verify initial state
	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Both entities should have pro
	for (const entity of entities) {
		const entityData = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity.id,
		);
		const hasProduct = entityData.products?.some((p) => p.id === pro.id);
		expect(hasProduct).toBe(true);
	}

	// Update product to v2
	const newMonthlyPrice = items.monthlyPrice({ price: 100 });
	const v2Items = [
		newMonthlyPrice,
		items.monthlyMessages({
			includedUsage: 600,
			entityFeatureId: TestFeature.Users,
		}),
	];

	await autumnV1.products.update(pro.id, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: pro.id,
		to_product_id: pro.id,
		from_version: 1,
		to_version: 2,
	});

	await waitForMigration();

	// Verify both entities migrated
	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	for (const entity of entities) {
		const entityData = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity.id,
		);

		// Entity should have product (migrated)
		expect(entityData.products?.some((p) => p.id === pro.id)).toBe(true);

		// Features should be updated with v2 included usage
		expect(entityData.features?.[TestFeature.Messages]?.included_usage).toBe(
			600,
		);
	}

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: One Active, One Cancelled - States Preserved
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has 2 entities
 * - Entity 1: active on pro
 * - Entity 2: cancelled at end of cycle
 * - Product updated to v2
 * - Migrate
 *
 * Expected Result:
 * - Entity 1: migrated, still active
 * - Entity 2: migrated, still cancelling
 */
test.concurrent(`${chalk.yellowBright("migrate-entities-2: one active, one cancelled - states preserved")}`, async () => {
	const customerId = "migrate-entities-states";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: "pro", entityIndex: 0 }),
			s.billing.attach({ productId: "pro", entityIndex: 1, timeout: 4000 }), // timeout before track
			s.track({
				featureId: TestFeature.Messages,
				value: 100,
				entityIndex: 0,
				timeout: 2000,
			}),
			s.updateSubscription({
				productId: "pro",
				entityIndex: 1,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	// Entity 1 should be active, Entity 2 should be cancelling
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	await expectProductActive({
		customer: entity1Before,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: entity2Before,
		productId: pro.id,
	});

	// Update product to v2
	// Note: products.pro() has $20/mo base price, so we need to include monthlyPrice in v2Items
	const v2Items = [
		items.monthlyPrice({ price: 20 }),
		items.monthlyMessages({
			includedUsage: 600,
		}),
	];
	await autumnV1.products.update(pro.id, { items: v2Items });

	// Run migration
	await autumnV1.migrate({
		from_product_id: pro.id,
		to_product_id: pro.id,
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

	// Entity 1: still active, features updated
	await expectProductActive({
		customer: entity1After,
		productId: pro.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 500, // 600 - 100
		usage: 100,
	});

	// Entity 2: still cancelling, features updated
	await expectProductCanceling({
		customer: entity2After,
		productId: pro.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 600, // No usage tracked on entity 2
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
// TEST 3: One Active, One Downgrading - States Preserved
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has 2 entities, both on premium
 * - Entity 1: active on premium
 * - Entity 2: scheduled downgrade to pro
 * - Product updated to v2
 * - Migrate premium
 *
 * Expected Result:
 * - Entity 1: migrated to premium v2, still active
 * - Entity 2: migrated to premium v2, still cancelling with pro scheduled
 */
test.concurrent(`${chalk.yellowBright("migrate-entities-3: one active, one downgrading - states preserved")}`, async () => {
	const customerId = "migrate-entities-downgrade";

	const pro = products.pro({
		id: "pro",
		items: [
			items.monthlyMessages({
				includedUsage: 500,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

	const premium = products.premium({
		id: "premium",
		items: [
			items.monthlyMessages({
				includedUsage: 1000,
				entityFeatureId: TestFeature.Users,
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
			s.billing.attach({ productId: "premium", entityIndex: 1, timeout: 4000 }), // timeout before track
			s.track({
				featureId: TestFeature.Messages,
				value: 200,
				entityIndex: 0,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Messages,
				value: 100,
				entityIndex: 1,
				timeout: 2000,
			}),
			// Entity 2 downgrades to pro (scheduled)
			s.billing.attach({ productId: "pro", entityIndex: 1 }),
		],
	});

	// Entity 1 should be active on premium
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
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
	// Note: products.premium() has $50/mo base price, so we need to include monthlyPrice in v2Items
	const v2Items = [
		items.monthlyPrice({ price: 50 }),
		items.monthlyMessages({
			includedUsage: 1200,
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

	// Verify states preserved
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// Entity 1: still active on premium v2, features updated
	await expectProductActive({
		customer: entity1After,
		productId: premium.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		includedUsage: 1200, // v2 included usage
		balance: 1000, // 1200 - 200
		usage: 200,
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
		includedUsage: 1200, // v2 included usage
		balance: 1100, // 1200 - 100
		usage: 100,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
