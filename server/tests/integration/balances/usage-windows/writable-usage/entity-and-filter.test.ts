/**
 * Writable usage-limit counters — entity scope and filtered windows.
 *
 * Contract:
 *   An entity counter write touches only that entity's window.
 *   A counter write with `filter` targets the filtered window; without it, the
 *   unfiltered window. Neither touches the other.
 *   { feature_id, limit, interval, usage } on an entity sets config and counter
 *   together, and check enforces the written counter.
 */

import { expect, test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { expectCustomerUsageLimit } from "../../utils/usage-limit-utils/customerUsageLimitUtils.js";
import {
	expectEntityUsageLimit,
	setEntityUsageLimit,
} from "../../utils/usage-limit-utils/entityUsageLimitUtils.js";

const autumn = new AutumnInt({ version: ApiVersion.V2_3 });
const KEY_A_FILTER = { properties: { apiKeyId: "key-a" } };

test.concurrent(
	`${chalk.yellowBright("writable-usage-entity1: resetting one entity leaves its sibling's counter alone")}`,
	async () => {
		const product = products.base({
			id: "wu-ent-isolation",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});
		const { customerId, entities } = await initScenario({
			customerId: "wu-ent-isolation-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: product.id })],
		});
		const [first, second] = entities;

		for (const entity of [first, second]) {
			await setEntityUsageLimit({
				autumn,
				customerId,
				entityId: entity.id,
				featureId: TestFeature.Messages,
				limit: 5,
				interval: ResetInterval.Day,
			});
			await autumn.track({
				customer_id: customerId,
				entity_id: entity.id,
				feature_id: TestFeature.Messages,
				value: 3,
			});
		}

		await autumn.entities.update(customerId, first.id, {
			billing_controls: {
				usage_limits: [{ feature_id: TestFeature.Messages, usage: 0 }],
			},
		});

		await expectEntityUsageLimit({
			autumn,
			customerId,
			entityId: first.id,
			featureId: TestFeature.Messages,
			usage: 0,
			limit: 5,
			skipCache: true,
		});
		await expectEntityUsageLimit({
			autumn,
			customerId,
			entityId: second.id,
			featureId: TestFeature.Messages,
			usage: 3,
			limit: 5,
			skipCache: true,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("writable-usage-filter1: filtered and unfiltered counters are written independently")}`,
	async () => {
		const product = products.base({
			id: "wu-filter",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const { customerId } = await initScenario({
			customerId: "wu-filter-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.billing.attach({ productId: product.id })],
		});

		await timeout(2000);
		await autumn.customers.updateRpc(customerId, {
			billing_controls: {
				usage_limits: [
					{
						feature_id: TestFeature.Messages,
						limit: 5,
						interval: ResetInterval.Day,
						filter: KEY_A_FILTER,
					},
					{
						feature_id: TestFeature.Messages,
						limit: 50,
						interval: ResetInterval.Day,
					},
				],
			},
		});
		await timeout(3000);

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
			properties: KEY_A_FILTER.properties,
		});
		await expectCustomerUsageLimit({
			autumn,
			customerId,
			featureId: TestFeature.Messages,
			filterProperties: KEY_A_FILTER.properties,
			usage: 3,
			skipCache: true,
		});
		await expectCustomerUsageLimit({
			autumn,
			customerId,
			featureId: TestFeature.Messages,
			filterProperties: null,
			usage: 3,
			skipCache: true,
		});

		await autumn.customers.updateRpc(customerId, {
			billing_controls: {
				usage_limits: [
					{ feature_id: TestFeature.Messages, filter: KEY_A_FILTER, usage: 0 },
				],
			},
		});
		await expectCustomerUsageLimit({
			autumn,
			customerId,
			featureId: TestFeature.Messages,
			filterProperties: KEY_A_FILTER.properties,
			usage: 0,
			limit: 5,
			skipCache: true,
		});
		await expectCustomerUsageLimit({
			autumn,
			customerId,
			featureId: TestFeature.Messages,
			filterProperties: null,
			usage: 3,
			limit: 50,
			skipCache: true,
		});

		await autumn.customers.updateRpc(customerId, {
			billing_controls: {
				usage_limits: [{ feature_id: TestFeature.Messages, usage: 7 }],
			},
		});
		await expectCustomerUsageLimit({
			autumn,
			customerId,
			featureId: TestFeature.Messages,
			filterProperties: null,
			usage: 7,
			limit: 50,
			skipCache: true,
		});
		await expectCustomerUsageLimit({
			autumn,
			customerId,
			featureId: TestFeature.Messages,
			filterProperties: KEY_A_FILTER.properties,
			usage: 0,
			limit: 5,
			skipCache: true,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("writable-usage-entity2: config+usage in one entity entry sets both and is enforced")}`,
	async () => {
		const product = products.base({
			id: "wu-ent-config",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});
		const { customerId, entities } = await initScenario({
			customerId: "wu-ent-config-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: product.id })],
		});
		const entityId = entities[0].id;

		await autumn.entities.update(customerId, entityId, {
			billing_controls: {
				usage_limits: [
					{
						feature_id: TestFeature.Messages,
						limit: 50,
						interval: ResetInterval.Day,
						usage: 11,
					},
				],
			},
		});

		await expectEntityUsageLimit({
			autumn,
			customerId,
			entityId,
			featureId: TestFeature.Messages,
			usage: 11,
			limit: 50,
			skipCache: true,
		});
		const withinHeadroom = await autumn.check({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			required_balance: 39,
		});
		expect(withinHeadroom.allowed).toBe(true);
		const beyondHeadroom = await autumn.check({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			required_balance: 40,
		});
		expect(beyondHeadroom.allowed).toBe(false);
	},
);
