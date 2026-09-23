import {
	type BalanceWorkerClient,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import {
	RecaseError,
	RouteGroup,
	type TrackParams,
	type TrackResponseV3,
} from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackBodyIdempotencyKey } from "@/internal/balances/idempotency/trackBodyIdempotencyKey.js";
import {
	apiVersionCreatesCustomer,
	type RunWithCustomer,
	withCreateIfMissing,
} from "@/internal/balanceWorker/subject/withCreateIfMissing.js";
import { withIdempotencyKey } from "@/internal/misc/idempotency/withIdempotencyKey.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { validateBalanceWorkerRequest } from "../../balanceWorker/validateBalanceWorkerRequest.js";
import {
	type FeatureTrackReply,
	trackRepliesToApiResponse,
} from "./balanceWorkerTrackReply.js";
import {
	trackedFeatureIdsOf,
	trackParamsToTrackCommand,
} from "./balanceWorkerTrackRequest.js";

type TrackClient = Pick<BalanceWorkerClient, "track">;

const isDuplicateCommand = ({ cause }: { cause: unknown }): boolean =>
	cause instanceof BalanceWorkerClientError &&
	cause.workerCode === "DUPLICATE_COMMAND";

/** An event can map to features this customer does not hold; the legacy path deducts nothing for those. */
const isFeatureNotHeld = ({ cause }: { cause: unknown }): boolean =>
	cause instanceof BalanceWorkerClientError &&
	cause.workerCode === "UNSUPPORTED_COMMAND" &&
	cause.workerReason === "feature_not_found";

/**
 * One worker track per feature, in order. Features the customer lacks, or already applied under this
 * idempotency key, are skipped so a retry finishes a partial run; with nothing applied the skip reason is thrown.
 */
const trackEachFeature = async ({
	ctx,
	body,
	client,
	featureIds,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	client: TrackClient;
	featureIds: string[];
}): Promise<FeatureTrackReply[]> => {
	const isFanOut = !body.feature_id;
	const replies: FeatureTrackReply[] = [];
	let skipped: unknown;
	for (const featureId of featureIds) {
		try {
			const reply = await client.track({
				command: trackParamsToTrackCommand({
					ctx,
					body: { ...body, feature_id: featureId },
					isFanOut,
				}),
			});
			replies.push({ featureId, reply });
		} catch (cause) {
			const isSkippable =
				isDuplicateCommand({ cause }) || isFeatureNotHeld({ cause });
			if (!isFanOut || !isSkippable) throw cause;
			// A duplicate outranks a feature the customer lacks: it is what the caller must hear about.
			if (!skipped || isDuplicateCommand({ cause })) skipped = cause;
		}
	}
	if (replies.length === 0) throw skipped;
	return replies;
};

const trackOnWorker = async ({
	ctx,
	body,
	client,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	client: TrackClient;
}): Promise<RunWithCustomer<TrackResponseV3>> => {
	const featureIds = trackedFeatureIdsOf({ ctx, body });
	try {
		const replies = await trackEachFeature({ ctx, body, client, featureIds });
		return {
			result: trackRepliesToApiResponse({ ctx, body, replies }),
			customer: replies[0]?.reply.state.customer ?? null,
		};
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
};

export async function runBalanceWorkerTrack({
	ctx,
	body,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	body: TrackParams;
	client?: TrackClient;
}): Promise<TrackResponseV3> {
	validateBalanceWorkerRequest({ ctx, body });
	// The same 24h claim as runTrackWithRollout: a duplicate key is 409 before the worker sees it,
	// and a 503 releases it so the retry reaches the worker's own dedup.
	return withIdempotencyKey({
		ctx,
		idempotencyKey: getTrackBodyIdempotencyKey({ body }),
		routeGroup: RouteGroup.Balances,
		// Around the whole fan-out, inside the claim: a retry after creating re-runs every feature under the same key.
		run: () =>
			withCreateIfMissing({
				ctx,
				createEnabled: apiVersionCreatesCustomer({ ctx }),
				customerId: body.customer_id,
				customerData: body.customer_data,
				run: () => trackOnWorker({ ctx, body, client }),
			}),
	});
}
