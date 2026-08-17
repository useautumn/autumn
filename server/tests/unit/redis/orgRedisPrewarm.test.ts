import { afterAll, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";
import { createRedisReadPool } from "@/external/redis/initUtils/createRedisReadPool.js";

class FakeRedis extends EventEmitter {
	status = "connecting";
	disconnect() {}
}

const instances: FakeRedis[] = [];

const createFakeRedis = (): FakeRedis => {
	const instance = new FakeRedis();
	instances.push(instance);
	return instance;
};

const fakeOrg = (id: string) => ({
	id,
	slug: id,
	redis_config: {
		url: `redis://${id}.internal:6379`,
		connectionString: `redis://${id}.internal:6379`,
		publicConnectionString: `redis://${id}.public:6379`,
	},
});

// Capture the real modules before mocking so afterAll can restore them —
// bun's mock.module leaks across test files otherwise.
const realOrgService = {
	...(await import("@/internal/orgs/OrgService.js")),
};
const realEncryptUtils = {
	...(await import("@/utils/encryptUtils.js")),
};
const realResolveRedisV2 = {
	...(await import("@/external/redis/resolveRedisV2.js")),
};
const realInitRedis = {
	...(await import("@/external/redis/initRedis.js")),
};

mock.module("@/internal/orgs/OrgService.js", () => ({
	OrgService: {
		listWithRedisConfig: async () => [fakeOrg("org-a"), fakeOrg("org-b")],
	},
}));
mock.module("@/utils/encryptUtils.js", () => ({
	decryptData: (value: string) => value,
	encryptData: (value: string) => value,
}));
mock.module("@/external/redis/resolveRedisV2.js", () => ({
	resolveRedisV2: () => new FakeRedis(),
}));
mock.module("@/external/redis/initRedis.js", () => ({
	currentRegion: "test",
	createStandbyRedisConnection: createFakeRedis,
	createPooledStandbyRedisConnection: () =>
		createRedisReadPool({
			lanes: [
				createFakeRedis() as unknown as Redis,
				createFakeRedis() as unknown as Redis,
			],
		}),
}));

afterAll(() => {
	mock.module("@/internal/orgs/OrgService.js", () => realOrgService);
	mock.module("@/utils/encryptUtils.js", () => realEncryptUtils);
	mock.module("@/external/redis/resolveRedisV2.js", () => realResolveRedisV2);
	mock.module("@/external/redis/initRedis.js", () => realInitRedis);
});

describe("preWarmOrgRedisConnections", () => {
	test("resolves only once every dedicated connection is ready", async () => {
		const { preWarmOrgRedisConnections } = await import(
			"@/external/redis/orgRedisPool.js"
		);

		let settled = false;
		const warmup = preWarmOrgRedisConnections({ db: {} as never }).then(() => {
			settled = true;
		});

		await Bun.sleep(30);
		expect(instances.length).toBe(4);
		expect(settled).toBe(false);

		for (const instance of instances.slice(0, 3)) {
			instance.status = "ready";
			instance.emit("ready");
		}
		await Bun.sleep(10);
		expect(settled).toBe(false);

		const lastInstance = instances[3];
		expect(lastInstance).toBeDefined();
		lastInstance!.status = "ready";
		lastInstance!.emit("ready");
		await warmup;
		expect(settled).toBe(true);
	});
});
