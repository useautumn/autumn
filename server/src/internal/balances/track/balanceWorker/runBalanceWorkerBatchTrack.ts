import type { TrackCommand } from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { type BatchTrackParams, RouteGroup } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackBodyIdempotencyKey } from "@/internal/balances/idempotency/trackBodyIdempotencyKey.js";
import { resolveIdempotencyTtlMs } from "@/internal/misc/idempotency/resolveIdempotencyTtl.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { validateBalanceWorkerRequest } from "../../balanceWorker/validateBalanceWorkerRequest.js";
import { trackParamsToTrackCommands } from "./balanceWorkerTrackRequest.js";

type QueueClient = Pick<BalanceWorkerClient, "queue">;

/**
 * One item's commands. The item's request id seeds their command ids, so identical items never collide,
 * and its body key rides along for the consumer to claim: the API claims nothing for a batch.
 */
const batchItemToCommands = ({
	ctx,
	item,
	index,
	ttlMs,
}: {
	ctx: AutumnContext;
	item: BatchTrackParams[number];
	index: number;
	ttlMs: number;
}): TrackCommand[] => {
	validateBalanceWorkerRequest({ ctx, body: item });
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
	body,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	body: BatchTrackParams;
	client?: QueueClient;
}): Promise<void> {
	const ttlMs = resolveIdempotencyTtlMs({
		ctx,
		routeGroup: RouteGroup.Balances,
	});
	const commands = body.flatMap((item, index) =>
		batchItemToCommands({ ctx, item, index, ttlMs }),
	);
	try {
		await client.queue.track({ commands });
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
}
