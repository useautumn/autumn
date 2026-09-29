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
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { invalidateSharedBalanceFields } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateSharedBalanceFields.js";
import { _setRolloutConfigForTesting } from "@/internal/misc/rollouts/rolloutConfigStore.js";
import { ACTIVE_ROLLOUT_ID } from "@/internal/misc/rollouts/rolloutUtils.js";

const ORG_ID = "org_flush";
const CUSTOMER_ID = "cus_flush";
const manifest = JSON.stringify({
	internalCustomerId: "cus_internal",
	customerEntitlementIdsByFeatureId: { messages: ["cus_ent_1"] },
	usageWindowFeatureIds: [],
});

/** Just enough Redis to tell a GETDEL flush from a blind HDEL. */
const createFakeRedis = () => {
	const hdel = mock(() => undefined);
	const exec = mock(async () => []);
	const getDel = mock(async () => null);
	const redis = {
		status: "ready",
		get: mock(async () => manifest),
		pipeline: () => ({ hdel, exec }),
		getDelFullSubjectBalanceFields: getDel,
	};
	return { redis, hdel, getDel };
};

const setPercent = (percent: number) =>
	_setRolloutConfigForTesting({
		config: {
			rollouts: {
				[ACTIVE_ROLLOUT_ID]: {
					percent,
					previousPercent: percent,
					changedAt: 0,
					orgs: {},
				},
			},
		},
	});

let overrideSpy: ReturnType<typeof spyOn> | undefined;

describe("invalidateSharedBalanceFields on a routed customer", () => {
	beforeEach(() => {
		overrideSpy = spyOn(
			rolloutAccess,
			"getBalanceWorkerRolloutOverride",
		).mockImplementation(() => undefined);
	});
	afterEach(() => {
		overrideSpy?.mockRestore();
		_setRolloutConfigForTesting({ config: { rollouts: {} } });
	});

	const run = async ({ redis }: { redis: unknown }) =>
		invalidateSharedBalanceFields({
			ctx: {
				org: { id: ORG_ID },
				env: AppEnv.Sandbox,
				logger: { info: mock(() => {}), warn: mock(() => {}) },
			} as unknown as AutumnContext,
			customerId: CUSTOMER_ID,
			redisV2: redis as never,
			flushBalances: true,
		});

	test("drops the fields without flushing them to Postgres", async () => {
		setPercent(100);
		const { redis, hdel, getDel } = createFakeRedis();
		await run({ redis });
		expect(getDel).not.toHaveBeenCalled();
		expect(hdel).toHaveBeenCalledTimes(1);
	});

	test("a legacy customer still flushes", async () => {
		setPercent(0);
		const { redis, hdel, getDel } = createFakeRedis();
		await run({ redis });
		expect(getDel).toHaveBeenCalledTimes(1);
		expect(hdel).not.toHaveBeenCalled();
	});
});
