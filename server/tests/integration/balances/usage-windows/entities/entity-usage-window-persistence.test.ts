import { expect, test } from "bun:test";
import { type ApiEntityV2, ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectEntityUsageLimit,
	setEntityUsageLimit,
} from "../../utils/usage-limit-utils/entityUsageLimitUtils.js";
import { fetchUsageWindowRows } from "../../utils/usage-limit-utils/usageWindowDbTestUtils.js";

/**
 * TDD tests for entity usage-limit PERSISTENCE + API exposure.
 *
 * Contract under test:
 *  - the entity window counter syncs to Postgres (internal_entity_id set) and
 *    a skip_cache read serves the synced count (persist1)
 *  - entities.get exposes billing_controls.usage_limits: the entity's OWN
 *    entries, each decorated with the current window's `usage` (persist2)
 *  - entities.update rejects duplicate feature_id usage_limits entries
 *    (persist3)
 *
 * Pre-impl red: entity usage_limits don't exist on the schema, so the arm is
 * dropped, nothing syncs, nothing is exposed, and dupes aren't validated.
 */

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("ent-uw-persist1: entity window counter syncs to Postgres and survives skip_cache reads")}`,
	async () => {
		const perEntityProduct = products.base({
			id: "ent-uw-persist-sync",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});

		const customerId = "ent-uw-persist-1";
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

		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 3,
		});
		await timeout(4000);

		// ── PG row: entity-scoped, counted ──
		const rows = await fetchUsageWindowRows({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(rows).toHaveLength(1);
		expect(rows[0].internal_entity_id).not.toBeNull();
		expect(Number(rows[0].usage)).toBe(3);
		expect(Number(rows[0].window_end_at)).toBeGreaterThan(Date.now());

		// ── skip_cache read serves the synced counter ──
		await expectEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
			skipCache: true,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("ent-uw-persist2: entities.get exposes the entity's usage_limits with current window usage")}`,
	async () => {
		const perEntityProduct = products.base({
			id: "ent-uw-persist-expose",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});

		const customerId = "ent-uw-persist-2";
		const { entities } = await initScenario({
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

		// Before any usage: entry echoed with usage 0.
		await expectEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			usage: 0,
			limit: 5,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 2,
		});
		await timeout(3000);

		await expectEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			usage: 2,
			limit: 5,
		});

		// The OTHER entity has no entries: nothing echoed for it.
		const otherEntity = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[1].id,
		);
		expect(
			otherEntity.billing_controls?.usage_limits ?? undefined,
		).toBeUndefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("ent-uw-persist3: duplicate feature_id entries in entity usage_limits are rejected")}`,
	async () => {
		const perEntityProduct = products.base({
			id: "ent-uw-persist-dupe",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});

		const customerId = "ent-uw-persist-3";
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [perEntityProduct] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: perEntityProduct.id })],
		});

		await expectAutumnError({
			func: async () =>
				await autumnV2_3.entities.update(customerId, entities[0].id, {
					billing_controls: {
						usage_limits: [
							{
								feature_id: TestFeature.Messages,
								limit: 5,
								interval: ResetInterval.Month,
							},
							{
								feature_id: TestFeature.Messages,
								limit: 9,
								interval: ResetInterval.Month,
							},
						],
					},
				}),
		});
	},
);
