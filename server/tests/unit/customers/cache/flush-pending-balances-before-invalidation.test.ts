import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { ApiVersionClass, AppEnv, LATEST_VERSION } from "@autumn/shared";
import { Hono } from "hono";
import * as withLockModule from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import * as balanceWorkerFlush from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer.js";
import { CusService } from "@/internal/customers/CusService.js";
import * as batchInvalidate from "@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects.js";
import * as flushModule from "@/internal/customers/cache/fullSubject/actions/invalidate/flushCachedSubjectBalances.js";
import { flushCachedSubjectBalances } from "@/internal/customers/cache/fullSubject/actions/invalidate/flushCachedSubjectBalances.js";
import * as deleteCached from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { handleClearCustomerCache } from "@/internal/customers/handlers/handleClearCustomerCache.js";
import { batchCreateEntities } from "@/internal/entities/actions/batchCreateEntities.js";
import * as createEntities from "@/internal/entities/actions/createEntitiesV2/createEntitiesV2.js";
import { deleteEntity } from "@/internal/entities/actions/deleteEntity.js";
import * as rollout from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";

const CUSTOMER_ID = "cus_flush";
const manifest = JSON.stringify({
	internalCustomerId: "cus_internal",
	customerEntitlementIdsByFeatureId: { messages: ["cus_ent_1"] },
	usageWindowFeatureIds: [],
});

/** Just enough Redis to tell a GETDEL flush from a blind HDEL. */
const createFakeRedis = () => {
	const hdel = mock(() => undefined);
	const getDel = mock(async () => null);
	const redis = {
		status: "ready",
		get: mock(async () => manifest),
		pipeline: () => ({ hdel, exec: mock(async () => []) }),
		getDelFullSubjectBalanceFields: getDel,
	};
	return { redis, hdel, getDel };
};

const createContext = ({ redisV2 }: { redisV2?: unknown } = {}) => {
	const error = mock(() => undefined);
	const ctx = {
		id: "req_flush",
		timestamp: Date.now(),
		org: { id: "org_flush", slug: "org-flush" },
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(LATEST_VERSION),
		features: [],
		redisV2,
		logger: {
			info: mock(() => undefined),
			warn: mock(() => undefined),
			error,
		},
	} as unknown as AutumnContext;
	return { ctx, error };
};

/** Records the order of the steps under test and stops the action once it reaches Postgres. */
const STOP = new Error("stop after the first Postgres step");

afterEach(() => {
	mock.restore();
});

describe("flushCachedSubjectBalances", () => {
	test("flushes a legacy customer's cached balances (GETDEL), not a blind delete", async () => {
		spyOn(rollout, "isBalanceWorkerRolloutEnabled").mockImplementation(
			() => false,
		);
		const { redis, hdel, getDel } = createFakeRedis();
		const { ctx } = createContext({ redisV2: redis });

		await flushCachedSubjectBalances({
			ctx,
			customerId: CUSTOMER_ID,
			source: "test",
		});

		expect(getDel).toHaveBeenCalledTimes(1);
		expect(hdel).not.toHaveBeenCalled();
	});

	test("leaves a customer on the balance worker alone", async () => {
		spyOn(rollout, "isBalanceWorkerRolloutEnabled").mockImplementation(
			() => true,
		);
		const { redis, hdel, getDel } = createFakeRedis();
		const { ctx } = createContext({ redisV2: redis });

		await flushCachedSubjectBalances({
			ctx,
			customerId: CUSTOMER_ID,
			source: "test",
		});

		expect(redis.get).not.toHaveBeenCalled();
		expect(getDel).not.toHaveBeenCalled();
		expect(hdel).not.toHaveBeenCalled();
	});

	test("a Redis failure is logged and never fails the caller", async () => {
		spyOn(rollout, "isBalanceWorkerRolloutEnabled").mockImplementation(
			() => false,
		);
		const { redis } = createFakeRedis();
		redis.get = mock(async () => {
			throw new Error("Command timed out");
		});
		const { ctx, error } = createContext({ redisV2: redis });

		await flushCachedSubjectBalances({
			ctx,
			customerId: CUSTOMER_ID,
			source: "test",
		});

		expect(error).toHaveBeenCalledTimes(1);
	});
});

