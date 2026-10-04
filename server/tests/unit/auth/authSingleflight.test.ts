import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	bindStagingVariants,
	STAGING_VARIANTS_BUCKET,
	type StagingArm,
	stagingVariantsEdgeConfig,
	variant,
} from "@autumn/edge-config";
import {
	_authFlightsInFlightForTesting,
	AUTH_SINGLEFLIGHT_EXPERIMENT,
	joinAuthFlight,
} from "@/internal/dev/apiKeys/actions/authSingleflight.js";
import type { ApiKeyVerificationData } from "@/internal/dev/repos/getApiKeyVerificationData.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const payload = {
	apiKeyId: "key_1",
	org: { id: "org_1", slug: "org-1" },
	features: [],
	env: "sandbox",
	userId: null,
	user: null,
	scopes: null,
} as unknown as ApiKeyVerificationData;

/** Pins the window so `variant()` answers `arm`; the hash is deterministic per window index. */
const pinArm = (arm: StagingArm) => {
	for (let window = 0; window < 200; window++) {
		bindStagingVariants({
			read: () => ({
				experiments: { [AUTH_SINGLEFLIGHT_EXPERIMENT]: { arms: ["A", "B"] } },
				updatedAt: new Date().toISOString(),
			}),
			identity: "task-1",
			bucket: STAGING_VARIANTS_BUCKET,
			now: () => window * 10_000 + 1,
		});
		if (variant(AUTH_SINGLEFLIGHT_EXPERIMENT) === arm) return;
	}
	throw new Error(`no window maps to ${arm}`);
};

afterEach(() => {
	bindStagingVariants({
		read: stagingVariantsEdgeConfig.defaultValue,
		identity: "",
		bucket: STAGING_VARIANTS_BUCKET,
	});
});

describe("joinAuthFlight", () => {
	test("concurrent callers share one verification and the flight clears once it settles", async () => {
		let calls = 0;
		const gate = Promise.withResolvers<void>();
		const verify = async () => {
			calls += 1;
			await gate.promise;
			return payload;
		};
		const flights = Array.from({ length: 50 }, () =>
			joinAuthFlight({ hashedKey: "h1", verify }),
		);
		expect(_authFlightsInFlightForTesting()).toBe(1);
		gate.resolve();
		const results = await Promise.all(flights);
		expect(calls).toBe(1);
		expect(new Set(results).size).toBe(1);
		await Promise.resolve();
		expect(_authFlightsInFlightForTesting()).toBe(0);
		await joinAuthFlight({ hashedKey: "h1", verify });
		expect(calls).toBe(2);
	});

	test("keys do not share flights, and a failed flight rejects every joiner and clears", async () => {
		let calls = 0;
		const verify = async () => {
			calls += 1;
			return payload;
		};
		await Promise.all([
			joinAuthFlight({ hashedKey: "a", verify }),
			joinAuthFlight({ hashedKey: "b", verify }),
		]);
		expect(calls).toBe(2);

		const failing = async (): Promise<ApiKeyVerificationData | null> => {
			throw new Error("postgres down");
		};
		const joined = [
			joinAuthFlight({ hashedKey: "c", verify: failing }),
			joinAuthFlight({ hashedKey: "c", verify: failing }),
		];
		for (const flight of joined)
			await expect(flight).rejects.toThrow("postgres down");
		expect(_authFlightsInFlightForTesting()).toBe(0);
	});
});

let verifications = 0;
await mockModuleWithRestore(
	"@/external/redis/actions/secretKeyCache/secretKeyCache.js",
	() => ({
		getCachedSecretKeyVerification: async () => null,
		setCachedSecretKeyVerification: async () => undefined,
	}),
);
await mockModuleWithRestore("@/internal/dev/repos/index.js", () => ({
	apiKeyRepo: {
		getVerificationData: async () => {
			verifications += 1;
			await new Promise((resolve) => setTimeout(resolve, 5));
			return payload;
		},
	},
}));
const { verifyKey } = await import(
	"@/internal/dev/apiKeys/actions/verifyKey.js"
);

describe("verifyKey under the auth-singleflight arms", () => {
	afterEach(() => {
		verifications = 0;
	});

	const db = {} as Parameters<typeof verifyKey>[0]["db"];
	const key = "am_sk_test_singleflight";

	test("A: every concurrent caller verifies on its own", async () => {
		pinArm("A");
		await Promise.all(Array.from({ length: 20 }, () => verifyKey({ db, key })));
		expect(verifications).toBe(20);
	});

	test("B: one verification per key, each caller with its own top-level copy", async () => {
		pinArm("B");
		const results = await Promise.all(
			Array.from({ length: 20 }, () => verifyKey({ db, key })),
		);
		expect(verifications).toBe(1);
		expect(results.every((r) => r?.org.id === "org_1")).toBe(true);
		expect(new Set(results).size).toBe(20);
		expect(new Set(results.map((r) => r?.org)).size).toBe(20);
	});

	test("B: a skipL1 read never joins another caller's flight", async () => {
		pinArm("B");
		await Promise.all(
			Array.from({ length: 5 }, () => verifyKey({ db, key, skipL1: true })),
		);
		expect(verifications).toBe(5);
	});

	test("outside the staging bucket the arm is A", () => {
		bindStagingVariants({
			read: () => ({
				experiments: { [AUTH_SINGLEFLIGHT_EXPERIMENT]: { arms: ["A", "B"] } },
				updatedAt: new Date().toISOString(),
			}),
			identity: "task-1",
			bucket: "autumn-prod-server",
		});
		expect(variant(AUTH_SINGLEFLIGHT_EXPERIMENT)).toBe("A");
		mock.restore();
	});
});
