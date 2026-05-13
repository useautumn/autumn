import { describe, expect, test } from "bun:test";
import type { OrgRedisConfig } from "@autumn/shared";
import {
	getOrgRedisEndpoint,
	getOrgRedisRuntime,
} from "@/external/redis/orgRedisEndpoint.js";

const makeRedisConfig = (
	overrides: Partial<OrgRedisConfig> = {},
): OrgRedisConfig => ({
	connectionString: "encrypted-private",
	workerConnectionString: "encrypted-public",
	url: "private.dragonflydb.cloud:6379",
	workerUrl: "public.dragonflydb.cloud:6385",
	migrationPercent: 50,
	previousMigrationPercent: 0,
	migrationChangedAt: 1000,
	...overrides,
});

describe("org Redis endpoint selection", () => {
	test("uses the primary endpoint for API/default runtime", () => {
		expect(
			getOrgRedisEndpoint({
				redisConfig: makeRedisConfig(),
				runtime: "default",
			}),
		).toEqual({
			connectionString: "encrypted-private",
			url: "private.dragonflydb.cloud:6379",
			runtime: "default",
		});
	});

	test("uses the worker endpoint for worker runtime when configured", () => {
		expect(
			getOrgRedisEndpoint({
				redisConfig: makeRedisConfig(),
				runtime: "worker",
			}),
		).toEqual({
			connectionString: "encrypted-public",
			url: "public.dragonflydb.cloud:6385",
			runtime: "worker",
		});
	});

	test("falls back to the primary endpoint for workers without a worker endpoint", () => {
		expect(
			getOrgRedisEndpoint({
				redisConfig: makeRedisConfig({
					workerConnectionString: undefined,
					workerUrl: undefined,
				}),
				runtime: "worker",
			}),
		).toEqual({
			connectionString: "encrypted-private",
			url: "private.dragonflydb.cloud:6379",
			runtime: "default",
		});
	});

	test("detects worker runtime from AUTUMN_PROCESS_TYPE", () => {
		const originalProcessType = process.env.AUTUMN_PROCESS_TYPE;

		process.env.AUTUMN_PROCESS_TYPE = "worker";
		expect(getOrgRedisRuntime()).toBe("worker");

		process.env.AUTUMN_PROCESS_TYPE = "server";
		expect(getOrgRedisRuntime()).toBe("default");

		if (originalProcessType === undefined) {
			delete process.env.AUTUMN_PROCESS_TYPE;
		} else {
			process.env.AUTUMN_PROCESS_TYPE = originalProcessType;
		}
	});
});
