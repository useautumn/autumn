import type { TwdContext } from "../../../lib/types/twdContext.ts";

/**
 * Frozen cross-task API for the account ledger. OWNED BY THE KEYS TASK.
 * Claims are atomic (FOR UPDATE SKIP LOCKED), spread round-robin across usable keys.
 */
export type ClaimedAccount = {
	accountId: string;
	platformAccountId: string;
	/** Secret for this account's platform key, resolved from TW_V3_KEYS. */
	secretKey: string;
};

/** clean → in_use (or reserved → in_use when reservationId is given). */
export const claimAccountsForRun = async (_args: {
	ctx: TwdContext;
	runId: string;
	count: number;
	reservationId?: string;
}): Promise<ClaimedAccount[]> => {
	throw new Error("claimAccountsForRun: not implemented");
};

/** in_use → nuking; enqueues one nuke:<acct> job per account. Idempotent. */
export const releaseRunAccounts = async (_args: {
	ctx: TwdContext;
	runId: string;
}): Promise<void> => {
	throw new Error("releaseRunAccounts: not implemented");
};
