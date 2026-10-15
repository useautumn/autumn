import { ms } from "@autumn/shared";
import type { CronContext } from "@/cron/utils/CronContext.js";
import { confirmExpiredLocks } from "./actions/confirmExpiredLocks.js";
import { releaseExpiredLocks } from "./actions/releaseExpiredLocks.js";
import {
	type DueBalanceLock,
	type DueLockCursor,
	getDueLocks,
	type LockExpiryAction,
} from "./repos/balanceLocks.js";

const PAGE_SIZE = 500;
const BATCH_DEADLINE_MS = ms.seconds(30);
/** A release lock's EventBridge timer fires at expires_at; past this, the sweep assumes it never will. */
export const RELEASE_TIMER_GRACE_MS = ms.minutes(5);

export type LockSweepBatchResult = { fetched: number; pageSize: number };

type SweepPass = {
	expiryAction: LockExpiryAction;
	dueBefore: number;
	settle: (params: {
		ctx: CronContext;
		locks: DueBalanceLock[];
	}) => Promise<void>;
};

/** Confirm locks are the sweep's own; release locks are its backstop once their timer is overdue. */
export const lockSweepPassesAt = ({ now }: { now: number }): SweepPass[] => [
	{ expiryAction: "confirm", dueBefore: now, settle: confirmExpiredLocks },
	{
		expiryAction: "release",
		dueBefore: now - RELEASE_TIMER_GRACE_MS,
		settle: releaseExpiredLocks,
	},
];

/** One pass over every due lock, a page at a time, until the pages run out or the shared deadline does. */
export async function runLockSweepBatch({
	ctx,
}: {
	ctx: CronContext;
}): Promise<LockSweepBatchResult> {
	const startedAt = Date.now();
	const deadline = startedAt + BATCH_DEADLINE_MS;
	let fetched = 0;
	for (const pass of lockSweepPassesAt({ now: startedAt })) {
		let after: DueLockCursor | null = null;
		while (Date.now() < deadline) {
			const page = await getDueLocks({
				db: ctx.db,
				expiryAction: pass.expiryAction,
				dueBefore: pass.dueBefore,
				after,
				limit: PAGE_SIZE,
			});
			fetched += page.length;
			await pass.settle({ ctx, locks: page });
			const last = page[page.length - 1];
			if (!last || page.length < PAGE_SIZE) break;
			after = { expiresAt: last.expires_at, id: last.id };
		}
	}
	return { fetched, pageSize: PAGE_SIZE };
}
