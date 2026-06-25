/**
 * Confirms that a usage_limit set at the CUSTOMER tier — and at the PLAN tier
 * (plan-default snapshot) — is ONE SHARED aggregate cap across the customer and
 * every entity beneath it, NOT a per-entity cap.
 *
 * Verified by enforcement: with a cap of 5 and three entities, usage tracked
 * across DIFFERENT entities sums into one pool. After 5 total is consumed, ANY
 * entity is rejected — including an entity that only spent 2 (which, under a
 * per-entity cap, would still have 3 of its own headroom).
 *
 * Mechanism: for a customer/plan-tier limit (the entity has no own usage_limits
 * entry), fullSubjectToUsageWindowLimits passes entityScope = null → the window
 * key is customer-scoped (entity segment "_") → every entity increments the same
 * counter. A limit set ON an entity is carved out into its own per-entity
 * counter instead (see entity-usage-window-inheritance.test.ts).
 *
 * We assert via the deterministic reject contract rather than the Postgres
 * usage_windows rows, which sync asynchronously after the Redis enforcement.
 */

import { test } from "bun:test";
import { ApiVersion, ErrCode, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { setCustomerUsageLimit } from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";
import { setEntityUsageLimit } from "../../utils/usage-limit-utils/entityUsageLimitUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

const perEntityProduct = (id: string) =>
	products.base({
		id,
		items: [
			items.monthlyMessages({
				includedUsage: 100,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

const trackOnEntity = (customerId: string, entityId: string, value: number) =>
	autumnV2_3.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value,
	});

test.concurrent(
	`${chalk.yellowBright("cus-limit-shared: a CUSTOMER usage_limit is one shared cap across all entities (not per-entity)")}`,
	async () => {
		const prod = perEntityProduct("cus-limit-shared-customer");
		const customerId = "cus-limit-shared-customer-1";
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [prod] }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: prod.id })],
		});

		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_3.customers.get(customerId);
		for (const entity of entities) {
			await autumnV2_3.entities.get(customerId, entity.id);
		}

		// 2 + 2 + 1 = 5 across THREE different entities exhausts the shared cap.
		await trackOnEntity(customerId, entities[0].id, 2);
		await trackOnEntity(customerId, entities[1].id, 2);
		await trackOnEntity(customerId, entities[2].id, 1);

		// e0 only consumed 2; under a per-entity cap of 5 it would still have 3
		// headroom. Shared cap is exhausted -> it is rejected.
		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: () =>
				autumnV2_3.track({
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
	`${chalk.yellowBright("limit-not-balance: it is the cap that blocks — with NO cap the same volume across entities passes")}`,
	async () => {
		const prod = perEntityProduct("cus-limit-shared-nocap");
		const customerId = "cus-limit-shared-nocap-1";
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [prod] }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: prod.id })],
		});

		await autumnV2_3.customers.get(customerId);
		for (const entity of entities) {
			await autumnV2_3.entities.get(customerId, entity.id);
		}

		// No usage_limit at all. Each entity has 100 included, so well past the
		// "5" of the cap tests there is ample balance — every reject-mode track
		// succeeds. This isolates the cap (not balance) as the blocker above.
		for (const value of [2, 2, 1, 5, 5, 5]) {
			await autumnV2_3.track({
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				value,
				overage_behavior: "reject",
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("entity-cap-carveout: a limit set ON an entity is its own pool; a sibling without one shares the customer cap")}`,
	async () => {
		const prod = perEntityProduct("cus-limit-shared-carveout");
		const customerId = "cus-limit-shared-carveout-1";
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [prod] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: prod.id })],
		});

		// Customer cap 5 (shared); entity[0] also gets its OWN cap 5 (carved out).
		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: 5,
		});
		await setEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			limit: 5,
		});

		await autumnV2_3.customers.get(customerId);
		for (const entity of entities) {
			await autumnV2_3.entities.get(customerId, entity.id);
		}

		// entity[0] spends its OWN 5 — into its carved-out window, NOT the
		// customer aggregate.
		await trackOnEntity(customerId, entities[0].id, 5);
		// entity[0] is now at its own cap -> rejects.
		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: () =>
				autumnV2_3.track({
					customer_id: customerId,
					entity_id: entities[0].id,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});

		// entity[1] (no own cap) still has the FULL shared customer cap of 5 —
		// proving entity[0]'s 5 never touched the customer aggregate window.
		await trackOnEntity(customerId, entities[1].id, 5);
		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: () =>
				autumnV2_3.track({
					customer_id: customerId,
					entity_id: entities[1].id,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("plan-limit-shared: a PLAN-DEFAULT usage_limit is one shared cap across all entities (not per-entity)")}`,
	async () => {
		const prod = perEntityProduct("cus-limit-shared-plan");
		const customerId = "cus-limit-shared-plan-1";
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [prod] }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: prod.id,
					billingControls: {
						usage_limits: [
							{
								feature_id: TestFeature.Messages,
								enabled: true,
								limit: 5,
								interval: ResetInterval.Month,
							},
						],
					},
				}),
			],
		});

		await autumnV2_3.customers.get(customerId);
		for (const entity of entities) {
			await autumnV2_3.entities.get(customerId, entity.id);
		}

		// Same shape: plan-default cap of 5 pooled across all three entities.
		await trackOnEntity(customerId, entities[0].id, 2);
		await trackOnEntity(customerId, entities[1].id, 2);
		await trackOnEntity(customerId, entities[2].id, 1);

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: () =>
				autumnV2_3.track({
					customer_id: customerId,
					entity_id: entities[0].id,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});
	},
);
