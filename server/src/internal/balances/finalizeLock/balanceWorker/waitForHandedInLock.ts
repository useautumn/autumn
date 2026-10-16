import type { WorkerLock } from "@autumn/balance-engine";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getBalanceLock } from "./getBalanceLock.js";

/** How long an API finalize waits for an Atom's hand-in of its lock to reach Postgres before the lock counts as unknown. */
export const LOCK_HAND_IN_WAIT_MS = 2_000;
const FIRST_POLL_MS = 25;
const LAST_POLL_MS = 250;

/**
 * The lock's row once the Atom's hand-in has landed it, or null once the wait runs out. An Atom answers a lock before
 * Autumn holds it, so a short hold can reach the API first; the row lands only after the lock is committed to the log.
 */
export async function waitForHandedInLock({
	ctx,
	lockId,
	customerId,
}: {
	ctx: AutumnContext;
	lockId: string;
	customerId: string;
}): Promise<WorkerLock | null> {
	const deadline = Date.now() + LOCK_HAND_IN_WAIT_MS;
	let pollMs = FIRST_POLL_MS;
	while (Date.now() < deadline) {
		await Bun.sleep(Math.min(pollMs, deadline - Date.now()));
		const lock = await getBalanceLock({ ctx, lockId, customerId });
		if (lock) return lock;
		pollMs = Math.min(pollMs * 2, LAST_POLL_MS);
	}
	return null;
}
