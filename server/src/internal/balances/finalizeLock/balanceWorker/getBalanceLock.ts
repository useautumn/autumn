import { parseWorkerLock, type WorkerLock } from "@autumn/balance-engine";
import { balanceLocks } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/**
 * A finalize names only its lock, so this one row is how the server finds the customer to route to.
 * Read on the primary: the lock's caller was answered after the commit, and a replica may not have it yet.
 */
export async function getBalanceLock({
	ctx,
	lockId,
}: {
	ctx: AutumnContext;
	lockId: string;
}): Promise<WorkerLock | null> {
	const [row] = await ctx.db
		.select()
		.from(balanceLocks)
		.where(
			and(
				eq(balanceLocks.org_id, ctx.org.id),
				eq(balanceLocks.env, ctx.env),
				eq(balanceLocks.lock_id, lockId),
			),
		)
		.limit(1);
	return row ? parseWorkerLock({ input: row }) : null;
}
