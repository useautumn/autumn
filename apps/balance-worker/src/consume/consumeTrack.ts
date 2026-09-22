import type { TrackCommand } from "@autumn/balance-engine";
import {
	buildIdempotencyStorageKey,
	type IdempotencyClaim,
	withIdempotencyKey,
} from "@autumn/dynamodb";
import { classifyQueuedFailure } from "./settleQueuedFailure.js";
import type { ConsumeContext } from "./types/consume.js";

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

/** A queued track: claim the item's key, run it, describe the verdict. Failures go to the stream's boundary. */
export async function consumeTrack({
	ctx,
	command,
}: {
	ctx: ConsumeContext;
	command: TrackCommand;
}): Promise<void> {
	const fields = {
		commandId: command.commandId,
		requestId: command.requestId,
		customerId: command.identity.customerId,
		featureId: command.featureId,
	};
	const reply = await withIdempotencyKey({
		store: ctx.idempotencyKeys,
		claim: claimOf({ command }),
		run: () => ctx.processor.track({ command }),
		onDuplicate: () => null,
		releaseOnError: isRefusal,
	});
	if (reply === null)
		ctx.logger?.info(
			"Queued track skipped: idempotency key already used",
			fields,
		);
	else if (reply.result.status !== "applied")
		ctx.logger?.warn("Queued track rejected by the balance", {
			...fields,
			reason: reply.result.reason,
		});
}
