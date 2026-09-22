import type { TrackCommand } from "@autumn/balance-engine";
import {
	buildIdempotencyStorageKey,
	type IdempotencyClaim,
	withIdempotencyKey,
} from "@autumn/dynamodb";
import { settleTrackFailure } from "./trackSettlement.js";
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
	settleTrackFailure({ cause }) === "refused";

/** A queued track: nobody waits for its reply, so every outcome is logged and only a transient failure comes back. */
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
	try {
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
	} catch (cause) {
		const settlement = settleTrackFailure({ cause });
		if (settlement === "transient") throw cause;
		if (settlement === "applied")
			ctx.logger?.info("Queued track already applied", fields);
		else ctx.logger?.warn("Queued track refused", { ...fields, error: cause });
	}
}
