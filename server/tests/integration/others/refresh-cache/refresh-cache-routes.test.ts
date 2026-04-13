import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { Hono } from "hono";
import { redis } from "@/external/redis/initRedis.js";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import { baseMiddleware } from "@/honoMiddlewares/baseMiddleware.js";
import {
	REFRESH_CACHE_ROUTE_CONFIGS,
	type RefreshCacheRouteConfig,
} from "@/honoMiddlewares/refreshCacheConfigs.js";
import { refreshCacheMiddleware } from "@/honoMiddlewares/refreshCacheMiddleware.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import {
	buildFullSubjectCustomerEpochKey,
	buildFullSubjectKey,
	getOrSetCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { getOrSetCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";
import { cleanupFullSubjectScenario } from "../../db/full-subject/utils/cleanupFullSubjectScenario.js";
import { buildEntitySubjectScenario } from "../../db/full-subject/utils/fullSubjectScenarioBuilders.js";
import { insertFullSubjectScenario } from "../../db/full-subject/utils/insertFullSubjectScenario.js";

const buildRequestData = ({
	config,
	customerId,
	entityIds,
}: {
	config: RefreshCacheRouteConfig;
	customerId: string;
	entityIds: string[];
}) => {
	const [entityA] = entityIds;
	const path = config.url
		.replace(":customer_id", customerId)
		.replace(":customer_entitlement_id", "ce_test")
		.replace(":entity_id", entityA ?? "ent_missing");

	switch (config.url) {
		case "/customers/:customer_id/entities":
			return {
				path,
				body: {
					id: entityA,
					name: "Entity A",
					feature_id: "users",
				},
				touchedEntityId: entityA,
			};
		case "/entities.create":
		case "/entities.delete":
		case "/balances/create":
		case "/balances.create":
		case "/balances.delete":
		case "/billing.update":
			return {
				path,
				body: {
					customer_id: customerId,
					entity_id: entityA,
				},
				touchedEntityId: entityA,
			};
		case "/customers.delete":
			return {
				path,
				body: {
					customer_id: customerId,
				},
			};
		case "/attach":
		case "/cancel":
		case "/subscriptions/update":
		case "/billing/attach":
		case "/billing.attach":
		case "/billing.setup_payment":
		case "/billing.multi_attach":
			return {
				path,
				body: {
					customer_id: customerId,
				},
			};
		case "/customers/:customer_id/transfer":
			return {
				path,
				body: {
					from_entity_id: entityA,
				},
			};
		default:
			return {
				path,
				body: undefined,
				touchedEntityId: config.url.includes(":entity_id")
					? entityA
					: undefined,
			};
	}
};

const warmCaches = async ({
	ctx,
	customerId,
	entityIds,
}: {
	ctx: TestContext;
	customerId: string;
	entityIds: string[];
}) => {
	await getOrSetCachedFullCustomer({
		ctx,
		customerId,
		source: "refreshCacheRoutesTest",
	});
	await getOrSetCachedFullSubject({
		ctx,
		customerId,
		source: "refreshCacheRoutesTest",
	});

	for (const entityId of entityIds) {
		await getOrSetCachedFullSubject({
			ctx,
			customerId,
			entityId,
			source: "refreshCacheRoutesTest",
		});
	}
};

const describeDb = process.env.TESTS_ORG ? describe : describe.skip;

describeDb("refreshCacheMiddleware routes", () => {
	let ctx: TestContext;
	let scenario: ReturnType<typeof buildEntitySubjectScenario>;
	const app = new Hono<HonoEnv>();

	beforeAll(async () => {
		const { createTestContext } = await import(
			"@tests/utils/testInitUtils/createTestContext.js"
		);
		ctx = await createTestContext();
		scenario = buildEntitySubjectScenario({
			ctx,
			name: "refresh-cache-routes",
		});

		await insertFullSubjectScenario({ ctx, scenario });

		app.use("*", baseMiddleware);
		app.use("*", async (c, next) => {
			const baseCtx = c.get("ctx");
			c.set("ctx", {
				...baseCtx,
				db: ctx.db,
				dbGeneral: ctx.db,
				org: ctx.org,
				env: ctx.env,
				features: ctx.features,
				logger: ctx.logger,
			});
			await next();
		});
		app.use("*", refreshCacheMiddleware);

		for (const config of REFRESH_CACHE_ROUTE_CONFIGS) {
			app.on(config.method, `/v1${config.url}`, (c) =>
				c.json({
					success: true,
				}),
			);
		}
	});

	afterAll(async () => {
		const customerKeys = await redisV2.keys(`{${scenario.ids.customerId}}:*`);
		if (customerKeys.length > 0) {
			await redisV2.unlink(...customerKeys);
		}
		const oldCacheKey = buildFullCustomerCacheKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: scenario.ids.customerId,
		});
		await redis.del(oldCacheKey);

		await cleanupFullSubjectScenario({ ctx, scenario });
	});

	test.each(
		REFRESH_CACHE_ROUTE_CONFIGS,
	)("$method $url invalidates the expected caches", async (config) => {
		await warmCaches({
			ctx,
			customerId: scenario.ids.customerId,
			entityIds: scenario.ids.entityIds,
		});

		const { path, body, touchedEntityId } = buildRequestData({
			config,
			customerId: scenario.ids.customerId,
			entityIds: scenario.ids.entityIds,
		});

		const response = await app.request(`http://localhost/v1${path}`, {
			method: config.method,
			headers: {
				"content-type": "application/json",
			},
			body: body ? JSON.stringify(body) : undefined,
		});

		expect(response.status).toBe(200);

		const oldCacheKey = buildFullCustomerCacheKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: scenario.ids.customerId,
		});
		const customerSubjectKey = buildFullSubjectKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: scenario.ids.customerId,
		});
		const entityASubjectKey = buildFullSubjectKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: scenario.ids.customerId,
			entityId: scenario.ids.entityIds[0],
		});
		const entityBSubjectKey = buildFullSubjectKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: scenario.ids.customerId,
			entityId: scenario.ids.entityIds[1],
		});
		const epochKey = buildFullSubjectCustomerEpochKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: scenario.ids.customerId,
		});

		expect(await redis.exists(oldCacheKey)).toBe(0);
		expect(await redisV2.exists(customerSubjectKey)).toBe(0);
		expect(await redisV2.get(epochKey)).toBe("1");

		if (touchedEntityId) {
			const touchedEntityKey = buildFullSubjectKey({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: scenario.ids.customerId,
				entityId: touchedEntityId,
			});
			expect(await redisV2.exists(touchedEntityKey)).toBe(0);

			const untouchedEntityKey =
				touchedEntityId === scenario.ids.entityIds[0]
					? entityBSubjectKey
					: entityASubjectKey;
			expect(await redisV2.exists(untouchedEntityKey)).toBe(1);
			return;
		}

		expect(await redisV2.exists(entityASubjectKey)).toBe(1);
		expect(await redisV2.exists(entityBSubjectKey)).toBe(1);
	});
});
