import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { RouteGroup, type TrackParams } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackBodyIdempotencyKey } from "@/internal/balances/idempotency/trackBodyIdempotencyKey.js";
import { withIdempotencyKey } from "@/internal/misc/idempotency/withIdempotencyKey.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { validateBalanceWorkerRequest } from "../../balanceWorker/validateBalanceWorkerRequest.js";
import { trackParamsToTrackCommands } from "./balanceWorkerTrackRequest.js";

type QueueClient = Pick<BalanceWorkerClient, "queue">;

/** The async contract on the worker path: the key is claimed and kept, the commands are queued, nobody waits. */
export async function runBalanceWorkerAsyncTrack({
	ctx,
	body,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	body: TrackParams;
	client?: QueueClient;
}): Promise<void> {
	validateBalanceWorkerRequest({ ctx, body });
	const commands = trackParamsToTrackCommands({ ctx, body });
	// A failed append is a 503, which releases the claim so the client can retry.
	await withIdempotencyKey({
		ctx,
		idempotencyKey: getTrackBodyIdempotencyKey({ body }),
		routeGroup: RouteGroup.Balances,
		run: async () => {
			try {
				await client.queue.track({ commands });
			} catch (cause) {
				rethrowBalanceWorkerError({ cause });
			}
		},
	});
}
