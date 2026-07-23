import { describe, expect, mock, test } from "bun:test";
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
	cleared: [] as ResetCusEnt[],
};

mock.module(
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
mock.module("@/internal/orgs/OrgService.js", () => ({
	OrgService: {
		getWithFeatures: async () => ({
			org: { id: "org-1", config: {}, redis_config: null },
			features: [],
		}),
	},
}));
mock.module("@/cron/resetCron/resetCustomerEntitlement", () => ({
	resetCustomerEntitlement: async ({
		updatedCusEnts,
	}: {
		updatedCusEnts: ResetCusEnt[];
	}) => {
		calls.reset++;
		updatedCusEnts.push(cusEnt);
	},
}));
mock.module("@/cron/resetCron/clearCusEntsFromCache", () => ({
	clearCusEntsFromCache: async ({ cusEnts }: { cusEnts: ResetCusEnt[] }) => {
		calls.cleared = cusEnts;
	},
}));

import {
	RESET_BATCH_SIZE,
	runResetBatch,
} from "@/cron/resetCron/runResetBatch.js";

describe("reset batch", () => {
	test("processes a partial page instead of waiting for a full batch", async () => {
		const result = await runResetBatch({
			ctx: {
				db: {},
				logger: { info: () => undefined, error: () => undefined },
			} as unknown as CronContext,
		});

		expect(calls.fetchParams).toMatchObject({
			batchSize: RESET_BATCH_SIZE,
			limit: RESET_BATCH_SIZE,
		});
		expect(calls.reset).toBe(1);
		expect(calls.cleared).toEqual([cusEnt]);
		expect(result.fetched).toBe(1);
	});
});
