import {
	type BalanceWorkerClient,
	BalanceWorkerClientError,
} from "@autumn/balance-worker-client";
import {
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
import { withPaidAllocatedFallback } from "@/internal/balanceWorker/subject/withPaidAllocatedFallback.js";
import { withIdempotencyKey } from "@/internal/misc/idempotency/withIdempotencyKey.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { fireThresholdsReached } from "../../trackWebhooks/thresholdReached/fireThresholdsReached.js";
import { getTrackFeatureDeductions } from "../utils/getFeatureDeductions.js";
import { getQueuedTrackResponse } from "../utils/getQueuedTrackResponse.js";
import { runPostgresTrackV3 } from "../v3/runPostgresTrackV3.js";
import {
	type FeatureTrackOutcome,
	trackOutcomesToApiResponse,
} from "./balanceWorkerTrackReply.js";
import {
	trackedFeatureIdsOf,
	trackParamsToTrackCommand,
} from "./balanceWorkerTrackRequest.js";
import { runBalanceWorkerAsyncTrack } from "./runBalanceWorkerAsyncTrack.js";

type TrackClient = Pick<BalanceWorkerClient, "track">;

type FeatureTrackScope = {
	ctx: AutumnContext;
	body: TrackParams;
	client: TrackClient;
	featureId: string;
	/** Only a fan-out's first feature records the request's one usage event. */
	recordsUsageEvent: boolean;
};

const isDuplicateCommand = (error: unknown): boolean =>
	error instanceof BalanceWorkerClientError &&
	error.workerCode === "DUPLICATE_COMMAND";

/** One feature on exactly one engine: the worker, or Postgres when the worker refuses a v1 paid allocated grant. */
const trackFeature = ({
	ctx,
	body,
	client,
	featureId,
	recordsUsageEvent,
}: FeatureTrackScope): Promise<FeatureTrackOutcome> =>
	withPaidAllocatedFallback<FeatureTrackOutcome>({
		ctx,
		customerId: body.customer_id,
		entityId: body.entity_id,
		worker: async () => {
			const reply = await client.track({
				command: trackParamsToTrackCommand({
					ctx,
					body: { ...body, feature_id: featureId },
					isFanOut: !body.feature_id,
					recordsUsageEvent,
				}),
			});
			return { engine: "worker", featureId, reply };
		},
		// The lane legacy defers to as well: it locks the customer, deducts and invoices.
		postgres: async ({ fullSubject }) => {
			const response = await runPostgresTrackV3({
				ctx,
				fullSubject,
				body: {
					...body,
					feature_id: featureId,
					skip_event: body.skip_event || !recordsUsageEvent,
				},
				featureDeductions: getTrackFeatureDeductions({
					ctx,
					featureId,
					lock: body.lock,
					value: body.value,
				}),
			});
			return {
				engine: "postgres",
				featureId,
				response,
				customer: fullSubject.customer,
			};
		},
	});

/**
 * One track per feature, in order; a feature the customer lacks applies as a no-op, as on legacy.
 * On a fan-out, features already applied under this idempotency key are skipped so a retry finishes
 * a partial run. Every other error is the API's.
 */
const trackEachFeature = async ({
	ctx,
	body,
	client,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	client: TrackClient;
}): Promise<FeatureTrackOutcome[]> => {
	const isFanOut = !body.feature_id;
	const outcomes: FeatureTrackOutcome[] = [];
	const skipped: unknown[] = [];
	const featureIds = trackedFeatureIdsOf({ ctx, body });
	for (const [index, featureId] of featureIds.entries()) {
		try {
			outcomes.push(
				await trackFeature({
					ctx,
					body,
					client,
					featureId,
					recordsUsageEvent: index === 0,
				}),
			);
		} catch (error) {
			if (!isFanOut || !isDuplicateCommand(error))
				rethrowBalanceWorkerError({ cause: error });
			skipped.push(error);
		}
	}
	if (outcomes.length === 0) rethrowBalanceWorkerError({ cause: skipped[0] });
	return outcomes;
};

/** The customer row the first outcome was decided against, for `customer_data` to apply to. */
const customerOf = ({
	outcomes,
}: {
	outcomes: FeatureTrackOutcome[];
}): RunWithCustomer<never>["customer"] => {
	const [first] = outcomes;
	if (!first) return null;
	return first.engine === "worker"
		? first.reply.state.customer
		: first.customer;
};

/** Behind the response: the deprecated webhook must never delay or fail the track that crossed it. */
const fireReplyThresholdsReached = ({
	ctx,
	body,
	outcomes,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	outcomes: FeatureTrackOutcome[];
}): void => {
	const replies = outcomes.flatMap((outcome) =>
		outcome.engine === "worker" ? [outcome.reply] : [],
	);
	fireThresholdsReached({ ctx, body, replies }).catch((error) => {
		ctx.logger.error(`[runBalanceWorkerTrack] fireThresholdsReached: ${error}`);
	});
};

/** Applied on the worker and answered, or queued for it and answered with the queued response when async. */
export async function runBalanceWorkerTrack({
	ctx,
	body,
	isAsync = false,
	validateTrackBodyIdempotencyKey = true,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	body: TrackParams;
	isAsync?: boolean;
	/** False when the caller already claimed the body key (a queued replay). */
	validateTrackBodyIdempotencyKey?: boolean;
	client?: TrackClient;
}): Promise<TrackResponseV3> {
	if (isAsync) {
		await runBalanceWorkerAsyncTrack({ ctx, body });
		return getQueuedTrackResponse({ ctx, body });
	}

	// The same 24h claim as runTrackWithRollout: a duplicate key is 409 before the worker sees it,
	// and a 503 releases it so the retry reaches the worker's own dedup.
	return withIdempotencyKey({
		ctx,
		idempotencyKey: validateTrackBodyIdempotencyKey
			? getTrackBodyIdempotencyKey({ body })
			: null,
		routeGroup: RouteGroup.Balances,
		// Around the whole fan-out, inside the claim: a retry after creating re-runs every feature under the same key.
		run: () =>
			withCreateIfMissing({
				ctx,
				createEnabled: apiVersionCreatesCustomer({ ctx }),
				customerId: body.customer_id,
				customerData: body.customer_data,
				entityId: body.entity_id,
				entityData: body.entity_data,
				run: async () => {
					const outcomes = await trackEachFeature({ ctx, body, client });
					fireReplyThresholdsReached({ ctx, body, outcomes });
					return {
						result: trackOutcomesToApiResponse({ ctx, body, outcomes }),
						customer: customerOf({ outcomes }),
					};
				},
			}),
	});
}
