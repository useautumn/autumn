import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { evictWorkerCopyAfterRollback } from "@/internal/customers/cache/fullSubject/actions/setCachedFullSubject/evictWorkerCopyAfterRollback.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "@/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig.js";
import { _setRolloutConfigForTesting } from "@/internal/misc/rollouts/rolloutConfigStore.js";
import {
	ACTIVE_ROLLOUT_ID,
	ROLLOUT_SETTLE_MS,
} from "@/internal/misc/rollouts/rolloutUtils.js";

const ORG_ID = "org_evict_after_rollback";
const RETENTION_MS = FULL_SUBJECT_CACHE_TTL_SECONDS * 1000;
const ctx = {
	org: { id: ORG_ID, is_sandbox: false, created_by: null },
	env: "live",
	logger: { warn: () => undefined },
} as unknown as AutumnContext;

/** The org's percent now, plus the rollbacks (each from 100 to 0) that landed `landedMsAgo` ago. */
const setOrgRollout = ({
	percent,
	rollbacksLandedMsAgo = [],
}: {
	percent: number;
	rollbacksLandedMsAgo?: number[];
}) => {
	const now = Date.now();
	_setRolloutConfigForTesting({
		config: {
			rollouts: {
				[ACTIVE_ROLLOUT_ID]: {
					orgs: {
						[ORG_ID]: {
							percent,
							previousPercent: percent,
							changedAt: 0,
							decreases: rollbacksLandedMsAgo.map((landedMsAgo) => ({
								from: 100,
								to: 0,
								at: now - landedMsAgo - ROLLOUT_SETTLE_MS,
							})),
						},
					},
				},
			},
		},
	});
};

const countEvicts = ({
	customerId,
	calls,
}: {
	customerId: string;
	calls: number;
}): number => {
	let evicts = 0;
	for (let call = 0; call < calls; call++) {
		evictWorkerCopyAfterRollback({
			ctx,
			customerId,
			evict: async () => {
				evicts += 1;
			},
		});
	}
	return evicts;
};

describe("evictWorkerCopyAfterRollback", () => {
	const previousOverride = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	beforeAll(() => {
		process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "config";
	});
	afterAll(() => {
		if (previousOverride === undefined)
			delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
		else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousOverride;
		_setRolloutConfigForTesting({ config: { rollouts: {} } });
	});

	test("each view write after a rollback evicts", () => {
		setOrgRollout({ percent: 0, rollbacksLandedMsAgo: [60_000] });
		expect(countEvicts({ customerId: "cus_came_back", calls: 3 })).toBe(3);
	});

	test("a customer that never left the worker path is never evicted", () => {
		setOrgRollout({ percent: 0 });
		expect(countEvicts({ customerId: "cus_never_left", calls: 100 })).toBe(0);
	});

	test("a customer routed to the worker again is never evicted", () => {
		setOrgRollout({ percent: 100, rollbacksLandedMsAgo: [60_000] });
		expect(countEvicts({ customerId: "cus_routed", calls: 100 })).toBe(0);
	});

	test("a rollback older than the view TTL is ignored", () => {
		setOrgRollout({
			percent: 0,
			rollbacksLandedMsAgo: [RETENTION_MS + 60_000],
		});
		expect(countEvicts({ customerId: "cus_old", calls: 100 })).toBe(0);
	});

	test("a rollback that has not settled yet is ignored", () => {
		setOrgRollout({ percent: 0, rollbacksLandedMsAgo: [-1_000] });
		expect(countEvicts({ customerId: "cus_unsettled", calls: 100 })).toBe(0);
	});

	test("a failing evict never throws into the caller", async () => {
		setOrgRollout({ percent: 0, rollbacksLandedMsAgo: [60_000] });
		expect(() =>
			evictWorkerCopyAfterRollback({
				ctx,
				customerId: "cus_failing",
				evict: async () => {
					throw new Error("worker unreachable");
				},
			}),
		).not.toThrow();
		await Bun.sleep(1);
	});
});
