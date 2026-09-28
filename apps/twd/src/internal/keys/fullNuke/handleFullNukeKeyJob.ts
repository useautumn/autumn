import {
	STRIPE_REQUEST_OPTIONS,
	withStripeRequestSlot,
} from "@tw/helpers/stripeRequestBudget.ts";
import { and, eq, notInArray } from "drizzle-orm";
import pLimit from "p-limit";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import {
	countHeldAccountsOnKey,
	HELD_ACCOUNT_STATES,
} from "../../accounts/repos/accountCountsRepo.ts";
import { PermanentJobError } from "../../jobs/errors/permanentJobError.ts";
import type { JobHandler } from "../../jobs/types/jobHandler.ts";
import {
	deleteAllWebhooks,
	registerConnectWebhook,
} from "../actions/connectWebhooks.ts";
import { DEFAULT_FULL_NUKE_TARGET_PER_KEY } from "../actions/enqueueFullNukeKey.ts";
import { resolveKeySecret } from "../actions/resolveKeySecret.ts";
import { syncKeys } from "../actions/syncKeys.ts";
import { topUpAccounts } from "../actions/topUpAccounts.ts";
import {
	lockKeyForFullNuke,
	releaseFullNukeLock,
} from "../repos/fullNukeLockRepo.ts";
import {
	describeStripeError,
	isAccountGone,
	withRateLimitRetry,
} from "../stripeErrors.ts";
import { stripeForKey } from "../stripeForKey.ts";

const PHASES = [
	"lock",
	"delete_accounts",
	"delete_webhooks",
	"clear_ledger",
	"register_webhook",
	"top_up",
	"probe",
] as const;
type Phase = (typeof PHASES)[number];

const PAGE_SIZE = 100;
/** Per-key Stripe write budget: deletes are heavy and share the key's rate limit with nothing else now. */
const DELETE_CONCURRENCY = 4;

/** Every connected account on the key, tagged or not. Listed fully before deleting so paging is stable. */
const deleteAllConnectedAccounts = async ({
	ctx,
	platformAccountId,
	secret,
	signal,
}: {
	ctx: TwdContext;
	platformAccountId: string;
	secret: string;
	signal: AbortSignal;
}): Promise<{ deleted: number; gone: number }> => {
	const stripe = stripeForKey({ secret });
	const ids: string[] = [];
	let startingAfter: string | undefined;
	for (;;) {
		const listing = await withRateLimitRetry(() =>
			withStripeRequestSlot(() =>
				stripe.accounts.list(
					{ limit: PAGE_SIZE, starting_after: startingAfter },
					STRIPE_REQUEST_OPTIONS,
				),
			),
		);
		ids.push(...listing.data.map((account) => account.id));
		const last = listing.data.at(-1);
		if (!listing.has_more || !last) break;
		startingAfter = last.id;
	}
	ctx.logger.info("twd full nuke: deleting connected accounts", {
		platformAccountId,
		total: ids.length,
	});

	const limit = pLimit(DELETE_CONCURRENCY);
	let deleted = 0;
	let gone = 0;
	const failures: { accountId: string; error: string }[] = [];
	await Promise.all(
		ids.map((accountId) =>
			limit(async () => {
				if (signal.aborted) return;
				try {
					await withRateLimitRetry(() =>
						withStripeRequestSlot(() =>
							stripe.accounts.del(accountId, undefined, STRIPE_REQUEST_OPTIONS),
						),
					);
					deleted++;
				} catch (error) {
					if (isAccountGone(error)) {
						gone++;
						return;
					}
					failures.push({ accountId, error: describeStripeError(error) });
				}
			}),
		),
	);
	if (signal.aborted) throw new Error("full nuke aborted");
	if (failures.length > 0) {
		throw new Error(
			`${failures.length}/${ids.length} account deletes failed (first: ${failures[0].accountId}: ${failures[0].error})`,
		);
	}
	return { deleted, gone };
};

