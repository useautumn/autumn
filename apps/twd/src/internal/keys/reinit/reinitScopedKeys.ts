import { and, count, eq, inArray } from "drizzle-orm";
import pLimit from "p-limit";
import type { ReinitScope } from "../../../api/contract.ts";
import { stripeAccounts } from "../../../db/schema/accounts.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import type { JobHandlerArgs } from "../../jobs/types/jobHandler.ts";
import {
	deleteAllWebhooks,
	registerConnectWebhook,
} from "../actions/connectWebhooks.ts";
import { discoverPoolAccounts } from "../actions/discoverPoolAccounts.ts";
import { probeAndStoreKeys, syncKeys } from "../actions/syncKeys.ts";
import { topUpAccounts } from "../actions/topUpAccounts.ts";
import { peekKeySecret } from "../keySecrets.ts";
import {
	isFullNukeLockReason,
	lockKeyForFullNuke,
	REINIT_IN_PROGRESS,
	releaseFullNukeLock,
} from "../repos/fullNukeLockRepo.ts";

type KeyRow = typeof stripeKeys.$inferSelect;
const KEY_CONCURRENCY = 16;
const DRAIN_POLL_MS = 5_000;
export const DEFAULT_SCOPED_TARGET_PER_KEY = 2;

/** Which keys a scope touches; keys under another lock (full nuke) are never included. */
const selectTargetKeys = ({
	keys,
	scope,
	platformAccountIds,
}: {
	keys: KeyRow[];
	scope: Exclude<ReinitScope, "all">;
	platformAccountIds: string[];
}) => {
	const free = keys.filter(
		(key) => key.present && !isFullNukeLockReason(key.unusableReason),
	);
	if (scope === "missing_webhooks")
		return free.filter((key) => key.usable && !key.connectWebhookId);
	if (scope === "unhealthy")
		return free.filter((key) => !key.usable || !key.connectWebhookId);
	return free.filter((key) =>
		platformAccountIds.includes(key.platformAccountId),
	);
};

const inUseOn = async ({
	ctx,
	platformAccountIds,
}: {
	ctx: TwdContext;
	platformAccountIds: string[];
}) => {
	const [row] = await ctx.db
		.select({ n: count() })
		.from(stripeAccounts)
		.where(
			and(
				inArray(stripeAccounts.platformAccountId, platformAccountIds),
				eq(stripeAccounts.state, "in_use"),
			),
		);
	return row.n;
};

/**
 * No global gate: only the target keys are touched, so other runs keep going.
 * `selected` locks + drains its keys and replaces their webhooks; the other scopes only add what's missing.
 */
export const reinitScopedKeys = async ({
	ctx,
	job,
	checkpoint,
	signal,
}: JobHandlerArgs) => {
	const scope = job.payload.scope as Exclude<ReinitScope, "all">;
	const platformAccountIds =
		(job.payload.platformAccountIds as string[] | undefined) ?? [];
	const targetPerKey = Number(
		job.payload.targetPerKey ?? DEFAULT_SCOPED_TARGET_PER_KEY,
	);
	const replacesWebhooks = scope === "selected";

	await syncKeys({ ctx });
	const targets = selectTargetKeys({
		keys: await ctx.db.select().from(stripeKeys),
		scope,
		platformAccountIds,
	});
	const ids = targets.map((key) => key.platformAccountId);
	await checkpoint({ scope, keys: ids.length });
	if (ids.length === 0) return;

	if (replacesWebhooks) {
		for (const id of ids)
			await lockKeyForFullNuke({
				db: ctx.db,
				platformAccountId: id,
				reason: REINIT_IN_PROGRESS,
			});
	}
	try {
		if (replacesWebhooks) {
			while ((await inUseOn({ ctx, platformAccountIds: ids })) > 0) {
				if (signal.aborted) throw new Error("reinit_keys aborted");
				await checkpoint({ scope, keys: ids.length, phase: "drain" });
				await Bun.sleep(DRAIN_POLL_MS);
			}
		}
		const limit = pLimit(KEY_CONCURRENCY);
		await Promise.all(
			targets.map((key) =>
				limit(async () => {
					const secret = peekKeySecret({
						platformAccountId: key.platformAccountId,
					});
					if (!secret) return;
					if (replacesWebhooks) {
						await deleteAllWebhooks({
							ctx,
							platformAccountId: key.platformAccountId,
							secret,
						});
						key.connectWebhookId = null;
					}
					if (!key.connectWebhookId) {
						await registerConnectWebhook({
							ctx,
							platformAccountId: key.platformAccountId,
							secret,
						});
					}
				}),
			),
		);
		await checkpoint({ scope, keys: ids.length, phase: "accounts" });
		await discoverPoolAccounts({
			ctx,
			platformAccountIds: ids,
			includeLocked: true,
		});
		if (targetPerKey > 0) {
			await Promise.all(
				ids.map((platformAccountId) =>
					limit(() => topUpAccounts({ ctx, targetPerKey, platformAccountId })),
				),
			);
		}
		await probeAndStoreKeys({
			ctx,
			secrets: ids.flatMap(
				(id) => peekKeySecret({ platformAccountId: id }) ?? [],
			),
		});
	} finally {
		if (replacesWebhooks) {
			for (const id of ids)
				await releaseFullNukeLock({ db: ctx.db, platformAccountId: id });
		}
	}
};
