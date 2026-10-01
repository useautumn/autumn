import {
	STRIPE_REQUEST_OPTIONS,
	withStripeRequestSlot,
} from "@tw/helpers/stripeRequestBudget.ts";
import type { TwdLogger } from "../../../lib/logger.ts";
import { isAccountGone, withRateLimitRetry } from "../../keys/stripeErrors.ts";

type AccountsApi = {
	accounts: {
		list(params: { limit: number }): AsyncIterable<{
			id: string;
			metadata?: Record<string, string> | null;
		}>;
		del(id: string, params?: undefined, options?: object): Promise<unknown>;
	};
};

/** Every shard sub-account this run created, reported or not (a create can outlive the child's teardown). */
const runShardAccountIds = async ({
	stripe,
	runId,
	accountIds,
}: {
	stripe: AccountsApi;
	runId: string;
	accountIds: string[];
}) => {
	const ids = new Set(accountIds);
	for await (const account of stripe.accounts.list({ limit: 100 })) {
		if (
			account.metadata?.autumn_tw_shard === "stripe-connect" &&
			account.metadata.autumn_tw_run === runId
		)
			ids.add(account.id);
	}
	return [...ids];
};

/** Deletes a run's dedicated sub-accounts; returns the ids still alive after retries. */
export const deleteStripeConnectAccounts = async ({
	runId,
	accountIds,
	stripe,
	logger,
}: {
	runId: string;
	accountIds: string[];
	stripe: AccountsApi;
	logger: TwdLogger;
}): Promise<string[]> => {
	const failed: string[] = [];
	const ids = await runShardAccountIds({ stripe, runId, accountIds }).catch(
		(error: unknown) => {
			logger.warn("stripe-connect sub-account listing failed", {
				runId,
				error: String(error),
			});
			return accountIds;
		},
	);
	for (const accountId of ids) {
		try {
			await withRateLimitRetry(() =>
				withStripeRequestSlot(() =>
					stripe.accounts.del(accountId, undefined, STRIPE_REQUEST_OPTIONS),
				),
			);
		} catch (error) {
			if (isAccountGone(error)) continue;
			failed.push(accountId);
			logger.error("stripe-connect sub-account delete failed", {
				runId,
				accountId,
				error: String(error),
			});
		}
	}
	return failed;
};
