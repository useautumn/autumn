import { ms } from "@autumn/shared";
import type { CronContext } from "@/cron/utils/CronContext.js";
import { confirmExpiredLocks } from "./actions/confirmExpiredLocks.js";
import {
	type DueLockCursor,
	getDueConfirmLocks,
} from "./repos/balanceLocks.js";

const PAGE_SIZE = 500;
const BATCH_DEADLINE_MS = ms.seconds(30);

export type LockSweepBatchResult = { fetched: number; pageSize: number };

/** One pass over every due lock that confirms on expiry, a page at a time, until the pages run out or the deadline does. */
export async function runLockSweepBatch({
	ctx,
}: {
	ctx: CronContext;
}): Promise<LockSweepBatchResult> {
	const startedAt = Date.now();
	const deadline = startedAt + BATCH_DEADLINE_MS;
	let after: DueLockCursor | null = null;
	let fetched = 0;
	while (Date.now() < deadline) {
		const page = await getDueConfirmLocks({
			db: ctx.db,
			dueBefore: startedAt,
			after,
			limit: PAGE_SIZE,
		});
		fetched += page.length;
		await confirmExpiredLocks({ ctx, locks: page });
		const last = page[page.length - 1];
		if (!last || page.length < PAGE_SIZE) break;
		after = { expiresAt: last.expires_at, id: last.id };
	}
	return { fetched, pageSize: PAGE_SIZE };
}
