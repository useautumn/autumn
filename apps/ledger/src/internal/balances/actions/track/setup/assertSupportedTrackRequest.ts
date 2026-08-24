import { ErrCode, RecaseError, type TrackParams } from "@autumn/shared";

// Row 18. This is a request-shape rule, so it runs before feature resolution —
// otherwise the unbuilt event_name branch would answer first.
export const assertSupportedTrackRequest = ({
	body,
}: {
	body: TrackParams;
}): void => {
	if (body.event_name && body.overage_behavior === "reject") {
		throw new RecaseError({
			message:
				'overage_behavior "reject" is not supported with event_name. Use feature_id or set overage_behavior to "cap".',
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
