import type { TrackCommand } from "@autumn/balance-engine";
import {
	buildIdempotencyStorageKey,
	type IdempotencyClaim,
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

const isRefusal = (cause: unknown): boolean =>
	classifyQueuedFailure({ cause }) === "refused";

/** A queued track: claim the item's key, then decide it in arrival order. Null when another item holds the key. */
export async function consumeTrack({
	ctx,
	command,
}: {
	ctx: ConsumeContext;
	command: TrackCommand;
}): Promise<QueuedCommand | null> {
	const claim = claimOf({ command });
	const decided = await withIdempotencyKey({
		store: ctx.idempotencyKeys,
		claim,
		run: () => ctx.processor.decideTrack({ command }),
		onDuplicate: () => null,
		releaseOnError: isRefusal,
	});
	if (decided === null) {
		ctx.logger?.info("Queued track skipped: idempotency key already used", {
			commandId: command.commandId,
			requestId: command.requestId,
			customerId: command.identity.customerId,
			featureId: command.featureId,
		});
		return null;
	}
	/** A commit the store refused is consumed, never retried: free the key so the item can be sent again. */
	async function releaseClaim(): Promise<void> {
		if (claim) await ctx.idempotencyKeys.release(claim);
	}
	return { decided, onRefused: releaseClaim };
}
