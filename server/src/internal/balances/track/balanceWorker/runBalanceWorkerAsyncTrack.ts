import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { RouteGroup, type TrackParams } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackBodyIdempotencyKey } from "@/internal/balances/idempotency/trackBodyIdempotencyKey.js";
import type { TokenDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import { withIdempotencyKey } from "@/internal/misc/idempotency/withIdempotencyKey.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { trackParamsToTrackCommands } from "./balanceWorkerTrackRequest.js";
import { appendOrSpoolTrack } from "./spool/appendOrSpoolTrack.js";
import { isTrackSpoolEnabled } from "./spool/trackSpoolConfig.js";

type QueueClient = Pick<BalanceWorkerClient, "queue">;

/** The async contract on the worker path: the key is claimed and kept, the commands are queued, nobody waits. */
export async function runBalanceWorkerAsyncTrack({
	ctx,
	body,
	tokens,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	body: TrackParams;
	/** A track_tokens cost: the event records `credit_cost`, and a spooled replay prices it the same way. */
	tokens?: TokenDeduction;
	client?: QueueClient;
}): Promise<void> {
	const commands = trackParamsToTrackCommands({
		ctx,
		body,
		recordsCreditCost: tokens !== undefined,
	});
	const append = () => client.queue.track({ commands });
	// A failed append is a 503, which releases the claim so the client can retry; a spooled one keeps it.
	await withIdempotencyKey({
		ctx,
		idempotencyKey: getTrackBodyIdempotencyKey({ body }),
		routeGroup: RouteGroup.Balances,
		run: async () => {
			if (isTrackSpoolEnabled()) {
				await appendOrSpoolTrack({ ctx, body, tokens, append });
				return;
			}
			try {
				await append();
			} catch (cause) {
				rethrowBalanceWorkerError({ cause });
			}
		},
	});
}
