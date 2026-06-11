import { expect, test } from "bun:test";
import { ApiVersion, ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectCustomerFeatureBalance,
	expectEntityFeatureBalance,
} from "../../utils/spend-limit-utils/entitySpendLimitUtils.js";
import {
	expectEntityUsageLimit,
	setEntityUsageLimit,
} from "../../utils/usage-limit-utils/entityUsageLimitUtils.js";
import { fetchUsageWindowRows } from "../../utils/usage-limit-utils/usageWindowDbTestUtils.js";

/**
 * TDD tests for ENTITY-LEVEL usage windows (spend-limit mirror semantics:
 * exactly ONE cap per feature per subject — the entity's own usage_limits
 * entry wins; without one the customer's entry applies at customer scope).
 *
 * Contract under test (enforcement half):
 *  - entities.update(..., { billing_controls: { usage_limits } }) arms a cap
 *  - entity tracks against an ENTITY-SCOPED window: counts only that entity's
 *    usage, clamps over-cap tracks to what fits ("apply what fits")
 *  - overage_behavior "reject" over the cap -> InsufficientBalance
 *  - windows are isolated between entities; customer balance still aggregates
 *  - entity cap works on customer-scoped features too (no entity_feature_id):
 *    only that entity's tracks count; customer-level tracks are uncapped
 *  - side effect: usage_windows PG row per entity with internal_entity_id set
 *
 * Pre-impl red: EntityBillingControls has no usage_limits, so the update is
 * rejected/dropped and no cap is ever enforced.
 */

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("ent-uw-enforce1: entity's own cap clamps that entity's tracks")}`,
	async () => {
		const perEntityProduct = products.base({
			id: "ent-uw-enforce-own-cap",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});

		const customerId = "ent-uw-enforce-1";
		const { entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [perEntityProduct] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: perEntityProduct.id })],
		});

		await setEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		// ── Cap reached exactly: 3 then 4 applies only the remaining 2 ──
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 3,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 4,
		});

		await expectEntityFeatureBalance({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 95,
			usage: 5,
		});
		await expectEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			usage: 5,
			limit: 5,
		});

		// ── Over the cap: a further track applies nothing ──
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 1,
		});
		await expectEntityFeatureBalance({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 95,
			usage: 5,
		});

		// ── Side effect: ONE window row, entity-scoped (no customer row) ──
		const rows = await fetchUsageWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(rows).toHaveLength(1);
		expect(rows[0].internal_entity_id).not.toBeNull();
		expect(Number(rows[0].usage)).toBe(5);
	},
);

test.concurrent(
	`${chalk.yellowBright("ent-uw-enforce2: two entities with different caps stay isolated while customer balance aggregates")}`,
	async () => {
		const perEntityProduct = products.base({
			id: "ent-uw-enforce-isolated",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});

		const customerId = "ent-uw-enforce-2";
		const { entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [perEntityProduct] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: perEntityProduct.id })],
		});

		await setEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			limit: 5,
		});
		await setEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[1].id,
			featureId: TestFeature.Messages,
			limit: 10,
		});

		// e0: 7 -> clamps to 5. e1: 7 then 5 -> clamps to 10 total.
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 7,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 7,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[1].id,
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
		await expectEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[1].id,
			featureId: TestFeature.Messages,
			usage: 10,
			limit: 10,
		});

		// Balances aggregate at the customer even though windows are isolated.
		await expectCustomerFeatureBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: 200,
			remaining: 185,
			usage: 15,
		});

		// ── Side effect: one row per entity, distinct scopes ──
		const rows = await fetchUsageWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(rows).toHaveLength(2);
		const entityIds = rows.map(
			(row: { internal_entity_id: string | null }) => row.internal_entity_id,
		);
		expect(entityIds[0]).not.toBeNull();
		expect(entityIds[1]).not.toBeNull();
		expect(entityIds[0]).not.toBe(entityIds[1]);
		expect(
			rows
				.map((row: { usage: string | number }) => Number(row.usage))
				.sort((a: number, b: number) => a - b),
		).toEqual([5, 10]);
	},
);

test.concurrent(
	`${chalk.yellowBright("ent-uw-enforce3: over-cap entity track with reject returns InsufficientBalance")}`,
	async () => {
		const perEntityProduct = products.base({
			id: "ent-uw-enforce-reject",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});

		const customerId = "ent-uw-enforce-3";
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [perEntityProduct] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: perEntityProduct.id })],
		});

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
	},
);

test.concurrent(
	`${chalk.yellowBright("ent-uw-enforce4: entity cap on a customer-scoped feature counts only that entity's tracks")}`,
	async () => {
		const customerProduct = products.base({
			id: "ent-uw-enforce-cus-feature",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const customerId = "ent-uw-enforce-4";
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerProduct] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		await autumnV2_3.customers.get(customerId); // initialize cache.

		await setEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			limit: 3,
		});

		// Entity track over its cap: applies 3 of 5.
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
			usage: 3,
			limit: 3,
		});

		// Customer-level track is NOT bound by the entity's cap.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		await expectCustomerFeatureBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			granted: 100,
			remaining: 87,
			usage: 13,
		});
	},
);
