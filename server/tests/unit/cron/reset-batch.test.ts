import { describe, expect, test } from "bun:test";
import { AppEnv, type ResetCusEnt } from "@autumn/shared";
import type { CronContext } from "@/cron/utils/CronContext.js";

const cusEnt = {
	id: "cus-ent-1",
	customer: {
		id: "customer-1",
		org_id: "org-1",
		env: AppEnv.Sandbox,
	},
} as ResetCusEnt;
const calls = {
	fetchParams: null as unknown,
	reset: 0,
};
const batchSize = 1_000;

await mockModuleWithRestore(
	"@/internal/customers/cusProducts/cusEnts/CusEntitlementService",
	() => ({
		CusEntService: {
			getActiveResetPassed: async (params: unknown) => {
				calls.fetchParams = params;
				return [cusEnt];
			},
			upsert: async () => undefined,
		},
	}),
);
await mockModuleWithRestore("@/internal/orgs/OrgService.js", () => ({
	OrgService: {
		getWithFeatures: async () => ({
			org: { id: "org-1", config: {}, redis_config: null },
			features: [],
		}),
	},
}));
await mockModuleWithRestore(
	"@/internal/misc/resetJob/resetJobStore.js",
	() => ({
		getResetJobConfig: () => ({ enabled: true, batchSize }),
	}),
);
await mockModuleWithRestore(
	"@/cron/resetCron/resetCustomerEntitlement",
	() => ({
		resetCustomerEntitlement: async ({
			updatedCusEnts,
		}: {
			updatedCusEnts: ResetCusEnt[];
		}) => {
			calls.reset++;
			updatedCusEnts.push(cusEnt);
		},
	}),
);

import { runResetBatch } from "@/cron/resetCron/runResetBatch.js";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

describe("reset batch", () => {
	test("processes a partial page instead of waiting for a full batch", async () => {
		const result = await runResetBatch({
			ctx: {
				db: {},
				logger: { info: () => undefined, error: () => undefined },
			} as unknown as CronContext,
		});

		expect(calls.fetchParams).toMatchObject({
			batchSize,
			limit: batchSize,
		});
		expect(calls.reset).toBe(1);
		expect(result.batchSize).toBe(batchSize);
		expect(result.fetched).toBe(1);
	});
});
