import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import { AppEnv } from "@autumn/shared";
import * as rolloutAccess from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";
import { syncItemV4 } from "@/internal/balances/utils/sync/syncItemV4.js";
import { _setRolloutConfigForTesting } from "@/internal/misc/rollouts/rolloutConfigStore.js";
import { ACTIVE_ROLLOUT_ID } from "@/internal/misc/rollouts/rolloutUtils.js";

let overrideSpy: ReturnType<typeof spyOn> | undefined;

describe("syncItemV4 for a customer on the worker", () => {
	beforeEach(() => {
		overrideSpy = spyOn(
			rolloutAccess,
			"getBalanceWorkerRolloutOverride",
		).mockImplementation(() => undefined);
		_setRolloutConfigForTesting({
			config: {
				rollouts: {
					[ACTIVE_ROLLOUT_ID]: {
						percent: 100,
						previousPercent: 100,
						changedAt: 0,
						orgs: {},
					},
				},
			},
		});
	});
	afterEach(() => {
		overrideSpy?.mockRestore();
		_setRolloutConfigForTesting({ config: { rollouts: {} } });
	});

	test("drops the sync before reading Redis or writing Postgres", async () => {
		const execute = mock(async () => []);
		const ctx = {
			org: { id: "org_1" },
			env: AppEnv.Sandbox,
			features: [],
			extraLogs: {},
			logger: { warn: mock(() => {}), info: mock(() => {}) },
			redisV2: { hmget: mock(async () => []) },
			db: { execute },
		};

		await syncItemV4({
			ctx: ctx as never,
			payload: {
				customerId: "cus_1",
				orgId: "org_1",
				env: AppEnv.Sandbox,
				timestamp: 1,
				modifiedCusEntIdsByFeatureId: { messages: ["cus_ent_1"] },
			},
		});

		expect(execute).not.toHaveBeenCalled();
		expect(ctx.redisV2.hmget).not.toHaveBeenCalled();
	});
});
