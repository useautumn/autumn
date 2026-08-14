import { describe, expect, test } from "bun:test";
import { BalanceHandoffInProgressError } from "@/external/redis/utils/errors.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const databaseResult = {
	normalized: { customer: { id: "customer_1" } },
	fullSubject: {
		customer: { id: "customer_1" },
		extra_customer_entitlements: [],
	},
};
let writtenBalanceGeneration: number | undefined;
let cacheWriteResult = "FAILED";

await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/getCachedFullSubject.js",
	() => ({
		getCachedFullSubject: async () => ({
			fullSubject: undefined,
			subjectViewEpoch: 0,
			balanceGeneration: 4,
		}),
	}),
);

await mockModuleWithRestore(
	"@/internal/customers/repos/getFullSubject/index.js",
	() => ({
		getFullSubjectNormalized: async () => databaseResult,
	}),
);

await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/setCachedFullSubject/setCachedFullSubject.js",
	() => ({
		setCachedFullSubject: async ({
			normalized,
		}: {
			normalized: { balanceGeneration?: number };
		}) => {
			writtenBalanceGeneration = normalized.balanceGeneration;
			if (cacheWriteResult === "HANDOFF_IN_PROGRESS") {
				throw new BalanceHandoffInProgressError();
			}
			return cacheWriteResult;
		},
	}),
);

const { getOrSetCachedFullSubject } = await import(
	"@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js"
);
const { getOrCreateCachedFullSubject } = await import(
	"@/internal/customers/cache/fullSubject/actions/getOrCreateCachedFullSubject.js"
);

describe("getOrSetCachedFullSubject balance generation", () => {
	test("uses the Redis generation when filling a cache miss", async () => {
		const result = await getOrSetCachedFullSubject({
			ctx: {
				skipCache: false,
				logger: { debug: () => {} },
			} as never,
			customerId: "customer_1",
			staleWhileRevalidate: false,
		});

		expect(writtenBalanceGeneration).toBe(4);
		expect(result.balanceGeneration).toBe(4);
	});

	test("does not serve a database view while attach is publishing Redis", async () => {
		cacheWriteResult = "HANDOFF_IN_PROGRESS";

		await expect(
			getOrSetCachedFullSubject({
				ctx: {
					skipCache: false,
					logger: { debug: () => {} },
				} as never,
				customerId: "customer_1",
				staleWhileRevalidate: false,
			}),
		).rejects.toBeInstanceOf(BalanceHandoffInProgressError);
	});

	test("does not let the legacy get-or-create path swallow the handoff", async () => {
		cacheWriteResult = "HANDOFF_IN_PROGRESS";

		await expect(
			getOrCreateCachedFullSubject({
				ctx: {
					skipCache: false,
					logger: { debug: () => {}, error: () => {} },
				} as never,
				params: { customer_id: "customer_1" } as never,
			}),
		).rejects.toBeInstanceOf(BalanceHandoffInProgressError);
	});
});
