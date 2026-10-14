import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { warmEntityCaches } from "@tests/integration/balances/utils/warmEntityCaches.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerOverageAllowed } from "../../../integration/balances/utils/overage-allowed-utils/customerOverageAllowedUtils.js";

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

const makeEntityLevelProd = () =>
	products.base({
		id: "entity-level",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

const makeCustomerPooledProd = () =>
	products.base({
		id: "customer-pooled",
		items: [items.monthlyMessages({ includedUsage: 5000 })],
	});

test.concurrent(
	`${chalk.yellowBright("track-entity-balances7-reject: entity overflow throws InsufficientBalance; nothing deducted")}`,
	async () => {
		const customerId = "track-entity-balances7-reject";
		const entityId = "ent-1";
		const freeProd = makeFreeProd();

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({
					testClock: false,
					data: { config: { disable_pooled_balance: true } },
				}),
				s.products({ list: [freeProd] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const preCheck = await autumnV1.check({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
		});
		expect(preCheck.balance).toBe(500);

		const preEntity = await autumnV1.entities.get(customerId, entityId);
		expect(preEntity.features[TestFeature.Messages].balance).toBe(500);

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

		const postEntity = await autumnV1.entities.get(customerId, entityId);
		expect(postEntity.features[TestFeature.Messages].balance).toBe(500);

		const postCustomer = await autumnV1.customers.get(customerId);
		expect(postCustomer.features[TestFeature.Messages].balance).toBe(5500);
	},
);

test.concurrent(
	`${chalk.yellowBright("track-entity-balances7-cap: entity caps at 0; customer pool untouched")}`,
	async () => {
		const customerId = "track-entity-balances7-cap";
		const entityId = "ent-1";
		const freeProd = makeFreeProd();

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({
					testClock: false,
					data: { config: { disable_pooled_balance: true } },
				}),
				s.products({ list: [freeProd] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await warmEntityCaches({ autumn: autumnV1, customerId, entities });

		const preEntity = await autumnV1.entities.get(customerId, entityId);
		expect(preEntity.features[TestFeature.Messages].balance).toBe(500);

		const preCheck = await autumnV1.check({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
		});
		expect(preCheck.balance).toBe(500);

		await autumnV1.track({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			value: 600,
			skip_event: true,
		});

		const postEntity = await autumnV1.entities.get(customerId, entityId);
		expect(postEntity.features[TestFeature.Messages].balance).toBe(0);

		const postCheck = await autumnV1.check({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
		});
		expect(postCheck.balance).toBe(0);

		const postCustomer = await autumnV1.customers.get(customerId);
		expect(postCustomer.features[TestFeature.Messages].balance).toBe(5000);
	},
);

test.concurrent(
	`${chalk.yellowBright("track-entity-balances7-overage: entity goes to -100 under overage_allowed; customer pool untouched")}`,
	async () => {
		const customerId = "track-entity-balances7-overage";
		const entityId = "ent-1";
		const freeProd = makeFreeProd();

		const { autumnV1, autumnV2_1, entities } = await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({
					testClock: false,
					data: { config: { disable_pooled_balance: true } },
				}),
				s.products({ list: [freeProd] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		await setCustomerOverageAllowed({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			enabled: true,
		});

		await warmEntityCaches({ autumn: autumnV1, customerId, entities });

		const preEntity = await autumnV1.entities.get(customerId, entityId);
		expect(preEntity.features[TestFeature.Messages].balance).toBe(500);

		await autumnV1.track({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			value: 600,
			skip_event: true,
		});

		const postEntity = await autumnV1.entities.get(customerId, entityId);
		expect(postEntity.features[TestFeature.Messages].balance).toBe(-100);

		const postCheck = await autumnV1.check({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
		});
		expect(postCheck.balance).toBe(-100);

		const postCustomer = await autumnV1.customers.get(customerId);
		expect(postCustomer.features[TestFeature.Messages].balance).toBe(4900);
	},
);

test.concurrent(
	`${chalk.yellowBright("track-entity-balances7-entity-attached: entity-attached plan works with disable_pooled_balance")}`,
	async () => {
		const customerId = "track-entity-balances7-entity-attached";
		const entityId = "ent-1";
		const pooledProd = makeCustomerPooledProd();
		const entityProd = makeEntityLevelProd();

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({
					testClock: false,
					data: { config: { disable_pooled_balance: true } },
				}),
				s.products({ list: [pooledProd, entityProd] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pooledProd.id,
		});

		await autumnV1.attach({
			customer_id: customerId,
			entity_id: entityId,
			product_id: entityProd.id,
		});

		const customerAfterAttach = await autumnV1.customers.get(customerId);
		if (!isBalanceWorkerRoute()) {
			expect(customerAfterAttach.features[TestFeature.Messages].balance).toBe(
				5500,
			);
		}

		const preEntity = await autumnV1.entities.get(customerId, entityId);
		expect(preEntity.features[TestFeature.Messages].balance).toBe(500);

		const preCheck = await autumnV1.check({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
		});
		expect(preCheck.balance).toBe(500);

		await autumnV1.track({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			value: 300,
			skip_event: true,
		});

		const postEntity = await autumnV1.entities.get(customerId, entityId);
		expect(postEntity.features[TestFeature.Messages].balance).toBe(200);

		const postCheck = await autumnV1.check({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
		});
		expect(postCheck.balance).toBe(200);

		const postCustomer = await autumnV1.customers.get(customerId);
		if (!isBalanceWorkerRoute()) {
			expect(postCustomer.features[TestFeature.Messages].balance).toBe(5200);
		}
	},
);
