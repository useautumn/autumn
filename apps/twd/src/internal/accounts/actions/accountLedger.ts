import {
	STRIPE_REQUEST_OPTIONS,
	withStripeRequestSlot,
} from "@tw/helpers/stripeRequestBudget.ts";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import pLimit from "p-limit";
import { reservations, stripeAccounts } from "../../../db/schema/accounts.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import { TwdError } from "../../../http/apiError.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { clearIngressRoutesForAccounts } from "../../ingress/actions/clearIngressRoutesForAccounts.ts";
import { resolveKeySecret } from "../../keys/actions/resolveKeySecret.ts";
import { getKeyGate } from "../../keys/repos/keyGateRepo.ts";
import { describeStripeError, isAccountGone } from "../../keys/stripeErrors.ts";
import { stripeForKey } from "../../keys/stripeForKey.ts";
import { lockCleanAccounts, usableKey } from "../repos/cleanAccountsRepo.ts";
import { enqueueNukeJobs } from "./enqueueNukeJobs.ts";

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

/** Per-claim retrieve fan-out; each request also takes a shared Stripe budget slot. */
const VERIFY_CONCURRENCY = 16;

const insufficient = ({
	need,
	have,
	pool,
}: {
	need: number;
	have: number;
	pool: number;
}) =>
	new TwdError({
		status: 409,
		code: "insufficient_accounts",
		message: `Need ${need} clean Stripe accounts on usable keys, only ${have} free right now.`,
		next: "Reduce the selection or wait for nukes to finish; GET /capacity shows maxFilesNow.",
		escalate:
			pool < need
				? `The whole pool is ${pool} accounts — ask a twd admin to add Stripe accounts/keys (POST /keys/reinit with targetPerKey).`
				: undefined,
		details: { need, have, pool },
	});

type ClaimedRow = { accountId: string; platformAccountId: string };

/** One atomic claim of `need` accounts; `have` = already verified this call (for error counts). */
const claimRound = async ({
	ctx,
	runId,
	need,
	have,
	reservationId,
}: {
	ctx: TwdContext;
	runId: string;
	need: number;
	have: number;
	reservationId?: string;
}): Promise<ClaimedRow[]> =>
	ctx.db.transaction(async (tx) => {
		const heldBy = ctx.actor?.userId ?? "system";
		const now = new Date();
		const take = async (ids: string[]) =>
			ids.length === 0
				? []
				: tx
						.update(stripeAccounts)
						.set({ state: "in_use", runId, heldBy, stateChangedAt: now })
						.where(inArray(stripeAccounts.id, ids))
						.returning({
							accountId: stripeAccounts.id,
							platformAccountId: stripeAccounts.platformAccountId,
						});

		if (reservationId) {
			const [reservation] = await tx
				.select()
				.from(reservations)
				.where(eq(reservations.id, reservationId));
			if (
				!reservation ||
				reservation.releasedAt ||
				reservation.expiresAt < now
			) {
				throw new TwdError({
					status: 404,
					code: "reservation_not_active",
					message: `Reservation ${reservationId} does not exist, was released, or expired.`,
					next: "Drop reservationId, or POST /reservations for a new one.",
				});
			}
			if (ctx.actor && reservation.userId !== ctx.actor.userId) {
				throw new TwdError({
					status: 403,
					code: "forbidden",
					message: `Reservation ${reservationId} belongs to another user.`,
					next: "Use your own reservation or drop reservationId.",
					escalate: `Ask the reservation owner (user ${reservation.userId}) to run it or release it.`,
				});
			}
			const rows = await tx
				.select({ id: stripeAccounts.id })
				.from(stripeAccounts)
				.innerJoin(
					stripeKeys,
					eq(stripeKeys.platformAccountId, stripeAccounts.platformAccountId),
				)
				.where(
					and(
						eq(stripeAccounts.reservationId, reservationId),
						eq(stripeAccounts.state, "reserved"),
						usableKey,
					),
				)
				.limit(need)
				.for("update", { of: stripeAccounts, skipLocked: true });
			if (rows.length < need) {
				throw new TwdError({
					status: 409,
					code: "insufficient_accounts",
					message: `Reservation ${reservationId} has ${rows.length} free accounts on usable keys; the run needs ${need}.`,
					next: "Reduce the selection, wait for the reservation's accounts to finish nuking, or run without reservationId.",
					details: { need, have: rows.length },
				});
			}
			return take(rows.map((row) => row.id));
		}

		const ids = await lockCleanAccounts({ tx, need });
		if (ids.length < need) {
			const [pool] = await tx
				.select({ n: count() })
				.from(stripeAccounts)
				.innerJoin(
					stripeKeys,
					eq(stripeKeys.platformAccountId, stripeAccounts.platformAccountId),
				)
				.where(and(ne(stripeAccounts.state, "broken"), usableKey));
			throw insufficient({
				need: need + have,
				have: ids.length + have,
				pool: pool.n,
			});
		}
		return take(ids);
	});

