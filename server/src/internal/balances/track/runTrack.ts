import {
	AffectedResource,
	applyResponseVersionChanges,
	type CheckExpand,
	ErrCode,
	RecaseError,
	type TrackParams,
	type TrackResponseV2,
} from "@autumn/shared";
import type { AutumnContext } from "../../../honoUtils/HonoEnv";

import { runRedisDeduction } from "./redisTrackUtils/runRedisDeduction";
import { executePostgresTracking } from "./trackUtils/executePostgresTracking";
import type { FeatureDeduction } from "./trackUtils/getFeatureDeductions";

export const runTrack = async ({
	ctx,
	body,
	featureDeductions,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	featureDeductions: FeatureDeduction[];
}) => {
	// Validate: event_name cannot be used with overage_behavior: "reject"
	if (body.event_name && body.overage_behavior === "reject") {
		throw new RecaseError({
			message:
				'overage_behavior "reject" is not supported with event_name. Use feature_id or set overage_behavior to "cap".',
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	// ctx.skipCache = true;

	const { fallback, balances } = await runRedisDeduction({
		ctx,
		query: {
			expand: ctx.expand as CheckExpand[],
			skip_cache: ctx.skipCache,
		},
		trackParams: body,
		featureDeductions,
		overageBehavior: body.overage_behavior || "cap",
		eventInfo: {
			event_name: body.feature_id || body.event_name || "",
			value: body.value ?? 1,
			properties: body.properties,
			timestamp: body.timestamp,
			idempotency_key: body.idempotency_key,
		},
	});

	let response: TrackResponseV2;
	if (fallback) {
		response = await executePostgresTracking({
			ctx,
			body,
			featureDeductions,
		});
	} else {
		// Clean balances

		if (balances && Object.keys(balances).length > 0) {
			for (const balance of Object.values(balances)) {
				balance.feature = undefined;
			}
		}

		response = {
			customer_id: body.customer_id,
			entity_id: body.entity_id,
			event_name: body.event_name,
			value: body.value ?? 1,
			balance:
				balances && Object.keys(balances).length === 1
					? Object.values(balances)[0]
					: null,
			balances:
				balances && Object.keys(balances).length > 1 ? balances : undefined,
		};
	}

	const transformedResponse = applyResponseVersionChanges<TrackResponseV2>({
		input: response,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Track,
		legacyData: {
			feature_id: body.feature_id || body.event_name,
		},
	});
	return transformedResponse;
};
