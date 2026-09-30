import { and, count, eq, inArray } from "drizzle-orm";
import type { Capacity } from "../../../api/contract.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import { runs, warmImages } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getRunDemand } from "../../accounts/allocator/accountAllocator.ts";
import { ACCOUNTS_PER_KEY_CAP } from "../../accounts/allocator/poolLimits.ts";
import {
	countAccountsByKey,
	countHeldAccountsByRun,
	emptyAccountCounts,
} from "../../accounts/repos/accountCountsRepo.ts";
import { getKeyGate } from "../../keys/repos/keyGateRepo.ts";
import {
	LIVE_RUN_STATUSES,
	queuePositionSql,
} from "../../runs/repos/runsRepo.ts";

export const getCapacity = async ({
	ctx,
}: {
	ctx: TwdContext;
}): Promise<Capacity> => {
	const [gate, keys, byKey, heldByRun, liveRuns, [warmBuilds]] =
		await Promise.all([
			getKeyGate({ db: ctx.db }),
			ctx.db
				.select({ platformAccountId: stripeKeys.platformAccountId })
				.from(stripeKeys)
				.where(and(eq(stripeKeys.usable, true), eq(stripeKeys.present, true))),
			countAccountsByKey({ db: ctx.db }),
			countHeldAccountsByRun({ db: ctx.db }),
			ctx.db
				.select({
					id: runs.id,
					workersWanted: runs.workersWanted,
					queuePosition: queuePositionSql,
				})
				.from(runs)
				.where(inArray(runs.status, LIVE_RUN_STATUSES)),
			ctx.db
				.select({ n: count() })
				.from(warmImages)
				.where(eq(warmImages.status, "building")),
		]);
	const accounts = emptyAccountCounts();
	for (const counts of byKey.values()) {
		for (const field of Object.keys(accounts) as (keyof typeof accounts)[]) {
			accounts[field] += counts[field];
		}
	}
	// A run already taking accounts wants only what its swarm can still use (the allocator's view).
	const accountsWanted = liveRuns.reduce((sum, run) => {
		const unmet = Math.max(
			0,
			(run.workersWanted ?? 0) - (heldByRun.get(run.id) ?? 0),
		);
		return sum + Math.min(unmet, getRunDemand({ runId: run.id }) ?? unmet);
	}, 0);
	const queuedRuns = liveRuns.filter((run) => run.queuePosition !== null);
	const freeNow = keys.reduce((sum, key) => {
		const counts = byKey.get(key.platformAccountId);
		if (!counts) return sum;
		return (
			sum +
			Math.max(0, Math.min(counts.clean, ACCOUNTS_PER_KEY_CAP - counts.inUse))
		);
	}, 0);
	return {
		gate: gate.state,
		usableKeys: keys.length,
		accounts,
		liveRuns: liveRuns.length,
		queuedRuns: queuedRuns.length,
		accountsWanted,
		poolCap: keys.length * ACCOUNTS_PER_KEY_CAP,
		maxFilesNow:
			gate.state === "draining" || queuedRuns.length > 0 || accountsWanted > 0
				? 0
				: freeNow,
		warmBuilds: warmBuilds.n,
	};
};
