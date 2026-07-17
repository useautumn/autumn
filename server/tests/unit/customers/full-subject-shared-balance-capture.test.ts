import { describe, expect, test } from "bun:test";
import type { Redis } from "ioredis";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { captureAndDeleteSharedBalanceFields } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateSharedBalanceFields.js";

const manifest = JSON.stringify({
	internalCustomerId: "internal_customer_1",
	customerEntitlementIdsByFeatureId: { messages: ["cus_ent_1"] },
	usageWindowFeatureIds: [],
});

const createContext = ({ redisV2 }: { redisV2: Redis }) =>
	({
		org: { id: "org_1" },
		env: "sandbox",
		redisV2,
		logger: {
			info: () => undefined,
			warn: () => undefined,
		},
	}) as unknown as AutumnContext;

const createRedis = ({
	get,
	getDel,
}: {
	get: () => Promise<string | null>;
	getDel?: () => Promise<string>;
}) =>
	({
		status: "ready",
		get,
		getDelFullSubjectBalanceFields:
			getDel ?? (async () => JSON.stringify([[null, null]])),
	}) as unknown as Redis;

describe("strict FullSubject shared-balance capture", () => {
	test("uses database-derived targets when only an entity subject view exists", async () => {
		const cachedBalance = JSON.stringify({
			id: "cus_ent_1",
			feature_id: "messages",
			balance: 200,
			adjustment: 500,
			cache_version: 0,
			next_reset_at: null,
			entities: null,
			rollovers: [],
			replaceables: [],
		});
		let captureCalls = 0;
		const redisV2 = createRedis({
			get: async () => null,
			getDel: async () => {
				captureCalls += 1;
				return JSON.stringify([[cachedBalance, null]]);
			},
		});

		const captured = await captureAndDeleteSharedBalanceFields({
			ctx: createContext({ redisV2 }),
			customerId: "customer_1",
			failureMode: "strict",
			resolveTargetsOnManifestMiss: async () => ({
				internalCustomerId: "internal_customer_1",
				featureIds: ["messages"],
				balanceKeys: ["shared-messages"],
				customerEntitlementIdsByKey: [["cus_ent_1"]],
			}),
		});

		expect(captureCalls).toBe(1);
		expect(captured?.subjectBalances).toHaveLength(1);
		expect(captured?.subjectBalances[0]).toMatchObject({
			id: "cus_ent_1",
			feature_id: "messages",
			balance: 200,
			adjustment: 500,
		});
	});

	test("distinguishes a genuine missing subject view from a failed GET", async () => {
		const missingRedis = createRedis({ get: async () => null });
		await expect(
			captureAndDeleteSharedBalanceFields({
				ctx: createContext({ redisV2: missingRedis }),
				customerId: "customer_1",
				failureMode: "strict",
			}),
		).resolves.toBeNull();

		const failingRedis = createRedis({
			get: async () => {
				throw new Error("synthetic GET failure");
			},
		});
		await expect(
			captureAndDeleteSharedBalanceFields({
				ctx: createContext({ redisV2: failingRedis }),
				customerId: "customer_1",
				failureMode: "strict",
			}),
		).rejects.toThrow("source=captureSharedBalanceFields:get");
	});

	test("fails closed when GETDEL fails or returns an unparseable snapshot", async () => {
		const failingRedis = createRedis({
			get: async () => manifest,
			getDel: async () => {
				throw new Error("synthetic GETDEL failure");
			},
		});
		await expect(
			captureAndDeleteSharedBalanceFields({
				ctx: createContext({ redisV2: failingRedis }),
				customerId: "customer_1",
				failureMode: "strict",
			}),
		).rejects.toThrow("source=captureSharedBalanceFields:getdel");

		const malformedRedis = createRedis({
			get: async () => manifest,
			getDel: async () => "not-json",
		});
		await expect(
			captureAndDeleteSharedBalanceFields({
				ctx: createContext({ redisV2: malformedRedis }),
				customerId: "customer_1",
				failureMode: "strict",
			}),
		).rejects.toMatchObject({ code: "shared_balance_capture_failed" });
	});

	test("keeps existing best-effort callers fail-open", async () => {
		const failingRedis = createRedis({
			get: async () => {
				throw new Error("synthetic GET failure");
			},
		});
		await expect(
			captureAndDeleteSharedBalanceFields({
				ctx: createContext({ redisV2: failingRedis }),
				customerId: "customer_1",
			}),
		).resolves.toBeNull();
	});
});
