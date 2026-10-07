import type { TrackCommand } from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { RouteGroup, type TrackParams } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackBodyIdempotencyKey } from "@/internal/balances/idempotency/trackBodyIdempotencyKey.js";
import { withIdempotencyKey } from "@/internal/misc/idempotency/withIdempotencyKey.js";
import {
	balanceWorkerFailOpenReasonOf,
	describeBalanceWorkerFailure,
	rethrowBalanceWorkerError,
} from "../../balanceWorker/balanceWorkerErrors.js";
import { queueTrack } from "../utils/queueTrack.js";
import { trackParamsToTrackCommands } from "./balanceWorkerTrackRequest.js";

type QueueClient = Pick<BalanceWorkerClient, "queue">;

type QueueOnSqs = (params: {
	ctx: AutumnContext;
	body: TrackParams;
	options?: { logFallback?: boolean };
}) => Promise<object | null>;

async function appendTrackCommands({
	client,
	commands,
}: {
	client: QueueClient;
	commands: TrackCommand[];
}): Promise<void> {
	try {
		await client.queue.track({ commands });
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
}

async function queueUnconfirmedTrackOnSqs({
	ctx,
	body,
	error,
	queueOnSqs,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	error: unknown;
	queueOnSqs: QueueOnSqs;
}): Promise<void> {
	const reason = balanceWorkerFailOpenReasonOf(error);
	if (!reason) throw error;
	const queued = await queueOnSqs({
		ctx,
		body,
		options: { logFallback: false },
	});
	if (!queued) throw error;
	ctx.logger.warn(`[balanceWorker] ${reason}; async track queued on SQS`, {
		type: "balance_worker_fail_open",
		fail_open_reason: reason,
		fail_open_source: "asyncTrack",
		worker_failure: describeBalanceWorkerFailure({ error }),
		error,
	});
}

/** The async contract on the worker path: the key is claimed and kept, the commands are queued, nobody waits. */
export async function runBalanceWorkerAsyncTrack({
	ctx,
	body,
	client = getBalanceWorkerClient(),
	queueOnSqs = queueTrack,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	client?: QueueClient;
	queueOnSqs?: QueueOnSqs;
}): Promise<void> {
	const commands = trackParamsToTrackCommands({ ctx, body });
	// A 503 releases the claim so the client can retry; it only happens when SQS is down too.
	await withIdempotencyKey({
		ctx,
		idempotencyKey: getTrackBodyIdempotencyKey({ body }),
		routeGroup: RouteGroup.Balances,
		run: async () => {
			try {
				await appendTrackCommands({ client, commands });
			} catch (error) {
				await queueUnconfirmedTrackOnSqs({ ctx, body, error, queueOnSqs });
			}
		},
	});
}
