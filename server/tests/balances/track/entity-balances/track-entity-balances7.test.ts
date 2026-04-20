import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerOverageAllowed } from "../../../integration/balances/utils/overage-allowed-utils/customerOverageAllowedUtils.js";

/**
 * track-entity-balances7: block_shared_pool
 *
 * When customer.config.block_shared_pool is true and a deduction is scoped
 * to an entity, the entity must NOT fall back into the shared customer pool.
 *
 * Three deterministic branches:
 *   1. reject          — entity overflow throws InsufficientBalance; nothing deducted
 *   2. cap (no overage) — entity balance caps at 0; customer pool untouched
 *   3. cap + overage   — entity balance goes to -100; customer pool untouched
 *
 * Shared product: customer pool = 5000, per-entity pool = 500.
 */

/**
 * Fresh product fixture per test. `initProductsV0` mutates the product's `id`
 * in-place to add a prefix (see tests/utils/testProductUtils/testProductUtils.ts:21),
 * so sharing a module-level product across `test.concurrent` branches produces
 * a race where each test over-prefixes the others and attach lookups miss.
 */
const makeFreeProd = () =>
	products.base({
		id: "block-shared-pool",
		items: [
			items.monthlyMessages({ includedUsage: 5000 }),
			items.monthlyMessages({
				includedUsage: 500,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

// ──────────────────────────────────────────────────────────────────────
// Branch 1: reject
// ──────────────────────────────────────────────────────────────────────
test.concurrent(`${chalk.yellowBright("track-entity-balances7-reject: entity overflow throws InsufficientBalance; nothing deducted")}`, async () => {
	const customerId = "track-entity-balances7-reject";
	const entityId = "ent-1";
	const freeProd = makeFreeProd();

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.deleteCustomer({ customerId }),
			s.customer({
				testClock: false,
				data: { config: { block_shared_pool: true } },
			}),
			s.products({ list: [freeProd] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Pre-track: check() and entities.get() both report entity-only balance
	const preCheck = await autumnV1.check({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
	});
	expect(preCheck.balance).toBe(500);

	const preEntity = await autumnV1.entities.get(customerId, entityId);
	expect(preEntity.features[TestFeature.Messages].balance).toBe(500);

	// Track 600 with reject → must throw
	await expectAutumnError({
		errCode: ErrCode.InsufficientBalance,
		func: async () => {
			await autumnV1.track({
				customer_id: customerId,
				entity_id: entityId,
				feature_id: TestFeature.Messages,
				value: 600,
				overage_behavior: "reject",
				skip_event: true,
			});
		},
	});

	// Post-track: both pools unchanged
	const postEntity = await autumnV1.entities.get(customerId, entityId);
	expect(postEntity.features[TestFeature.Messages].balance).toBe(500);

	// Aggregated customer view unchanged: 5000 (customer) + 500 (entity) = 5500
	const postCustomer = await autumnV1.customers.get(customerId);
	expect(postCustomer.features[TestFeature.Messages].balance).toBe(5500);
});

// ──────────────────────────────────────────────────────────────────────
// Branch 2: cap (default, no overage_allowed)
// ──────────────────────────────────────────────────────────────────────
test.concurrent(`${chalk.yellowBright("track-entity-balances7-cap: entity caps at 0; customer pool untouched")}`, async () => {
	const customerId = "track-entity-balances7-cap";
	const entityId = "ent-1";
	const freeProd = makeFreeProd();

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.deleteCustomer({ customerId }),
			s.customer({
				testClock: false,
				data: { config: { block_shared_pool: true } },
			}),
			s.products({ list: [freeProd] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Pre-track sanity
	const preEntity = await autumnV1.entities.get(customerId, entityId);
	expect(preEntity.features[TestFeature.Messages].balance).toBe(500);

	const preCheck = await autumnV1.check({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
	});
	expect(preCheck.balance).toBe(500);

	// Track 600 under cap (default). Entity pool exhausted, overflow discarded.
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 600,
		skip_event: true,
	});

	// Entity caps at 0 (usage_allowed defaults to false for free products).
	const postEntity = await autumnV1.entities.get(customerId, entityId);
	expect(postEntity.features[TestFeature.Messages].balance).toBe(0);

	const postCheck = await autumnV1.check({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
	});
	expect(postCheck.balance).toBe(0);

	// Customer pool untouched. Aggregated view = 5000 + 0 = 5000.
	const postCustomer = await autumnV1.customers.get(customerId);
	expect(postCustomer.features[TestFeature.Messages].balance).toBe(5000);
});

// ──────────────────────────────────────────────────────────────────────
// Branch 3: cap + overage_allowed
// ──────────────────────────────────────────────────────────────────────
test.concurrent(`${chalk.yellowBright("track-entity-balances7-overage: entity goes to -100 under overage_allowed; customer pool untouched")}`, async () => {
	const customerId = "track-entity-balances7-overage";
	const entityId = "ent-1";
	const freeProd = makeFreeProd();

	const { autumnV1, autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.deleteCustomer({ customerId }),
			s.customer({
				testClock: false,
				data: { config: { block_shared_pool: true } },
			}),
			s.products({ list: [freeProd] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// Enable overage_allowed on the customer so the entity balance can
	// go negative under cap.
	await setCustomerOverageAllowed({
		autumn: autumnV2_1 as any,
		customerId,
		featureId: TestFeature.Messages,
		enabled: true,
	});

	// Pre-track sanity
	const preEntity = await autumnV1.entities.get(customerId, entityId);
	expect(preEntity.features[TestFeature.Messages].balance).toBe(500);

	// Track 600 under cap with overage_allowed enabled.
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 600,
		skip_event: true,
	});

	// Entity can go negative because overage_allowed forces usage_allowed=true.
	// Customer pool is blocked by the flag, so overflow lands on entity only.
	const postEntity = await autumnV1.entities.get(customerId, entityId);
	expect(postEntity.features[TestFeature.Messages].balance).toBe(-100);

	const postCheck = await autumnV1.check({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
	});
	expect(postCheck.balance).toBe(-100);

	// Customer pool untouched. Aggregated view = 5000 + (-100) = 4900.
	const postCustomer = await autumnV1.customers.get(customerId);
	expect(postCustomer.features[TestFeature.Messages].balance).toBe(4900);
});
