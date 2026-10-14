import { test } from "bun:test";
import {
	ApiVersion,
	type CustomerBillingControlsParams,
	ErrCode,
	ResetInterval,
} from "@autumn/shared";
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

const perEntityProduct = (
	id: string,
	billingControls?: CustomerBillingControlsParams,
) =>
	products.base({
		id,
		items: [
			items.monthlyMessages({
				includedUsage: 100,
				entityFeatureId: TestFeature.Users,
			}),
		],
		billingControls,
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

		await trackOnEntity(customerId, entities[0].id, 5);
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
		const prod = perEntityProduct("cus-limit-shared-plan", {
			usage_limits: [
				{
					feature_id: TestFeature.Messages,
					enabled: true,
					limit: 5,
					interval: ResetInterval.Month,
				},
			],
		});
		const customerId = "cus-limit-shared-plan-1";
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
