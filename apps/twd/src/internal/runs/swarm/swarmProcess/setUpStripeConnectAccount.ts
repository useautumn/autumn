export const setUpStripeConnectAccount = async ({
	waitForLease,
	isCancelled,
	ensureWebhook,
	createAccount,
	reportAccount,
}: {
	waitForLease: () => Promise<void>;
	isCancelled: () => boolean;
	ensureWebhook: () => Promise<unknown>;
	createAccount: () => Promise<string>;
	reportAccount: (accountId: string) => void;
}): Promise<string | null> => {
	await waitForLease();
	if (isCancelled()) return null;
	await ensureWebhook();
	if (isCancelled()) return null;
	const accountId = await createAccount();
	reportAccount(accountId);
	return isCancelled() ? null : accountId;
};
