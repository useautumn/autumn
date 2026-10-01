import type { TwdLogger } from "../../../lib/logger.ts";

type AccountsApi = { accounts: { del(id: string): Promise<unknown> } };

/** Deletes a run's dedicated sub-accounts; returns the ids that could not be deleted. */
export const deleteStripeConnectAccounts = async ({
	accountIds,
	stripe,
	logger,
}: {
	accountIds: string[];
	stripe: AccountsApi;
	logger: TwdLogger;
}): Promise<string[]> => {
	const failed: string[] = [];
	for (const accountId of accountIds) {
		try {
			await stripe.accounts.del(accountId);
		} catch (error) {
			if ((error as { code?: string }).code === "resource_missing") continue;
			failed.push(accountId);
			logger.warn("stripe-connect sub-account delete failed", {
				accountId,
				error: String(error),
			});
		}
	}
	return failed;
};
