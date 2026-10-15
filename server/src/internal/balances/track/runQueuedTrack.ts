import {
	type ApiVersion,
	ErrCode,
	RecaseError,
	RouteGroup,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackBodyIdempotencyKey } from "@/internal/balances/idempotency/trackBodyIdempotencyKey.js";
import { withIdempotencyKey } from "@/internal/misc/idempotency/withIdempotencyKey.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import type { TokenDeduction } from "../utils/types/featureDeduction.js";
import { runBalanceWorkerTrack } from "./balanceWorker/runBalanceWorkerTrack.js";
import { replaySpooledTrack } from "./balanceWorker/spool/spooledTrackReplay.js";
import { getValidatedTrackFeatureDeductions } from "./utils/getValidatedTrackFeatureDeductions.js";
import { toTokenFeatureDeduction } from "./utils/tokenFeatureDeduction.js";
import { runTrackV3 } from "./v3/runTrackV3.js";

export const runQueuedTrack = async ({
	ctx,
	body,
	apiVersion,
	tokens,
	validateTrackBodyIdempotencyKey = true,
	spooledAt,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	apiVersion?: ApiVersion;
	/** Set for a queued track_tokens, so replay prices it like the sync path. */
	tokens?: TokenDeduction;
	/** Sync and async replays already claimed the body key at accept time
	 *  (queueTrack marks them false); batch messages have no accept-time
	 *  claim, so the worker's claim is their only body-key dedup. */
	validateTrackBodyIdempotencyKey?: boolean;
	/** Set when a worker-path track was spooled because its command-log append failed or stalled. */
	spooledAt?: number;
}) => {
	// Whatever the routing says now: only the worker's log can dedupe it against an original that landed late.
	if (spooledAt !== undefined)
		return replaySpooledTrack({ ctx, body, tokens, spooledAt });

	const featureDeductions = getValidatedTrackFeatureDeductions({
		ctx,
		body,
	}).map((deduction) =>
		tokens
			? toTokenFeatureDeduction({ feature: deduction.feature, tokens })
			: deduction,
	);
	const onWorker = isBalanceWorkerRolloutEnabled({
		ctx,
		customerId: body.customer_id,
	});
	try {
		await withIdempotencyKey({
			ctx,
			idempotencyKey: validateTrackBodyIdempotencyKey
				? getTrackBodyIdempotencyKey({ body })
				: null,
			routeGroup: RouteGroup.Balances,
			// Claimed here, so the worker path must not claim it again.
			run: () =>
				onWorker
					? runBalanceWorkerTrack({
							ctx,
							body,
							validateTrackBodyIdempotencyKey: false,
							tokens,
						})
					: runTrackV3({ ctx, body, featureDeductions, apiVersion }),
		});
	} catch (error) {
		if (
			!(error instanceof RecaseError) ||
			error.code !== ErrCode.DuplicateIdempotencyKey
		) {
			throw error;
		}

		ctx.logger.info("[track] queued replay already applied", {
			type: "track_queue_replay_duplicate",
			customer_id: body.customer_id,
			entity_id: body.entity_id,
			feature_id: body.feature_id,
			event_name: body.event_name,
		});
	}
};
