import {
	STRIPE_REQUEST_OPTIONS,
	withStripeRequestSlot,
} from "@tw/helpers/stripeRequestBudget.ts";
import type { TwdLogger } from "../../../lib/logger.ts";
import { isAccountGone, withRateLimitRetry } from "../../keys/stripeErrors.ts";

type ListedAccount = { id: string; metadata?: Record<string, string> | null };

type AccountsApi = {
	accounts: {
		list(
			params: { limit: number; starting_after?: string },
			options?: object,
		): PromiseLike<{ data: ListedAccount[]; has_more: boolean }>;
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
	let startingAfter: string | undefined;
	for (;;) {
		const page = await withRateLimitRetry(() =>
			withStripeRequestSlot(async () =>
				stripe.accounts.list(
					{ limit: 100, starting_after: startingAfter },
					STRIPE_REQUEST_OPTIONS,
				),
			),
		);
		for (const account of page.data) {
			if (
				account.metadata?.autumn_tw_shard === "stripe-connect" &&
				account.metadata.autumn_tw_run === runId
			)
				ids.add(account.id);
		}
		if (!page.has_more || page.data.length === 0) return [...ids];
		startingAfter = page.data[page.data.length - 1].id;
	}
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
