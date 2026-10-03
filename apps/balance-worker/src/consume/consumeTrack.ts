import type { TrackCommand } from "@autumn/balance-engine";
import {
	buildIdempotencyStorageKey,
	type IdempotencyClaim,
	withIdempotencyKey,
} from "@autumn/dynamodb";
import type { DecidedMutation } from "../processor/writer/types/mutation.js";
import { classifyQueuedFailure } from "./settleQueuedFailure.js";
import type { ConsumeContext } from "./types/consume.js";
import type { QueuedDecision } from "./types/queuedDecision.js";

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

/** A queued track: claim the item's key, then decide it in arrival order. Its commit settles with the consumed batch. */
export async function consumeTrack({
	ctx,
	command,
}: {
	ctx: ConsumeContext;
	command: TrackCommand;
}): Promise<QueuedDecision | undefined> {
	const fields = {
		commandId: command.commandId,
		requestId: command.requestId,
		customerId: command.identity.customerId,
		featureId: command.featureId,
	};
	const claim = claimOf({ command });
	const decided = await withIdempotencyKey({
		store: ctx.idempotencyKeys,
		claim,
		run: () => ctx.processor.decideTrack({ command }),
		onDuplicate: () => null,
		releaseOnError: isRefusal,
	});
	if (decided === null) {
		ctx.logger?.info(
			"Queued track skipped: idempotency key already used",
			fields,
		);
		return undefined;
	}

	return {
		waitForCommit: () => waitForTrackCommit({ ctx, decided, claim, fields }),
	};
}

/** Says when the balance rejected the deduction; a record the store refused frees the key, as a refused decide does. */
async function waitForTrackCommit({
	ctx,
	decided,
	claim,
	fields,
}: {
	ctx: ConsumeContext;
	decided: DecidedMutation<never>;
	claim: IdempotencyClaim | undefined;
	fields: Record<string, string>;
}): Promise<void> {
	try {
		const { result } = (await decided.waitForCommit()).mutation;
		if (result.type === "track" && result.status !== "applied")
			ctx.logger?.warn("Queued track rejected by the balance", {
				...fields,
				reason: result.reason,
			});
	} catch (cause) {
		if (claim && isRefusal(cause))
			await ctx.idempotencyKeys.release({
				storageKey: claim.storageKey,
				owner: claim.owner,
			});
		throw cause;
	}
}
