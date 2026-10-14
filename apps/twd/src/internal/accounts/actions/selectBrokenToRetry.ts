import type { AccountState } from "../../../db/schema/accounts.ts";

export type RetryCandidate = {
	id: string;
	state: AccountState;
	keyAvailable: boolean;
};

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
