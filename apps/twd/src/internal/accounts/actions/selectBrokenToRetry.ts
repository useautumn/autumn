import type { AccountState } from "../../../db/schema/accounts.ts";

export type RetryCandidate = {
	id: string;
	state: AccountState;
	/** The key is stored and no full nuke or scoped re-init holds it. */
	keyAvailable: boolean;
};

/** Broken accounts to re-nuke; broken ones already queued or on a held key are skipped. */
export const selectBrokenToRetry = ({
	accounts,
	liveNukeAccountIds,
}: {
	accounts: RetryCandidate[];
	liveNukeAccountIds: Set<string>;
}): { retry: string[]; skipped: string[] } => {
	const broken = accounts.filter((account) => account.state === "broken");
	const isRetryable = (account: RetryCandidate) =>
		account.keyAvailable && !liveNukeAccountIds.has(account.id);
	return {
		retry: broken.filter(isRetryable).map((account) => account.id),
		skipped: broken
			.filter((account) => !isRetryable(account))
			.map((account) => account.id),
	};
};