/**
 * payload: { platformAccountId, targetPerKey? }. Locks the key, deletes every connected account +
 * webhook on it, drops its ledger rows, re-registers the Connect webhook, tops up, re-probes, unlocks.
 */
export const handleFullNukeKeyJob: JobHandler = async ({
	ctx,
	job,
	checkpoint,
	signal,
}) => {
	const platformAccountId = String(job.payload.platformAccountId);
	const targetPerKey =
		typeof job.payload.targetPerKey === "number"
			? job.payload.targetPerKey
			: DEFAULT_FULL_NUKE_TARGET_PER_KEY;
	const resumeAt = PHASES.indexOf(job.state.phase as Phase);
	let phase: Phase = resumeAt >= 0 ? PHASES[resumeAt] : "lock";
	const enter = async (next: Phase) => {
		phase = next;
		await checkpoint({ phase });
		ctx.logger.info("twd full_nuke_key phase", {
			jobId: job.id,
			platformAccountId,
			phase,
		});
	};
	const reached = (target: Phase) =>
		PHASES.indexOf(phase) <= PHASES.indexOf(target);

	try {
		await lockKeyForFullNuke({ db: ctx.db, platformAccountId });
		if (reached("lock")) {
			await enter("lock");
			const held = await countHeldAccountsOnKey({
				db: ctx.db,
				platformAccountId,
			});
			if (held > 0) {
				await releaseFullNukeLock({ db: ctx.db, platformAccountId });
				throw new PermanentJobError(
					`key_busy: ${held} accounts on ${platformAccountId} are in use by runs; nothing was deleted. Wait for those runs to finish, then retry.`,
				);
			}
		}
		const secret = await resolveKeySecret({ ctx, platformAccountId });

		if (reached("delete_accounts")) {
			await enter("delete_accounts");
			const result = await deleteAllConnectedAccounts({
				ctx,
				platformAccountId,
				secret,
				signal,
			});
			ctx.logger.info("twd full nuke: connected accounts deleted", {
				platformAccountId,
				...result,
			});
		}

		if (reached("delete_webhooks")) {
			await enter("delete_webhooks");
			const deleted = await deleteAllWebhooks({
				ctx,
				platformAccountId,
				secret,
			});
			ctx.logger.info("twd full nuke: webhooks deleted", {
				platformAccountId,
				deleted,
			});
		}

		if (reached("clear_ledger")) {
			await enter("clear_ledger");
			const removed = await ctx.db
				.delete(stripeAccounts)
				.where(
					and(
						eq(stripeAccounts.platformAccountId, platformAccountId),
						notInArray(stripeAccounts.state, [...HELD_ACCOUNT_STATES]),
					),
				)
				.returning({ id: stripeAccounts.id });
			ctx.logger.info("twd full nuke: ledger rows removed", {
				platformAccountId,
				removed: removed.length,
			});
		}

		if (reached("register_webhook")) {
			await enter("register_webhook");
			const [key] = await ctx.db
				.select({ connectWebhookId: stripeKeys.connectWebhookId })
				.from(stripeKeys)
				.where(eq(stripeKeys.platformAccountId, platformAccountId));
			if (!key?.connectWebhookId) {
				await registerConnectWebhook({ ctx, platformAccountId, secret });
			}
		}

		if (reached("top_up")) {
			await enter("top_up");
			await topUpAccounts({ ctx, targetPerKey, platformAccountId });
		}

		await enter("probe");
		await syncKeys({ ctx });
		await releaseFullNukeLock({ db: ctx.db, platformAccountId });
	} catch (error) {
		if (!(error instanceof PermanentJobError)) {
			await lockKeyForFullNuke({
				db: ctx.db,
				platformAccountId,
				reason:
					`full nuke failed during ${phase}: ${describeStripeError(error)}`.slice(
						0,
						500,
					),
			});
		}
		throw error;
	}
};
