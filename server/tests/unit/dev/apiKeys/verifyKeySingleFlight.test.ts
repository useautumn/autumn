import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ApiKeyVerificationData } from "@/internal/dev/repos/getApiKeyVerificationData.js";

const realCache = {
	...(await import(
		"@/external/redis/actions/secretKeyCache/secretKeyCache.js"
	)),
};
const realRepos = { ...(await import("@/internal/dev/repos/index.js")) };

let dbReads = 0;
const pendingDbReads: (() => void)[] = [];
const releaseDbReads = () => {
	for (const release of pendingDbReads.splice(0)) release();
};
const verification = {
	org: { id: "org_1", slug: "org-1" },
	pendingMigrations: [],
} as unknown as ApiKeyVerificationData;

// A cold process: L1 and Redis both miss, so every caller falls through to Postgres.
mock.module(
	"@/external/redis/actions/secretKeyCache/secretKeyCache.js",
	() => ({
		...realCache,
		getCachedSecretKeyVerification: async () => null,
		setCachedSecretKeyVerification: async () => undefined,
	}),
);
mock.module("@/internal/dev/repos/index.js", () => ({
	...realRepos,
	apiKeyRepo: {
		...realRepos.apiKeyRepo,
		getVerificationData: async () => {
			dbReads++;
			await new Promise<void>((resolve) => pendingDbReads.push(resolve));
			return verification;
		},
	},
}));

afterAll(() => {
	mock.module(
		"@/external/redis/actions/secretKeyCache/secretKeyCache.js",
		() => realCache,
	);
	mock.module("@/internal/dev/repos/index.js", () => realRepos);
});

const { verifyKey } = await import(
	"@/internal/dev/apiKeys/actions/verifyKey.js"
);

const db = {} as never;

describe("verifyKey on a cache miss", () => {
	beforeEach(() => {
		dbReads = 0;
	});

	test("concurrent callers for one key share a single Postgres read", async () => {
		const callers = Array.from({ length: 50 }, () =>
			verifyKey({ db, key: "am_sk_live_same" }),
		);
		await Bun.sleep(0);
		releaseDbReads();
		const results = await Promise.all(callers);
		expect(dbReads).toBe(1);
		for (const result of results) expect(result?.org.id).toBe("org_1");
		// Each request still gets its own org object to put on its context.
		expect(results[0]).not.toBe(results[1]);
		expect(results[0]?.org).not.toBe(results[1]?.org);
	});

	test("the next miss after the shared read settles reads Postgres again", async () => {
		const first = verifyKey({ db, key: "am_sk_live_again" });
		await Bun.sleep(0);
		releaseDbReads();
		await first;
		const second = verifyKey({ db, key: "am_sk_live_again" });
		await Bun.sleep(0);
		releaseDbReads();
		await second;
		expect(dbReads).toBe(2);
	});

	test("different keys don't wait on each other", async () => {
		const one = verifyKey({ db, key: "am_sk_live_one" });
		await Bun.sleep(0);
		releaseDbReads();
		const two = verifyKey({ db, key: "am_sk_live_two" });
		await Bun.sleep(0);
		releaseDbReads();
		await Promise.all([one, two]);
		expect(dbReads).toBe(2);
	});
});
