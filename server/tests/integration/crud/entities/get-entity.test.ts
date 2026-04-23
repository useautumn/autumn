import { expect, test } from "bun:test";
import {
	type ApiEntityV1,
	ApiEntityV1Schema,
	type ApiEntityV2,
	type AttachParamsV1Input,
} from "@autumn/shared";
import { ApiEntityV2Schema } from "@shared/api/entities/apiEntityV2";
import {
	type ApiEntityV0,
	ApiEntityV0Schema,
} from "@shared/api/entities/prevVersions/apiEntityV0";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// Multi-entity inheritance + deduction comparison tests (V2 cache baseline)
// ═══════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("get-entity: entity inheriting customer-level product returns correct balances across versions")}`, async () => {
	const dashboardItem = items.dashboard();
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const creditsItem = items.monthlyCredits({ includedUsage: 200 });

	const cusLevelProd = products.pro({
		id: "inherit-cus-lvl",
		items: [dashboardItem, messagesItem],
	});
	const entityProd = products.base({
		id: "inherit-ent-prod",
		items: [creditsItem],
	});

	const customerId = "get-ent-inherit-v2";

	const { autumnV1, autumnV2_1, autumnV2_2, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [cusLevelProd, entityProd] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: cusLevelProd.id }),
			s.attach({ productId: entityProd.id, entityIndex: 0 }),
			s.attach({ productId: entityProd.id, entityIndex: 1 }),
			s.track({ featureId: TestFeature.Credits, value: 25, entityIndex: 0 }),
			s.track({ featureId: TestFeature.Messages, value: 15, entityIndex: 1 }),
		],
	});

	const entityId0 = entities[0].id;
	const entityId1 = entities[1].id;

	// ── Entity 0: V1 (v1.2 / ApiEntityV0 -- products[] + features{}) ──
	const ent0V1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entityId0,
	);
	ApiEntityV0Schema.parse(ent0V1);
	expect(ent0V1.products).toBeDefined();
	expect(ent0V1.products!.length).toBeGreaterThan(0);
	const ent0V1Prod = ent0V1.products![0];
	expect(ent0V1Prod.current_period_start).toBeNumber();
	expect(ent0V1Prod.current_period_end).toBeNumber();
	expect(ent0V1.features).toBeDefined();
	expect(ent0V1.features?.[TestFeature.Credits]).toMatchObject({
		id: TestFeature.Credits,
		balance: 175,
		usage: 25,
		included_usage: 200,
	});
	expect(ent0V1.features?.[TestFeature.Dashboard]).toMatchObject({
		id: TestFeature.Dashboard,
	});

	// ── Entity 0: V2.1 (ApiEntityV2) ──
	const ent0V2_1 = await autumnV2_1.entities.get<ApiEntityV2>(
		customerId,
		entityId0,
		{ keepInternalFields: true },
	);
	ApiEntityV2Schema.parse(ent0V2_1);
	expect(ent0V2_1.subscriptions.length).toBeGreaterThan(0);
	const ent0V2_1Sub = ent0V2_1.subscriptions[0];
	expect(ent0V2_1Sub.current_period_start).toBeNumber();
	expect(ent0V2_1Sub.current_period_end).toBeNumber();
	expect(ent0V2_1.balances[TestFeature.Credits]).toMatchObject({
		remaining: 175,
		usage: 25,
	});
	expect(ent0V2_1.balances[TestFeature.Dashboard]).toBeUndefined();
	expect(ent0V2_1.flags[TestFeature.Dashboard]).toMatchObject({
		feature_id: TestFeature.Dashboard,
		plan_id: cusLevelProd.id,
		expires_at: null,
	});

	// ── Entity 0: V2.2 ──
	const ent0V2_2 = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entityId0,
		{ keepInternalFields: true },
	);
	ApiEntityV2Schema.parse(ent0V2_2);
	expect(ent0V2_2.subscriptions.length).toBeGreaterThan(0);
	const ent0V2_2Sub = ent0V2_2.subscriptions[0];
	expect(ent0V2_2Sub.current_period_start).toBeNumber();
	expect(ent0V2_2Sub.current_period_end).toBeNumber();
	expect(ent0V2_2.balances[TestFeature.Credits]).toMatchObject({
		remaining: 175,
		usage: 25,
	});
	expect(ent0V2_2.flags[TestFeature.Dashboard]).toMatchObject({
		feature_id: TestFeature.Dashboard,
	});

	// ── Entity 1: V2.1 -- verify cross-entity deduction ──
	const ent1V2_1 = await autumnV2_1.entities.get<ApiEntityV2>(
		customerId,
		entityId1,
		{ keepInternalFields: true },
	);
	ApiEntityV2Schema.parse(ent1V2_1);
	expect(ent1V2_1.balances[TestFeature.Credits]).toMatchObject({
		remaining: 200,
		usage: 0,
	});
	expect(ent1V2_1.balances[TestFeature.Messages]).toMatchObject({
		remaining: 85,
		usage: 15,
	});
	expect(ent1V2_1.flags[TestFeature.Dashboard]).toMatchObject({
		feature_id: TestFeature.Dashboard,
		expires_at: null,
	});

	const refDir = `${import.meta.dir}/../../../references`;
	await Bun.write(
		`${refDir}/getEntityV1Response.json`,
		JSON.stringify(ent0V1, null, 2),
	);
	await Bun.write(
		`${refDir}/getEntityV2_1Response.json`,
		JSON.stringify(ent0V2_1, null, 2),
	);
	await Bun.write(
		`${refDir}/getEntityV2_2Response.json`,
		JSON.stringify(ent0V2_2, null, 2),
	);
});

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

