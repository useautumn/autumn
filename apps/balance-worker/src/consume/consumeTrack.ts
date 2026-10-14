import { type TrackCommand, trackOfNothing } from "@autumn/balance-engine";
import {
	buildIdempotencyStorageKey,
	type IdempotencyClaim,
	type IdempotencyClaimResult,
	type IdempotencyKeyStore,
	withIdempotencyKey,
} from "@autumn/dynamodb";
import { classifyQueuedFailure } from "./settleQueuedFailure.js";
import type { ConsumeContext } from "./types/consume.js";
import type { QueuedCommand } from "./types/queuedCommand.js";

/** The item owns its claim: its fan-out commands and redeliveries resume it, any other item is a duplicate. */
const claimOf = ({
	command,
}: {
	command: TrackCommand;
}): IdempotencyClaim | undefined => {
	if (!command.idempotency) return undefined;
	const { storageKey } = buildIdempotencyStorageKey({
		orgId: command.identity.orgId,
		env: command.identity.env,
		idempotencyKey: command.idempotency.key,
	});
	return {
		storageKey,
		ttlMs: command.idempotency.ttlMs,
		owner: command.requestId,
	};
};

/** A Kafka batch's claims in flight, by storage key; each track takes its own as it decides. */
export type TrackClaims = Map<
	string,
	{ owner?: string; outcome: Promise<IdempotencyClaimResult> }
>;

/** Sends every key's claim at once, so a batch waits one store round trip instead of one per track.
 *  A key the batch repeats is left to its turn, so the earlier item still wins it. */
export function claimTrackBatch({
	ctx,
	commands,
}: {
	ctx: Pick<ConsumeContext, "idempotencyKeys">;
	commands: TrackCommand[];
}): TrackClaims {
	const claims: TrackClaims = new Map();
	for (const command of commands) {
		const claim = claimOf({ command });
		if (!claim || claims.has(claim.storageKey)) continue;
		const outcome = ctx.idempotencyKeys.claim(claim);
		// A batch cut short never takes its later claims; their owner resumes them on redelivery.
		outcome.catch(() => undefined);
		claims.set(claim.storageKey, { owner: claim.owner, outcome });
	}
	return claims;
}

/** The store, answering this claim from the batch's when the batch sent it. */
const storeFor = ({
	ctx,
	claim,
	claims,
}: {
	ctx: ConsumeContext;
	claim: IdempotencyClaim | undefined;
	claims: TrackClaims | undefined;
}): IdempotencyKeyStore => {
	const sent = claim && claims?.get(claim.storageKey);
	if (!claim || !sent || sent.owner !== claim.owner) return ctx.idempotencyKeys;
	claims?.delete(claim.storageKey);
	return { ...ctx.idempotencyKeys, claim: () => sent.outcome };
};

const isRefusal = (cause: unknown): boolean =>
	classifyQueuedFailure({ cause }) === "refused";

/** An Atom's command that will never deduct still lands its seq, so the Atom can clear it from its journal. */
async function landAtomSeqOnly({
	ctx,
	command,
}: {
	ctx: ConsumeContext;
	command: TrackCommand;
}): Promise<QueuedCommand | null> {
	if (!command.source) return null;
	const decided = await ctx.processor.decideTrack({
		command: trackOfNothing({ command }),
	});
	return { decided };
}

/** A queued track: claim the item's key, then decide it in arrival order. Null when another item holds the key. */
export async function consumeTrack({
	ctx,
	command,
	claims,
}: {
	ctx: ConsumeContext;
	command: TrackCommand;
	claims?: TrackClaims;
}): Promise<QueuedCommand | null> {
	const claim = claimOf({ command });
	let decided: QueuedCommand["decided"] | null;
	try {
		decided = await withIdempotencyKey({
			store: storeFor({ ctx, claim, claims }),
			claim,
			run: () => ctx.processor.decideTrack({ command }),
			onDuplicate: () => null,
			releaseOnError: isRefusal,
		});
	} catch (cause) {
		if (!command.source || !isRefusal(cause)) throw cause;
		ctx.logger?.warn("Queued track refused; its Atom seq still lands", {
			commandId: command.commandId,
			customerId: command.identity.customerId,
			error: cause,
		});
		return landAtomSeqOnly({ ctx, command });
	}
	if (decided === null) {
		ctx.logger?.info("Queued track skipped: idempotency key already used", {
			commandId: command.commandId,
			requestId: command.requestId,
			customerId: command.identity.customerId,
			featureId: command.featureId,
		});
		return landAtomSeqOnly({ ctx, command });
	}
	/** A commit the store refused is consumed, never retried: free the key so the item can be sent again. */
	async function releaseClaim(): Promise<void> {
		if (claim) await ctx.idempotencyKeys.release(claim);
	}
	return { decided, onRefused: releaseClaim };
}
