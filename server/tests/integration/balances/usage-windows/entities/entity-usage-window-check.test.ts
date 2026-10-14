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

		await expectEntityUsageLimit({
			autumn: autumnV2_3,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
		});

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

		await autumnV2_3.customers.get(customerId);
		for (const entity of entities) {
			await autumnV2_3.entities.get(customerId, entity.id);
		}

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