test.concurrent(`${chalk.yellowBright("get-entity: throws when entity does not exist on existing customer")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const baseProduct = products.base({
		id: "missing-entity-base",
		items: [messagesItem],
	});
	const customerId = "get-entity-missing-entity";

	const { autumnV1, autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [baseProduct] }),
		],
		actions: [s.billing.attach({ productId: baseProduct.id })],
	});

	const missingEntityId = "entity-that-does-not-exist";

	// get-entity: legacy (FullCustomer cache) + V2.1 (FullSubject cache) both throw
	await expect(
		autumnV1.entities.get<ApiEntityV0>(customerId, missingEntityId),
	).rejects.toThrow();

	await expect(
		autumnV2_1.entities.get<ApiEntityV2>(customerId, missingEntityId),
	).rejects.toThrow();

	// check: legacy path previously mis-routed to createWithDefaults on missing
	// entity; should now surface the entity-not-found error directly without
	// running CusService.getFull or logging "Customer already exists".
	await expect(
		autumnV1.check({
			customer_id: customerId,
			entity_id: missingEntityId,
			feature_id: TestFeature.Messages,
		}),
	).rejects.toThrow();

	await expect(
		autumnV2_1.check({
			customer_id: customerId,
			entity_id: missingEntityId,
			feature_id: TestFeature.Messages,
		}),
	).rejects.toThrow();

	// track: same legacy/V2.1 split as check.
	await expect(
		autumnV1.track({
			customer_id: customerId,
			entity_id: missingEntityId,
			feature_id: TestFeature.Messages,
			value: 1,
		}),
	).rejects.toThrow();

	await expect(
		autumnV2_1.track({
			customer_id: customerId,
			entity_id: missingEntityId,
			feature_id: TestFeature.Messages,
			value: 1,
		}),
	).rejects.toThrow();
});

test.concurrent(`${chalk.yellowBright("get-entity: entity cache updates after customer attach across repeated reads")}`, async () => {
	const dashboardItem = items.dashboard();
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const customerProd = products.pro({
		id: "get-entity-customer-attach",
		items: [dashboardItem, messagesItem],
	});
	const customerId = "get-entity-after-customer-attach";

	const { autumnV2_2, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [customerProd] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const entityId = entities[0].id;
	const beforeAttach = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entityId,
		{ keepInternalFields: true },
	);
	ApiEntityV2Schema.parse(beforeAttach);
	expect(beforeAttach.balances[TestFeature.Messages]).toBeUndefined();
	expect(beforeAttach.flags[TestFeature.Dashboard]).toBeUndefined();

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: customerProd.id,
		redirect_mode: "if_required",
	});

	const afterAttachFirst = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entityId,
		{ keepInternalFields: true },
	);
	const afterAttachSecond = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entityId,
		{ keepInternalFields: true },
	);

	ApiEntityV2Schema.parse(afterAttachFirst);
	ApiEntityV2Schema.parse(afterAttachSecond);

	expect(afterAttachFirst.flags[TestFeature.Dashboard]).toMatchObject({
		feature_id: TestFeature.Dashboard,
		plan_id: customerProd.id,
		expires_at: null,
	});
	expect(afterAttachSecond.flags[TestFeature.Dashboard]).toMatchObject({
		feature_id: TestFeature.Dashboard,
		plan_id: customerProd.id,
		expires_at: null,
	});

	expect(afterAttachFirst.balances[TestFeature.Messages]).toMatchObject({
		feature_id: TestFeature.Messages,
		granted: 100,
		remaining: 100,
		usage: 0,
	});
	expect(afterAttachSecond.balances[TestFeature.Messages]).toMatchObject({
		feature_id: TestFeature.Messages,
		granted: 100,
		remaining: 100,
		usage: 0,
	});
});