/** false only when Stripe says the account is gone; other errors keep it (the run surfaces them). */
const accountExists = async ({
	ctx,
	account,
}: {
	ctx: TwdContext;
	account: ClaimedAccount;
}): Promise<boolean> => {
	try {
		const retrieved = await withStripeRequestSlot(() =>
			stripeForKey({ secret: account.secretKey }).accounts.retrieve(
				account.accountId,
				undefined,
				STRIPE_REQUEST_OPTIONS,
			),
		);
		return !(retrieved as { deleted?: unknown }).deleted;
	} catch (error) {
		if (isAccountGone(error)) return false;
		ctx.logger.warn("twd claim verify failed; keeping account", {
			accountId: account.accountId,
			error: describeStripeError(error),
		});
		return true;
	}
};

/**
 * clean → in_use (or reserved → in_use when reservationId is given). Every claimed account is
 * retrieved from Stripe; vanished ones leave the ledger and are replaced from the clean pool.
 */
export const claimAccountsForRun = async ({
	ctx,
	runId,
	count: need,
	reservationId,
}: {
	ctx: TwdContext;
	runId: string;
	count: number;
	reservationId?: string;
}): Promise<ClaimedAccount[]> => {
	const gate = await getKeyGate({ db: ctx.db });
	if (gate.state === "draining") {
		throw new TwdError({
			status: 503,
			code: "keys_draining",
			message: `Stripe keys are being re-initialised${gate.reason ? `: ${gate.reason}` : ""}.`,
			next: "Wait for the reinit_keys job to finish (GET /keys shows the gate), then retry.",
			escalate: gate.reason?.startsWith("reinit failed")
				? "Key re-init failed — ask a twd admin to fix it and rerun POST /keys/reinit."
				: undefined,
			details: { jobId: gate.jobId },
		});
	}

	const secrets = new Map<string, Promise<string>>();
	const secretFor = (platformAccountId: string) => {
		let secret = secrets.get(platformAccountId);
		if (!secret) {
			secret = resolveKeySecret({ ctx, platformAccountId });
			secrets.set(platformAccountId, secret);
		}
		return secret;
	};
	const verifyLimit = pLimit(VERIFY_CONCURRENCY);
	const verified: ClaimedAccount[] = [];
	const claimedIds: string[] = [];
	const reservedIds = new Set<string>();
	try {
		for (let round = 0; verified.length < need; round++) {
			const fromReservation = round === 0 ? reservationId : undefined;
			const rows = await claimRound({
				ctx,
				runId,
				need: need - verified.length,
				have: verified.length,
				reservationId: fromReservation,
			});
			for (const row of rows) {
				claimedIds.push(row.accountId);
				if (fromReservation) reservedIds.add(row.accountId);
			}
			const checked = await Promise.all(
				rows.map((row) =>
					verifyLimit(async () => {
						const account = {
							...row,
							secretKey: await secretFor(row.platformAccountId),
						};
						return { account, exists: await accountExists({ ctx, account }) };
					}),
				),
			);
			const gone = checked.filter(({ exists }) => !exists);
			if (gone.length > 0) {
				await ctx.db.delete(stripeAccounts).where(
					inArray(
						stripeAccounts.id,
						gone.map(({ account }) => account.accountId),
					),
				);
				for (const { account } of gone) {
					ctx.logger.warn(
						"twd claim: account gone from Stripe, removed from ledger",
						{
							runId,
							accountId: account.accountId,
							platformAccountId: account.platformAccountId,
						},
					);
				}
			}
			verified.push(
				...checked.filter(({ exists }) => exists).map(({ account }) => account),
			);
		}
	} catch (error) {
		await unclaim({ ctx, runId, accountIds: claimedIds, reservedIds });
		throw error;
	}
	return verified;
};

/** Puts a failed claim's accounts back where they came from. */
const unclaim = async ({
	ctx,
	runId,
	accountIds,
	reservedIds,
}: {
	ctx: TwdContext;
	runId: string;
	accountIds: string[];
	reservedIds: Set<string>;
}): Promise<void> => {
	if (accountIds.length === 0) return;
	const now = new Date();
	const held = and(
		eq(stripeAccounts.runId, runId),
		eq(stripeAccounts.state, "in_use"),
	);
	const reserved = [...reservedIds];
	const clean = accountIds.filter((id) => !reservedIds.has(id));
	if (reserved.length > 0) {
		await ctx.db
			.update(stripeAccounts)
			.set({ state: "reserved", runId: null, stateChangedAt: now })
			.where(and(held, inArray(stripeAccounts.id, reserved)));
	}
	if (clean.length > 0) {
		await ctx.db
			.update(stripeAccounts)
			.set({ state: "clean", runId: null, heldBy: null, stateChangedAt: now })
			.where(and(held, inArray(stripeAccounts.id, clean)));
	}
};

/** in_use → nuking; enqueues one nuke:<acct> job per account. Idempotent. */
export const releaseRunAccounts = async ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}): Promise<void> => {
	await ctx.db
		.update(stripeAccounts)
		.set({ state: "nuking", stateChangedAt: new Date() })
		.where(
			and(eq(stripeAccounts.runId, runId), eq(stripeAccounts.state, "in_use")),
		);
	const nuking = await ctx.db
		.select({ id: stripeAccounts.id })
		.from(stripeAccounts)
		.where(
			and(eq(stripeAccounts.runId, runId), eq(stripeAccounts.state, "nuking")),
		);
	const accountIds = nuking.map((row) => row.id);
	clearIngressRoutesForAccounts({ accountIds });
	await enqueueNukeJobs({ ctx, accountIds });
};
