/**
 * TDD unit contract for the sync dirty-state primitives (sync-v4 coalescing).
 *
 * Contract under test:
 *   New modules (server/src/internal/balances/utils/sync/dirtyState/):
 *     - syncDirtyKeys.ts: buildSyncDirtyKeys({orgId, env, customerId})
 *         -> { dirtyKey, claimKey, signalKey }
 *     - markSyncDirty.ts: markSyncDirty({redis, scope, cusEntIds, rolloverIds,
 *         modifiedCusEntIdsByFeatureId, usageWindowUpdates, entityId,
 *         signalTtlSeconds})
 *         -> { shouldSignal: boolean }
 *         Behaviors:
 *           - first mark on empty state -> shouldSignal=true, signal marker set
 *           - second mark while signal marker live -> shouldSignal=false
 *           - selectors accumulate (set union) across marks
 *           - usage-window snapshots are last-write-wins per feature
 *     - claimSyncDirty.ts: claimSyncDirty({redis, scope})
 *         -> merged dirty state or null when empty
 *         Behaviors:
 *           - moves dirty -> claim atomically; dirty key gone after claim
 *           - leftover claim (crashed worker) is MERGED with new dirty state
 *             on the next claim, never lost
 *           - clearSyncClaim({redis, scope, generation}) removes the owned claim
 *   Modified:
 *     - processMessage.shouldRetrySqsJobError: transient REDIS errors on the
 *       new signal job are retryable (message must stay in SQS)
 *
 * Pre-impl red: imports fail (modules do not exist).
 * Post-impl green: all assertions pass against a real Redis (v2 cache instance).
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import {
	claimSyncDirty,
	clearSyncClaim,
} from "@/internal/balances/utils/sync/dirtyState/claimSyncDirty.js";
import { markSyncDirty } from "@/internal/balances/utils/sync/dirtyState/markSyncDirty.js";
import { buildSyncDirtyKeys } from "@/internal/balances/utils/sync/dirtyState/syncDirtyKeys.js";
import { JobName } from "@/queue/JobName.js";
import { shouldRetrySqsJobError } from "@/queue/processMessage.js";

const scope = {
	orgId: "org_dirtystate_unit",
	env: "sandbox",
	customerId: "unit-dirty-cus",
};

const wipe = async () => {
	const redis = resolveRedisV2();
	const { dirtyKey, claimKey, signalKey } = buildSyncDirtyKeys(scope);
	await redis.del(dirtyKey, claimKey, signalKey);
	return redis;
};

test(`${chalk.yellowBright("dirty-state: mark signals only on empty->dirty transition")}`, async () => {
	const redis = await wipe();

	const first = await markSyncDirty({
		redis,
		scope,
		cusEntIds: ["ce_1"],
		rolloverIds: [],
		modifiedCusEntIdsByFeatureId: { messages: ["ce_1"] },
		usageWindowUpdates: [],
		signalTtlSeconds: 60,
	});
	expect(first.shouldSignal).toBe(true);

	const second = await markSyncDirty({
		redis,
		scope,
		cusEntIds: ["ce_2"],
		rolloverIds: ["ro_1"],
		modifiedCusEntIdsByFeatureId: { messages: ["ce_2"] },
		usageWindowUpdates: [],
		signalTtlSeconds: 60,
	});
	expect(second.shouldSignal).toBe(false);
});

test(`${chalk.yellowBright("dirty-state: claim merges accumulated selectors and empties dirty")}`, async () => {
	const redis = await wipe();

	await markSyncDirty({
		redis,
		scope,
		cusEntIds: ["ce_1"],
		rolloverIds: [],
		modifiedCusEntIdsByFeatureId: { messages: ["ce_1"] },
		usageWindowUpdates: [
			{
				ts: 1,
				update: {
					internal_customer_id: "ic_1",
					feature_id: "messages",
					usage_windows: [{ usage: 1 }],
				} as any,
			},
		],
		signalTtlSeconds: 60,
	});
	await markSyncDirty({
		redis,
		scope,
		cusEntIds: ["ce_2", "ce_1"],
		rolloverIds: ["ro_1"],
		modifiedCusEntIdsByFeatureId: { credits: ["ce_2"] },
		usageWindowUpdates: [
			{
				ts: 2,
				update: {
					internal_customer_id: "ic_1",
					feature_id: "messages",
					usage_windows: [{ usage: 2 }],
				} as any,
			},
		],
		signalTtlSeconds: 60,
	});

	const claimed = await claimSyncDirty({ redis, scope });
	expect(claimed).not.toBeNull();
	// Set-union of selectors across both marks
	expect(claimed!.cusEntIds.sort()).toEqual(["ce_1", "ce_2"]);
	expect(claimed!.rolloverIds).toEqual(["ro_1"]);
	expect(Object.keys(claimed!.modifiedCusEntIdsByFeatureId).sort()).toEqual([
		"credits",
		"messages",
	]);
	// Usage windows: LAST snapshot wins per feature
	expect(claimed!.usageWindowUpdates).toHaveLength(1);
	expect(
		(claimed!.usageWindowUpdates[0] as any).usage_windows[0].usage,
	).toBe(2);

	// Dirty key is empty after claim
	const { dirtyKey } = buildSyncDirtyKeys(scope);
	expect(await redis.exists(dirtyKey)).toBe(0);

	await clearSyncClaim({ redis, scope, generation: claimed!.generation });
});

test(`${chalk.yellowBright("dirty-state: leftover claim from crashed worker merges into next claim")}`, async () => {
	const redis = await wipe();

	// First cycle: mark + claim, then CRASH (claim never cleared).
	await markSyncDirty({
		redis,
		scope,
		cusEntIds: ["ce_old"],
		rolloverIds: [],
		modifiedCusEntIdsByFeatureId: { messages: ["ce_old"] },
		usageWindowUpdates: [],
		signalTtlSeconds: 60,
	});
	const firstClaim = await claimSyncDirty({ redis, scope });
	expect(firstClaim).not.toBeNull();
	// no clearSyncClaim: simulates a worker death mid-flush

	// New write arrives, then redelivery claims again.
	await markSyncDirty({
		redis,
		scope,
		cusEntIds: ["ce_new"],
		rolloverIds: [],
		modifiedCusEntIdsByFeatureId: { messages: ["ce_new"] },
		usageWindowUpdates: [],
		signalTtlSeconds: 60,
	});
	const secondClaim = await claimSyncDirty({ redis, scope });
	expect(secondClaim).not.toBeNull();
	// ce_old must survive the crash: merged, not lost
	expect(secondClaim!.cusEntIds.sort()).toEqual(["ce_new", "ce_old"]);

	await clearSyncClaim({ redis, scope, generation: secondClaim!.generation });
});

test(`${chalk.yellowBright("dirty-state: older usage-window snapshot does not overwrite newer")}`, async () => {
	const redis = await wipe();

	await markSyncDirty({
		redis,
		scope,
		cusEntIds: [],
		rolloverIds: [],
		modifiedCusEntIdsByFeatureId: {},
		usageWindowUpdates: [
			{
				ts: 2,
				update: {
					internal_customer_id: "ic_1",
					feature_id: "messages",
					usage_windows: [{ usage: 2 }],
				} as any,
			},
		],
		signalTtlSeconds: 60,
	});
	await markSyncDirty({
		redis,
		scope,
		cusEntIds: [],
		rolloverIds: [],
		modifiedCusEntIdsByFeatureId: {},
		usageWindowUpdates: [
			{
				ts: 1,
				update: {
					internal_customer_id: "ic_1",
					feature_id: "messages",
					usage_windows: [{ usage: 1 }],
				} as any,
			},
		],
		signalTtlSeconds: 60,
	});

	const claimed = await claimSyncDirty({ redis, scope });
	expect(
		(claimed!.usageWindowUpdates[0] as any).usage_windows[0].usage,
	).toBe(2);
	await clearSyncClaim({ redis, scope, generation: claimed!.generation });
});

test(`${chalk.yellowBright("dirty-state: stale generation cannot clear a newer claim")}`, async () => {
	const redis = await wipe();

	await markSyncDirty({
		redis,
		scope,
		cusEntIds: ["ce_1"],
		rolloverIds: [],
		modifiedCusEntIdsByFeatureId: {},
		usageWindowUpdates: [],
		signalTtlSeconds: 60,
	});
	const firstClaim = await claimSyncDirty({ redis, scope });
	const secondClaim = await claimSyncDirty({ redis, scope });

	await clearSyncClaim({
		redis,
		scope,
		generation: firstClaim!.generation,
	});
	const { claimKey } = buildSyncDirtyKeys(scope);
	expect(await redis.exists(claimKey)).toBe(1);
	await clearSyncClaim({
		redis,
		scope,
		generation: secondClaim!.generation,
	});
});

test(`${chalk.yellowBright("dirty-state: colon-containing feature id roundtrips")}`, async () => {
	const redis = await wipe();

	await markSyncDirty({
		redis,
		scope,
		cusEntIds: [],
		rolloverIds: [],
		modifiedCusEntIdsByFeatureId: { "messages:email": ["ce:1"] },
		usageWindowUpdates: [
			{
				ts: 1,
				update: {
					internal_customer_id: "ic_1",
					feature_id: "messages:email",
					usage_windows: [{ usage: 1 }],
				} as any,
			},
		],
		signalTtlSeconds: 60,
	});

	const claimed = await claimSyncDirty({ redis, scope });
	expect(claimed!.modifiedCusEntIdsByFeatureId).toEqual({
		"messages:email": ["ce:1"],
	});
	expect(claimed!.usageWindowUpdates[0].feature_id).toBe("messages:email");
	await clearSyncClaim({ redis, scope, generation: claimed!.generation });
});

test(`${chalk.yellowBright("dirty-state: claim on fully empty state returns null")}`, async () => {
	const redis = await wipe();
	const claimed = await claimSyncDirty({ redis, scope });
	expect(claimed).toBeNull();
});

test(`${chalk.yellowBright("dirty-state: transient redis errors on signal job are retryable")}`, () => {
	const redisError = Object.assign(new Error("Connection is closed."), {
		name: "ConnectionError",
	});
	expect(
		shouldRetrySqsJobError({
			jobName: JobName.SyncCustomerDirty,
			error: redisError,
		}),
	).toBe(true);
});
