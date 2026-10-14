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
	recordsUsageEvent: boolean;
	recordsCreditCost: boolean;
};

const isDuplicateCommand = (error: unknown): boolean =>
	error instanceof BalanceWorkerClientError &&
	error.workerCode === "DUPLICATE_COMMAND";

const trackFeature = ({
	ctx,
	body,
	client,
	featureId,
	recordsUsageEvent,
	recordsCreditCost,
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
					recordsCreditCost,
				}),
			});
			return { engine: "worker", featureId, reply };
		},
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

const trackEachFeature = async ({
	ctx,
	body,
	client,
	recordsCreditCost,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	client: TrackClient;
	recordsCreditCost: boolean;
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
					recordsCreditCost,
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

export async function runBalanceWorkerTrack({
	ctx,
	body,
	isAsync = false,
	validateTrackBodyIdempotencyKey = true,
	recordsCreditCost = false,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	body: TrackParams;
	isAsync?: boolean;
	recordsCreditCost?: boolean;
	validateTrackBodyIdempotencyKey?: boolean;
	client?: TrackClient;
}): Promise<TrackResponseV3> {
	if (isAsync) {
		await runBalanceWorkerAsyncTrack({ ctx, body, recordsCreditCost });
		return getQueuedTrackResponse({ ctx, body });
	}

	return withIdempotencyKey({
		ctx,
		idempotencyKey: validateTrackBodyIdempotencyKey
			? getTrackBodyIdempotencyKey({ body })
			: null,
		routeGroup: RouteGroup.Balances,
		run: () =>
			withCreateIfMissing({
				ctx,
				createEnabled: apiVersionCreatesCustomer({ ctx }),
				customerId: body.customer_id,
				customerData: body.customer_data,
				entityId: body.entity_id,
				entityData: body.entity_data,
				run: async () => {
					const outcomes = await trackEachFeature({
						ctx,
						body,
						client,
						recordsCreditCost,
					});
					fireReplyThresholdsReached({ ctx, body, outcomes });
					return {
						result: trackOutcomesToApiResponse({ ctx, body, outcomes }),
						customer: customerOf({ outcomes }),
					};
				},
			}),
	});
}
