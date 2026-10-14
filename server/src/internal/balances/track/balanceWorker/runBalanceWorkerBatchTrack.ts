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

const batchEntryToCommands = ({
	ctx,
	entry: { item, index, tokens },
	ttlMs,
}: {
	ctx: AutumnContext;
	entry: BatchTrackEntry;
	ttlMs: number;
}): TrackCommand[] => {
	const itemCtx = { ...ctx, id: `${ctx.id}-${index}` };
	const key = getTrackBodyIdempotencyKey({ body: item });
	return trackParamsToTrackCommands({
		ctx: itemCtx,
		body: item,
		recordsCreditCost: tokens !== undefined,
	}).map((command) => ({
		...command,
		...(key && { idempotency: { key, ttlMs } }),
	}));
};

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