describe("entity writes land pending deductions before they read Postgres", () => {
	const recordSteps = ({ onWorker }: { onWorker: boolean }) => {
		const steps: string[] = [];
		spyOn(rollout, "isBalanceWorkerRolloutEnabled").mockImplementation(
			() => onWorker,
		);
		spyOn(flushModule, "flushCachedSubjectBalances").mockImplementation(
			async () => {
				steps.push("flush cached balances");
			},
		);
		spyOn(balanceWorkerFlush, "flushBalanceWorkerCustomer").mockImplementation(
			async () => {
				steps.push("flush balance worker");
			},
		);
		spyOn(CusService, "getFull").mockImplementation(async () => {
			steps.push("read postgres");
			throw STOP;
		});
		spyOn(createEntities, "createEntitiesV2").mockImplementation(async () => {
			steps.push("create entities");
			throw STOP;
		});
		spyOn(withLockModule, "withLock").mockImplementation((({
			fn,
		}: {
			fn: () => Promise<unknown>;
		}) => fn()) as never);
		return steps;
	};

	test("entities.create flushes before creating", async () => {
		const steps = recordSteps({ onWorker: false });
		const { ctx } = createContext();

		await expect(
			batchCreateEntities({
				ctx,
				customerId: CUSTOMER_ID,
				createEntityData: { id: "seat-1", name: "seat", feature_id: "seats" },
				enqueueRecoveryOnTransientFailure: false,
			}),
		).rejects.toBe(STOP);

		expect(steps).toEqual(["flush cached balances", "create entities"]);
	});

	test("entities.delete flushes before reading the customer", async () => {
		const steps = recordSteps({ onWorker: false });
		const { ctx } = createContext();

		await expect(
			deleteEntity({
				ctx,
				params: { customer_id: CUSTOMER_ID, entity_id: "seat-1" },
			}),
		).rejects.toBe(STOP);

		expect(steps).toEqual(["flush cached balances", "read postgres"]);
	});

	test("entities.delete on the balance worker still flushes the worker only", async () => {
		const steps = recordSteps({ onWorker: true });
		const { ctx } = createContext();

		await expect(
			deleteEntity({
				ctx,
				params: { customer_id: CUSTOMER_ID, entity_id: "seat-1" },
			}),
		).rejects.toBe(STOP);

		expect(steps).toEqual(["flush balance worker", "read postgres"]);
	});
});

describe("clear_cache flushes pending deductions instead of dropping them", () => {
	const createApp = () => {
		const app = new Hono<HonoEnv>();
		app.use("*", async (context, next) => {
			context.set("ctx", {
				...createContext().ctx,
				scopes: ["customers:write"],
			} as never);
			await next();
		});
		app.post("/customers/clear_cache", ...handleClearCustomerCache);
		return app;
	};

	const post = (app: Hono<HonoEnv>, body: unknown) =>
		app.request("/customers/clear_cache", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});

	test("a single customer is invalidated with flushBalances", async () => {
		const deleteCalls: Record<string, unknown>[] = [];
		spyOn(deleteCached, "deleteCachedFullCustomer").mockImplementation(
			async (args) => {
				deleteCalls.push(args as never);
			},
		);

		const response = await post(createApp(), { customer_id: CUSTOMER_ID });

		expect(response.status).toBe(200);
		expect(deleteCalls).toHaveLength(1);
		expect(deleteCalls[0]).toMatchObject({
			customerId: CUSTOMER_ID,
			flushBalances: true,
		});
	});

	test("a batch flushes every customer before the batch unlink", async () => {
		const steps: string[] = [];
		spyOn(flushModule, "flushCachedSubjectBalances").mockImplementation(
			async ({ customerId }) => {
				steps.push(`flush ${customerId}`);
			},
		);
		spyOn(
			batchInvalidate,
			"batchInvalidateCachedFullSubjects",
		).mockImplementation(async () => {
			steps.push("batch unlink");
			return undefined as never;
		});

		const response = await post(createApp(), {
			customer_ids: ["cus_1", "cus_2", "cus_3"],
		});

		expect(response.status).toBe(200);
		expect(steps).toEqual([
			"flush cus_1",
			"flush cus_2",
			"flush cus_3",
			"batch unlink",
		]);
	});
});
