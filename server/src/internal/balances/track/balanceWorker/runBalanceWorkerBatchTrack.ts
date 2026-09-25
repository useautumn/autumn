import type { TrackCommand } from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { RouteGroup } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackBodyIdempotencyKey } from "@/internal/balances/idempotency/trackBodyIdempotencyKey.js";
import { resolveIdempotencyTtlMs } from "@/internal/misc/idempotency/resolveIdempotencyTtl.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import type { BatchTrackEntry } from "../batchTrackEntries.js";
import { trackParamsToTrackCommands } from "./balanceWorkerTrackRequest.js";

type QueueClient = Pick<BalanceWorkerClient, "queue">;

/**
 * One item's commands. The item's request id seeds their command ids, so identical items never collide,
 * and its body key rides along for the consumer to claim: the API claims nothing for a batch.
 */
const batchEntryToCommands = ({
	ctx,
	entry: { item, index },
	ttlMs,
}: {
	ctx: AutumnContext;
	entry: BatchTrackEntry;
	ttlMs: number;
}): TrackCommand[] => {
	const itemCtx = { ...ctx, id: `${ctx.id}-${index}` };
	const key = getTrackBodyIdempotencyKey({ body: item });
	return trackParamsToTrackCommands({ ctx: itemCtx, body: item }).map(
		(command) => ({
			...command,
			...(key && { idempotency: { key, ttlMs } }),
		}),
	);
};

/** Every item is checked before any is queued, so a malformed item fails the whole batch as it does today. */
export async function runBalanceWorkerBatchTrack({
	ctx,
	entries,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	entries: BatchTrackEntry[];
	client?: QueueClient;
}): Promise<void> {
	const ttlMs = resolveIdempotencyTtlMs({
		ctx,
		routeGroup: RouteGroup.Balances,
	});
	const commands = entries.flatMap((entry) =>
		batchEntryToCommands({ ctx, entry, ttlMs }),
	);
	try {
		await client.queue.track({ commands });
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
}
