import { expect, test } from "bun:test";
import {
	type ApiEntityV1,
	ApiEntityV1Schema,
	type ApiEntityV2,
} from "@autumn/shared";
import { ApiEntityV2Schema } from "@shared/api/entities/apiEntityV2";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("get-entity: v2.1 returns boolean features in flags")}`, async () => {
	const dashboardItem = items.dashboard();
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "entity-flags-pro",
		items: [dashboardItem, messagesItem],
	});

	const customerId = "get-entity-flags-v2-1";

	const { autumnV2_1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entity = await autumnV2_1.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
		{
			keepInternalFields: true,
		},
	);

	ApiEntityV2Schema.parse(entity);
	expect(entity.flags[TestFeature.Dashboard]).toMatchObject({
		feature_id: TestFeature.Dashboard,
		plan_id: pro.id,
		expires_at: null,
	});
	expect(entity.balances[TestFeature.Messages]).toMatchObject({
		feature_id: TestFeature.Messages,
		granted: 100,
		remaining: 100,
		usage: 0,
	});
	expect(entity.balances[TestFeature.Dashboard]).toBeUndefined();
});

test.concurrent(`${chalk.yellowBright("get-entity: v2 returns boolean features in balances")}`, async () => {
	const dashboardItem = items.dashboard();
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "entity-flags-pro-v2",
		items: [dashboardItem, messagesItem],
	});

	const customerId = "get-entity-flags-v2";

	const { autumnV2, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entity = await autumnV2.entities.get<ApiEntityV1>(
		customerId,
		entities[0].id,
	);

	ApiEntityV1Schema.parse(entity);
	expect(entity.balances).toBeDefined();
	expect(entity.balances?.[TestFeature.Dashboard]).toMatchObject({
		feature_id: TestFeature.Dashboard,
		plan_id: pro.id,
		granted_balance: 0,
		purchased_balance: 0,
		current_balance: 0,
		usage: 0,
		overage_allowed: false,
		max_purchase: null,
		reset: null,
	});
	expect(entity.balances?.[TestFeature.Messages]).toMatchObject({
		feature_id: TestFeature.Messages,
		plan_id: pro.id,
		granted_balance: 100,
		purchased_balance: 0,
		current_balance: 100,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("get-entity: created boolean balance is returned as flag with expires_at")}`, async () => {
	const customerId = "get-entity-created-flag-v2-1";
	const expiresAt = Date.now() + 60_000;

	const { autumnV2, autumnV2_1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	await autumnV2.balances.create({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Dashboard,
		expires_at: expiresAt,
	});

	const entity = await autumnV2_1.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
		{
			keepInternalFields: true,
		},
	);

	ApiEntityV2Schema.parse(entity);
	expect(entity.flags[TestFeature.Dashboard]).toMatchObject({
		feature_id: TestFeature.Dashboard,
		plan_id: null,
		expires_at: expiresAt,
	});
	expect(entity.balances[TestFeature.Dashboard]).toBeUndefined();
});
