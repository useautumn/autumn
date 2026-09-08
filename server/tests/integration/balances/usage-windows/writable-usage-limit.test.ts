import { expect, test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumn = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("usage-limit-write: customer usage can be set without changing the cap")}`,
	async () => {
		const product = products.base({
			id: "writable-usage-customer",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			billingControls: {
				usage_limits: [
					{
						feature_id: TestFeature.Messages,
						limit: 5,
						interval: ResetInterval.Day,
					},
				],
			},
		});
		const { customerId } = await initScenario({
			customerId: "writable-usage-customer-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.billing.attach({ productId: product.id })],
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});
		await autumn.customers.updateRpc(customerId, {
			billing_controls: {
				usage_limits: [{ feature_id: TestFeature.Messages, usage: 0 }],
			} as never,
		});
		await autumn.customers.updateRpc(customerId, {
			billing_controls: {
				usage_limits: [{ feature_id: TestFeature.Messages, usage: 9 }],
			} as never,
		});
		const customer = (await autumn.customers.get(customerId, {
			skip_cache: "true",
		})) as {
			billing_controls: {
				usage_limits: Array<{
					feature_id: string;
					limit: number;
					usage?: number;
				}>;
			};
		};
		const limit = customer.billing_controls.usage_limits.find(
			(entry: { feature_id: string }) =>
				entry.feature_id === TestFeature.Messages,
		);
		expect(limit?.limit).toBe(5);
		expect(limit?.usage).toBe(9);
		await autumn.customers.updateRpc(customerId, {
			billing_controls: {
				usage_limits: [{ feature_id: TestFeature.Messages, usage: 0 }],
			} as never,
		});
		const resetCustomer = (await autumn.customers.get(customerId, {
			skip_cache: "true",
		})) as {
			billing_controls: { usage_limits: Array<{ usage?: number }> };
		};
		expect(resetCustomer.billing_controls.usage_limits[0].usage).toBe(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("usage-limit-write: entity usage can be reset")}`,
	async () => {
		const product = products.base({
			id: "writable-usage-entity",
			items: [
				items.monthlyMessages({
					includedUsage: 100,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});
		const { customerId, entities } = await initScenario({
			customerId: "writable-usage-entity-1",
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
						limit: 5,
						interval: ResetInterval.Day,
					},
				],
			} as never,
		});
		await autumn.track({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			value: 3,
		});
		const trackedEntity = (await autumn.entities.get(customerId, entityId, {
			skip_cache: "true",
		})) as {
			billing_controls?: { usage_limits?: Array<{ usage?: number }> };
		};
		expect(trackedEntity.billing_controls?.usage_limits?.[0]?.usage).toBe(3);
		await autumn.entities.update(customerId, entityId, {
			billing_controls: {
				usage_limits: [{ feature_id: TestFeature.Messages, usage: 0 }],
			} as never,
		});
		const entity = (await autumn.entities.get(customerId, entityId, {
			skip_cache: "true",
		})) as {
			billing_controls?: { usage_limits?: Array<{ usage?: number }> };
		};
		expect(entity.billing_controls?.usage_limits?.[0]?.usage).toBe(0);
	},
);
