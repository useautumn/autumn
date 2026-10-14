import { ErrCode, RecaseError, type TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getTrackFeatureDeductionsForBody } from "./getFeatureDeductions.js";

export const getValidatedTrackFeatureDeductions = ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: TrackParams;
}) => {
	if (body.event_name && body.overage_behavior === "reject") {
		throw new RecaseError({
			message:
				'overage_behavior "reject" is not supported with event_name. Use feature_id or set overage_behavior to "cap".',
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	return getTrackFeatureDeductionsForBody({ ctx, body });
};
