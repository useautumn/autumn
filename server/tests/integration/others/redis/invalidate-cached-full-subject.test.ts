import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import {
	buildFullSubjectKey,
	buildFullSubjectViewEpochKey,
	getCachedFullSubject,
	invalidateCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { normalizedToCachedFullSubject } from "@/internal/customers/cache/fullSubject/fullSubjectCacheModel.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { cleanupFullSubjectScenario } from "../../db/full-subject/utils/cleanupFullSubjectScenario.js";
import { buildEntitySubjectScenario } from "../../db/full-subject/utils/fullSubjectScenarioBuilders.js";
import { insertFullSubjectScenario } from "../../db/full-subject/utils/insertFullSubjectScenario.js";

const describeDb = process.env.TESTS_ORG ? describe : describe.skip;

describeDb("invalidateCachedFullSubject", () => {
	let ctx: TestContext;
	let scenario: ReturnType<typeof buildEntitySubjectScenario>;

	const cleanupScenarioState = async () => {
		const customerKeys = await ctx.redisV2.keys(`{${scenario.ids.customerId}}:*`);
		if (customerKeys.length > 0) await ctx.redisV2.unlink(...customerKeys);

		await cleanupFullSubjectScenario({ ctx, scenario });
	};

	const getSubjectViewEpoch = async () => {
		const epoch = await ctx.redisV2.get(
			buildFullSubjectViewEpochKey({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: scenario.ids.customerId,
			}),
		);

		return epoch ? Number.parseInt(epoch, 10) : 0;
	};

	const seedCachedFullSubject = async ({ entityId }: { entityId?: string } = {}) => {
		const result = await getFullSubjectNormalized({
			ctx,
			customerId: scenario.ids.customerId,
			entityId,
		});
		if (!result) throw new Error("Failed to build full subject cache fixture");

		const cached = normalizedToCachedFullSubject({
			normalized: result.normalized,
			subjectViewEpoch: await getSubjectViewEpoch(),
		});
		const subjectKey = buildFullSubjectKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: scenario.ids.customerId,
			entityId,
		});

		await ctx.redisV2.set(subjectKey, JSON.stringify(cached));
	};

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
		await cleanupScenarioState();
		await insertFullSubjectScenario({ ctx, scenario });
		await seedCachedFullSubject();
		await seedCachedFullSubject({ entityId: scenario.ids.entityIds[0] });
		await seedCachedFullSubject({ entityId: scenario.ids.entityIds[1] });
	});

	afterEach(async () => {
		await cleanupScenarioState();
	});

	test("invalidates direct entity cache and increments subject view epoch", async () => {
		const initialSubjectViewEpoch = await getSubjectViewEpoch();
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

		expect(await ctx.redisV2.exists(customerKey)).toBe(0);
		expect(await ctx.redisV2.exists(entityAKey)).toBe(0);
		expect(await ctx.redisV2.exists(entityBKey)).toBe(1);
		expect(await getSubjectViewEpoch()).toBe(initialSubjectViewEpoch + 1);
	});

	test("increments subject view epoch for customer invalidation", async () => {
		const initialSubjectViewEpoch = await getSubjectViewEpoch();
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
		const epochKey = buildFullSubjectViewEpochKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: scenario.ids.customerId,
		});

		await invalidateCachedFullSubject({
			ctx,
			customerId: scenario.ids.customerId,
			source: "invalidateCachedFullSubjectTest",
		});

		expect(await ctx.redisV2.exists(entityAKey)).toBe(1);
		expect(await ctx.redisV2.exists(entityBKey)).toBe(1);
		expect(Number.parseInt((await ctx.redisV2.get(epochKey)) ?? "0", 10)).toBe(
			initialSubjectViewEpoch + 1,
		);
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

		expect(await ctx.redisV2.exists(entityBKey)).toBe(1);

		const { fullSubject: cachedEntityB } = await getCachedFullSubject({
			ctx,
			customerId: scenario.ids.customerId,
			entityId: scenario.ids.entityIds[1],
			source: "invalidateCachedFullSubjectTest",
		});

		expect(cachedEntityB).toBeUndefined();
	});
});
