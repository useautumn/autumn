import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import {
	buildFullSubjectCustomerEpochKey,
	buildFullSubjectKey,
	getCachedFullSubject,
	getOrSetCachedFullSubject,
	invalidateCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { cleanupFullSubjectScenario } from "../../integration/db/full-subject/utils/cleanupFullSubjectScenario.js";
import { buildEntitySubjectScenario } from "../../integration/db/full-subject/utils/fullSubjectScenarioBuilders.js";
import { insertFullSubjectScenario } from "../../integration/db/full-subject/utils/insertFullSubjectScenario.js";

const describeDb = process.env.TESTS_ORG ? describe : describe.skip;

describeDb("invalidateCachedFullSubject", () => {
	let ctx: TestContext;
	let scenario: ReturnType<typeof buildEntitySubjectScenario>;

	beforeAll(async () => {
		const { createTestContext } = await import(
			"@tests/utils/testInitUtils/createTestContext.js"
		);
		ctx = await createTestContext();
		scenario = buildEntitySubjectScenario({
			ctx,
			name: "invalidate-full-subject",
		});
	});

	beforeEach(async () => {
		await insertFullSubjectScenario({ ctx, scenario });
		await getOrSetCachedFullSubject({
			ctx,
			customerId: scenario.ids.customerId,
			source: "invalidateCachedFullSubjectTest",
		});
		await getOrSetCachedFullSubject({
			ctx,
			customerId: scenario.ids.customerId,
			entityId: scenario.ids.entityIds[0],
			source: "invalidateCachedFullSubjectTest",
		});
		await getOrSetCachedFullSubject({
			ctx,
			customerId: scenario.ids.customerId,
			entityId: scenario.ids.entityIds[1],
			source: "invalidateCachedFullSubjectTest",
		});
	});

	afterEach(async () => {
		const customerKeys = await redisV2.keys(`{${scenario.ids.customerId}}:*`);
		if (customerKeys.length > 0) {
			await redisV2.unlink(...customerKeys);
		}

		await cleanupFullSubjectScenario({ ctx, scenario });
	});

	test("invalidates direct entity cache and increments customer entity epoch", async () => {
		const entityAKey = buildFullSubjectKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: scenario.ids.customerId,
			entityId: scenario.ids.entityIds[0],
		});
		const entityBKey = buildFullSubjectKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: scenario.ids.customerId,
			entityId: scenario.ids.entityIds[1],
		});
		const customerKey = buildFullSubjectKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: scenario.ids.customerId,
		});

		await invalidateCachedFullSubject({
			ctx,
			customerId: scenario.ids.customerId,
			entityId: scenario.ids.entityIds[0],
			source: "invalidateCachedFullSubjectTest",
		});

		expect(await redisV2.exists(customerKey)).toBe(0);
		expect(await redisV2.exists(entityAKey)).toBe(0);
		expect(await redisV2.exists(entityBKey)).toBe(1);
		expect(
			await redisV2.get(
				buildFullSubjectCustomerEpochKey({
					orgId: ctx.org.id,
					env: ctx.env,
					customerId: scenario.ids.customerId,
				}),
			),
		).toBe("1");
	});

	test("increments customer entity epoch for customer invalidation", async () => {
		const entityAKey = buildFullSubjectKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: scenario.ids.customerId,
			entityId: scenario.ids.entityIds[0],
		});
		const entityBKey = buildFullSubjectKey({
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

		await invalidateCachedFullSubject({
			ctx,
			customerId: scenario.ids.customerId,
			source: "invalidateCachedFullSubjectTest",
		});

		expect(await redisV2.exists(entityAKey)).toBe(1);
		expect(await redisV2.exists(entityBKey)).toBe(1);
		expect(await redisV2.get(epochKey)).toBe("1");
	});

	test("sibling entity cache becomes stale after direct entity invalidation", async () => {
		const entityBKey = buildFullSubjectKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: scenario.ids.customerId,
			entityId: scenario.ids.entityIds[1],
		});

		await invalidateCachedFullSubject({
			ctx,
			customerId: scenario.ids.customerId,
			entityId: scenario.ids.entityIds[0],
			source: "invalidateCachedFullSubjectTest",
		});

		expect(await redisV2.exists(entityBKey)).toBe(1);

		const cachedEntityB = await getCachedFullSubject({
			ctx,
			customerId: scenario.ids.customerId,
			entityId: scenario.ids.entityIds[1],
			source: "invalidateCachedFullSubjectTest",
		});

		expect(cachedEntityB).toBeUndefined();
	});
});
