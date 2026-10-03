import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { Redis } from "ioredis";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

// Records the order the clear runs its steps in, across every mocked module.
const steps: string[] = [];

const primaryRedis = { name: "primary" } as unknown as Redis;
const orgRedis = { name: "org" } as unknown as Redis;
let failFlushForCustomerId: string | null = null;

const sharedFieldsModulePath =
	"@/internal/customers/cache/fullSubject/actions/invalidate/invalidateSharedBalanceFields.js";
const realSharedFields = { ...(await import(sharedFieldsModulePath)) };
mock.module(sharedFieldsModulePath, () => ({
	...realSharedFields,
	invalidateSharedBalanceFields: async ({
		customerId,
		redisV2,
		flushBalances,
	}: {
		customerId: string;
		redisV2: { name: string };
		flushBalances: boolean;
	}) => {
		if (customerId === failFlushForCustomerId) {
			throw new Error("GETDEL failed");
		}
		steps.push(`flush:${customerId}:${redisV2.name}:${flushBalances}`);
	},
}));

const routingModulePath = "@/external/redis/customerRedisRouting.js";
const realRouting = { ...(await import(routingModulePath)) };
mock.module(routingModulePath, () => ({
	...realRouting,
	getCtxWithCustomerRedis: ({ ctx }: { ctx: AutumnContext }) => ({
		ctx: { ...ctx, redisV2: primaryRedis },
	}),
	getRedisTargetsForCustomer: () => [primaryRedis, orgRedis],
}));

const batchInvalidateModulePath =
	"@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects.js";
const realBatchInvalidate = { ...(await import(batchInvalidateModulePath)) };
mock.module(batchInvalidateModulePath, () => ({
	...realBatchInvalidate,
	batchInvalidateCachedFullSubjects: async ({
		customers,
	}: {
		customers: { customerId: string }[];
	}) => {
		for (const { customerId } of customers) steps.push(`unlink:${customerId}`);
		return customers.length;
	},
}));

const orgServiceModulePath = "@/internal/orgs/OrgService.js";
const realOrgService = { ...(await import(orgServiceModulePath)) };
const org = { id: "org_test", slug: "org-test" };
mock.module(orgServiceModulePath, () => ({
	...realOrgService,
	OrgService: {
		...realOrgService.OrgService,
		getWithFeatures: async () => ({ org, features: [] }),
	},
}));

const workerContextModulePath = "@/queue/createWorkerContext.js";
const realWorkerContext = { ...(await import(workerContextModulePath)) };
mock.module(workerContextModulePath, () => ({
	...realWorkerContext,
	createWorkerContext: async () =>
		({
			org,
			env: AppEnv.Sandbox,
			features: [],
			logger: silentLogger,
			redisV2: primaryRedis,
		}) as unknown as AutumnContext,
}));

afterAll(() => {
	mock.module(sharedFieldsModulePath, () => realSharedFields);
	mock.module(routingModulePath, () => realRouting);
	mock.module(batchInvalidateModulePath, () => realBatchInvalidate);
	mock.module(orgServiceModulePath, () => realOrgService);
	mock.module(workerContextModulePath, () => realWorkerContext);
});

const silentLogger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	debug: () => {},
} as unknown as AutumnContext["logger"];

const { runClearCreditSystemCacheTask } = await import(
	"@/internal/features/featureActions/runClearCreditSystemCacheTask.js"
);

/** Answers the task's count query, then its paged customer query. */
const createFakeDb = ({ customerIds }: { customerIds: string[] }) => {
	let result: unknown;
	const query = {
		select: () => {
			result = [{ count: customerIds.length }];
			return query;
		},
		selectDistinct: () => {
			result = customerIds.map((customerId) => ({
				customerId,
				internalCustomerId: `internal_${customerId}`,
			}));
			return query;
		},
		from: () => query,
		innerJoin: () => query,
		where: () => query,
		orderBy: () => query,
		limit: () => query,
		// biome-ignore lint/suspicious/noThenProperty: mimics an awaitable Drizzle query
		then: (
			resolve: (value: unknown) => unknown,
			reject: (reason: unknown) => unknown,
		) => Promise.resolve(result).then(resolve, reject),
	};
	return query as unknown as DrizzleCli;
};

const runClear = ({ customerIds }: { customerIds: string[] }) =>
	runClearCreditSystemCacheTask({
		db: createFakeDb({ customerIds }),
		payload: {
			orgId: org.id,
			env: AppEnv.Sandbox,
			internalFeatureId: "fe_credits",
		},
		logger: silentLogger,
	});

describe("credit-system cache clear", () => {
	beforeEach(() => {
		steps.length = 0;
		failFlushForCustomerId = null;
	});

	test("flushes every customer's cached balances on every Redis target before unlinking", async () => {
		await runClear({ customerIds: ["cus_a", "cus_b"] });

		const firstUnlink = steps.findIndex((step) => step.startsWith("unlink:"));
		expect(steps.slice(0, firstUnlink).sort()).toEqual([
			"flush:cus_a:org:true",
			"flush:cus_a:primary:true",
			"flush:cus_b:org:true",
			"flush:cus_b:primary:true",
		]);
		expect(steps.slice(firstUnlink)).toEqual(["unlink:cus_a", "unlink:cus_b"]);
	});

	test("one customer's failed flush does not stop the others or the clear", async () => {
		failFlushForCustomerId = "cus_a";

		await runClear({ customerIds: ["cus_a", "cus_b"] });

		expect(steps).toEqual([
			"flush:cus_b:primary:true",
			"flush:cus_b:org:true",
			"unlink:cus_a",
			"unlink:cus_b",
		]);
	});
});
