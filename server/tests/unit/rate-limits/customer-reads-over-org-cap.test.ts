import { describe, expect, it } from "bun:test";
import type { FullSubject } from "@autumn/shared";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

// Over the org cap a read has no DB-free answer: it must 429 without touching
// the cache or Postgres, so the SDK's retry does the backoff.
let reads = 0;
const fakeSubject = { customer: { id: "cus_1" } } as unknown as FullSubject;

await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js",
	() => ({
		getOrSetCachedFullSubject: async () => {
			reads++;
			return fakeSubject;
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js",
	() => ({ isBalanceWorkerRolloutEnabled: () => false }),
);

const { getApiCustomerByRollout } = await import(
	"@/internal/customers/actions/getApiCustomerByRollout.js"
);
const { getApiEntityByRollout } = await import(
	"@/internal/entities/actions/getApiEntityByRollout.js"
);

const makeCtx = ({ degraded }: { degraded: boolean }) =>
	({
		org: { id: "org_1" },
		env: "sandbox",
		orgRateLimitDegraded: degraded,
		logger: { info() {}, warn() {}, error() {}, debug() {} },
	}) as never;

const rateLimited = {
	statusCode: 429,
	code: "rate_limit_exceeded",
	message: "Rate limit exceeded.",
};

describe("customer reads over the org rate cap", () => {
	it("customer get answers 429 before reading", async () => {
		reads = 0;

		await expect(
			getApiCustomerByRollout({
				ctx: makeCtx({ degraded: true }),
				customerId: "cus_1",
			}),
		).rejects.toMatchObject(rateLimited);

		expect(reads).toBe(0);
	});

	it("entity get answers 429 before reading", async () => {
		reads = 0;

		await expect(
			getApiEntityByRollout({
				ctx: makeCtx({ degraded: true }),
				customerId: "cus_1",
				entityId: "ent_1",
			}),
		).rejects.toMatchObject(rateLimited);

		expect(reads).toBe(0);
	});

	it("reads normally when the org is under its cap", async () => {
		reads = 0;

		await getApiCustomerByRollout({
			ctx: makeCtx({ degraded: false }),
			customerId: "cus_1",
		}).catch(() => {});

		expect(reads).toBe(1);
	});
});
