import { expect, test } from "bun:test";
import { ApiVersion, ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";
import {
	expectEntityUsageLimit,
	setEntityUsageLimit,
} from "../../utils/usage-limit-utils/entityUsageLimitUtils.js";
import { fetchUsageWindowRows } from "../../utils/usage-limit-utils/usageWindowDbTestUtils.js";

/**
 * TDD tests for usage-limit INHERITANCE (spend-limit mirror: per feature the
 * entity's own usage_limits entry wins; without one the customer's entry
 * "fills the gap" and applies at CUSTOMER scope — one shared aggregate window
 * across the customer and every entity without its own cap).
 *
 * Contract under test (inheritance half):
 *  - no entity entry -> entity tracks count into the shared customer window
 *    (inherit1 pins this aggregate behavior)
 *  - entity with its own entry is CARVED OUT: its tracks consume only its
 *    entity window, never the customer's aggregate window (inherit2)
 *  - arming an entity cap mid-window moves that entity to a fresh entity
 *    window; the customer window keeps its count (inherit3)
 *
 * Pre-impl red: inherit2/inherit3 fail because entity usage_limits don't
 * exist, so every entity track still lands in the customer window.
 */

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("ent-uw-inherit1: entities without their own cap share the customer's aggregate window")}`,
	async () => {
		const perEntityProduct = products.base({
			id: "ent-uw-inherit-aggregate",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});

		const customerId = "ent-uw-inherit-1";
		const { entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [perEntityProduct] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: perEntityProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_3.customers.get(customerId); // initialize cache.
		for (const entity of entities) {
			await autumnV2_3.entities.get(customerId, entity.id); // initialize cache.
		}

		// e0: 3, e1: 1 -> aggregate 4. e1's next 3 applies only the remaining 1.
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 3,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 1,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () =>
				await autumnV2_3.track({
					customer_id: customerId,
					entity_id: entities[0].id,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});

		// ── Side effect: ONE shared customer-scope row, no entity rows ──
		await timeout(4000);
		const rows = await fetchUsageWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(rows).toHaveLength(1);
		expect(rows[0].internal_entity_id).toBeNull();
		expect(Number(rows[0].usage)).toBe(5);
	},
);

test.concurrent(
	`${chalk.yellowBright("ent-uw-inherit2: an entity with its own cap is carved out of the customer's aggregate window")}`,
	async () => {
		const perEntityProduct = products.base({
			id: "ent-uw-inherit-carveout",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});

		const customerId = "ent-uw-inherit-2";
		const { entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [perEntityProduct] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: perEntityProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});
		await setEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[1].id,
			featureId: TestFeature.Messages,
			limit: 2,
		});

		await autumnV2_3.customers.get(customerId); // initialize cache.
		for (const entity of entities) {
			await autumnV2_3.entities.get(customerId, entity.id); // initialize cache.
		}

		// e1 (own cap 2) tracks 3 -> applies 2, into its OWN window.
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 3,
		});
		await expectEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[1].id,
			featureId: TestFeature.Messages,
			usage: 2,
			limit: 2,
		});

		// e0 (no own cap) tracks 5 -> the FULL 5 fits in the customer window,
		// proving e1's tracks never touched it (else only 3 would fit).
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});

		// Both windows now full: e0 rejects on the customer window, e1 on its own.
		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () =>
				await autumnV2_3.track({
					customer_id: customerId,
					entity_id: entities[0].id,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});
		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: async () =>
				await autumnV2_3.track({
					customer_id: customerId,
					entity_id: entities[1].id,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});

		// ── Side effect: one customer-scope row (5) + one entity row (2) ──
		await timeout(4000);
		const rows = await fetchUsageWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(rows).toHaveLength(2);
		const customerRow = rows.find(
			(row: { internal_entity_id: string | null }) =>
				row.internal_entity_id === null,
		);
		const entityRow = rows.find(
			(row: { internal_entity_id: string | null }) =>
				row.internal_entity_id !== null,
		);
		expect(customerRow).toBeDefined();
		expect(entityRow).toBeDefined();
		expect(Number(customerRow.usage)).toBe(5);
		expect(Number(entityRow.usage)).toBe(2);
	},
);

test.concurrent(
	`${chalk.yellowBright("ent-uw-inherit3: arming an entity cap mid-window moves the entity to a fresh window")}`,
	async () => {
		const perEntityProduct = products.base({
			id: "ent-uw-inherit-midwindow",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});

		const customerId = "ent-uw-inherit-3";
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [perEntityProduct] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: perEntityProduct.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_3.customers.get(customerId); // initialize cache.
		for (const entity of entities) {
			await autumnV2_3.entities.get(customerId, entity.id); // initialize cache.
		}

		// e0 inherits: 4 land in the customer window.
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 4,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 4,
			limit: 5,
		});

		// Carve e0 out mid-window: its next 5 fit its FRESH entity window
		// (had it still tracked the customer window, only 1 would fit).
		await setEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			limit: 5,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 5,
		});
		await expectEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});

		// Customer window kept its 4: e1 (still inheriting) fits exactly 1 more.
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 3,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});
	},
);
