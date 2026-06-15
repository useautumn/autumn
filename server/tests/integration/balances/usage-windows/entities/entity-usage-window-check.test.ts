import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { setCustomerUsageLimit } from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";
import {
	expectEntityUsageLimit,
	setEntityUsageLimit,
} from "../../utils/usage-limit-utils/entityUsageLimitUtils.js";

/**
 * TDD tests for CHECK against entity-level usage limits.
 *
 * Contract under test:
 *  - an entity's own cap gates that entity's checks: required_balance within
 *    the entity window's headroom -> allowed true; beyond -> allowed false,
 *    even with ample balance; pure checks never consume window headroom
 *  - a sibling entity with no cap anywhere is unconstrained
 *  - carve-out checks: an entity with its own cap checks against IT, while a
 *    capless entity checks against the customer's aggregate window
 */

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("ent-uw-check1: entity's own cap gates that entity's checks only")}`,
	async () => {
		const perEntityProduct = products.base({
			id: "ent-uw-check-own-cap",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});

		const customerId = "ent-uw-check-1";
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

		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		// ── Headroom is 2: within allowed, beyond rejected despite 97 balance ──
		const within = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			required_balance: 2,
		});
		expect(within.allowed).toBe(true);

		const beyond = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			required_balance: 3,
		});
		expect(beyond.allowed).toBe(false);

		// ── Pure checks never consume: window usage still 3 ──
		await expectEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
		});

		// ── The capless sibling entity is unconstrained (full balance) ──
		const sibling = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			required_balance: 50,
		});
		expect(sibling.allowed).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("ent-uw-check2: carved-out entity checks its own cap, capless entity checks the aggregate")}`,
	async () => {
		const perEntityProduct = products.base({
			id: "ent-uw-check-carveout",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});

		const customerId = "ent-uw-check-2";
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

		// ── e1 (own cap 2): check 3 rejected even though the aggregate has 5 ──
		const carvedBeyond = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			required_balance: 3,
		});
		expect(carvedBeyond.allowed).toBe(false);

		const carvedWithin = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			required_balance: 2,
		});
		expect(carvedWithin.allowed).toBe(true);

		// ── e0 (capless) checks the aggregate: 5 fits, 6 does not ──
		const aggregateWithin = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			required_balance: 5,
		});
		expect(aggregateWithin.allowed).toBe(true);

		const aggregateBeyond = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			required_balance: 6,
		});
		expect(aggregateBeyond.allowed).toBe(false);

		// ── e0's tracks fill the aggregate; e1's own cap is untouched by them ──
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 5,
		});

		const aggregateFull = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			required_balance: 1,
		});
		expect(aggregateFull.allowed).toBe(false);

		const carvedStillOpen = await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			required_balance: 2,
		});
		expect(carvedStillOpen.allowed).toBe(true);
	},
);
