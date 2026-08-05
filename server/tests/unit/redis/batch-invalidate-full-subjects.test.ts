import { describe, expect, test } from "bun:test";
import type { AppEnv, Feature } from "@autumn/shared";
import type { Redis } from "ioredis";
import { batchInvalidateCachedFullSubjects } from "@/internal/customers/cache/fullSubject/actions/invalidate/batchInvalidateCachedFullSubjects.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";
import { buildFullSubjectOrgEnvKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectOrgEnvKey.js";

type RedisCalls = {
	readKeys: string[];
	writeOps: string[];
};

const createFakeRedis = ({
	status = "ready",
	readFails = false,
}: {
	status?: string;
	readFails?: boolean;
} = {}): { redis: Redis; calls: RedisCalls } => {
	const calls: RedisCalls = {
		readKeys: [],
		writeOps: [],
	};
	let pipelineCount = 0;

	const redis = {
		status,
		pipeline: () => {
			const isReadPipeline = pipelineCount % 2 === 0;
			pipelineCount++;

			const readKeys: string[] = [];
			const writeOps: string[] = [];
			const pipeline = {
				get: (key: string) => {
					readKeys.push(key);
					return pipeline;
				},
				unlink: (key: string) => {
					writeOps.push(`unlink:${key}`);
					return pipeline;
				},
				incr: (key: string) => {
					writeOps.push(`incr:${key}`);
					return pipeline;
				},
				expire: (key: string, ttlSeconds: number) => {
					writeOps.push(`expire:${key}:${ttlSeconds}`);
					return pipeline;
				},
				exec: async () => {
					if (isReadPipeline) {
						if (readFails) throw new Error("Command timed out");
						calls.readKeys.push(...readKeys);
						return readKeys.map(() => [
							null,
							JSON.stringify({ meteredFeatures: ["feature_metered"] }),
						]);
					}

					calls.writeOps.push(...writeOps);
					return [];
				},
			};

			return pipeline;
		},
	} as unknown as Redis;

	return { redis, calls };
};

describe("batchInvalidateCachedFullSubjects", () => {
	test("fans out invalidation to the Redis instance for each customer", async () => {
		const primary = createFakeRedis();
		const dedicated = createFakeRedis();
		const customers = [
			{
				orgId: "org_test",
				env: "sandbox" as AppEnv,
				customerId: "cus_primary",
			},
			{
				orgId: "org_test",
				env: "sandbox" as AppEnv,
				customerId: "cus_dedicated",
			},
		];

		const deleted = await batchInvalidateCachedFullSubjects({
			customers,
			featuresByOrgEnv: {},
			getRedisTargetsForCustomer: ({ customer }) => [
				customer.customerId === "cus_dedicated"
					? dedicated.redis
					: primary.redis,
			],
		});

		expect(deleted).toBe(2);

		expect(primary.calls.readKeys).toHaveLength(1);
		expect(primary.calls.readKeys[0]).toContain("cus_primary");
		expect(primary.calls.readKeys[0]).not.toContain("cus_dedicated");

		expect(dedicated.calls.readKeys).toHaveLength(1);
		expect(dedicated.calls.readKeys[0]).toContain("cus_dedicated");
		expect(dedicated.calls.readKeys[0]).not.toContain("cus_primary");

		expect(
			primary.calls.writeOps.some((op) => op.includes("cus_primary")),
		).toBe(true);
		expect(
			dedicated.calls.writeOps.some((op) => op.includes("cus_dedicated")),
		).toBe(true);
	});

	test("dedupes duplicate Redis targets for the same customer", async () => {
		const primary = createFakeRedis();
		const customers = [
			{
				orgId: "org_test",
				env: "sandbox" as AppEnv,
				customerId: "cus_primary",
			},
		];

		await batchInvalidateCachedFullSubjects({
			customers,
			featuresByOrgEnv: {},
			getRedisTargetsForCustomer: () => [primary.redis, primary.redis],
		});

		expect(primary.calls.readKeys).toHaveLength(1);
		expect(
			primary.calls.writeOps.some((op) => op.includes("cus_primary")),
		).toBe(true);
	});

	/**
	 * A dedicated org Redis is created lazily on first use, so inside a fresh
	 * trigger.dev batch-migration runner it is still "connecting" when finalize
	 * invalidates. Dropping the invalidation there leaves every migrated
	 * customer on that org reading a stale FullSubject until the 3-day TTL.
	 */
	test("still invalidates when the target Redis is not ready yet", async () => {
		const connecting = createFakeRedis({ status: "connecting" });
		const customer = {
			orgId: "org_test",
			env: "sandbox" as AppEnv,
			customerId: "cus_cold_connection",
		};

		await batchInvalidateCachedFullSubjects({
			customers: [customer],
			featuresByOrgEnv: {
				[buildFullSubjectOrgEnvKey({
					orgId: customer.orgId,
					env: customer.env,
				})]: [{ id: "feature_metered" }] as Feature[],
			},
			getRedisTargetsForCustomer: () => [connecting.redis],
		});

		expect(connecting.calls.writeOps).toContain(
			`unlink:${buildFullSubjectKey({
				orgId: customer.orgId,
				env: customer.env,
				customerId: customer.customerId,
			})}`,
		);
		expect(connecting.calls.writeOps.some((op) => op.startsWith("incr:"))).toBe(
			true,
		);
		expect(
			connecting.calls.writeOps.some((op) => op.includes("feature_metered")),
		).toBe(true);
	});

	test("falls back to org features when the manifest read is unavailable", async () => {
		const readBroken = createFakeRedis({ readFails: true });
		const customer = {
			orgId: "org_test",
			env: "sandbox" as AppEnv,
			customerId: "cus_read_broken",
		};

		await batchInvalidateCachedFullSubjects({
			customers: [customer],
			featuresByOrgEnv: {
				[buildFullSubjectOrgEnvKey({
					orgId: customer.orgId,
					env: customer.env,
				})]: [{ id: "feature_metered" }] as Feature[],
			},
			getRedisTargetsForCustomer: () => [readBroken.redis],
		});

		expect(
			readBroken.calls.writeOps.some((op) => op.includes("cus_read_broken")),
		).toBe(true);
		expect(
			readBroken.calls.writeOps.some((op) => op.includes("feature_metered")),
		).toBe(true);
	});
});
