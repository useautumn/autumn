export interface SyncDirtyScope {
	orgId: string;
	env: string;
	customerId: string;
}

/**
 * Per-customer coalescing keys for balance-sync signals. All three MUST live
 * on the same Redis instance as the customer's balance hashes: the mark is
 * issued right after the deduction Lua, and claim uses RENAME (same-instance
 * only). NOTE: not cluster-slot-safe (no hash tags) — these instances are
 * dedicated/regional, not clustered; revisit if that ever changes.
 */
export const buildSyncDirtyKeys = ({
	orgId,
	env,
	customerId,
}: SyncDirtyScope): {
	dirtyKey: string;
	claimKey: string;
	signalKey: string;
} => {
	const scope = `${orgId}:${env}:${customerId}`;
	return {
		dirtyKey: `sync:dirty:${scope}`,
		claimKey: `sync:claim:${scope}`,
		signalKey: `sync:signal:${scope}`,
	};
};
