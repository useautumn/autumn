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
import { getTrackFeatureDeductionsForBody } from "./utils/getFeatureDeductions.js";
import { toTokenFeatureDeduction } from "./utils/tokenFeatureDeduction.js";
import { runTrackV3 } from "./v3/runTrackV3.js";

export const runQueuedTrack = async ({
	ctx,
	body,
	apiVersion,
	tokens,
	validateTrackBodyIdempotencyKey = true,
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
}) => {
	const featureDeductions = getTrackFeatureDeductionsForBody({
		ctx,
		body,
	}).map((deduction) =>
		tokens
			? toTokenFeatureDeduction({ feature: deduction.feature, tokens })
			: deduction,
	);

	try {
		await withIdempotencyKey({
			ctx,
			idempotencyKey: validateTrackBodyIdempotencyKey
				? getTrackBodyIdempotencyKey({ body })
				: null,
			routeGroup: RouteGroup.Balances,
			// Claimed here, so the worker path must not claim it again.
			run: () =>
				isBalanceWorkerRolloutEnabled({ ctx, customerId: body.customer_id })
					? runBalanceWorkerTrack({
							ctx,
							body,
							validateTrackBodyIdempotencyKey: false,
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
