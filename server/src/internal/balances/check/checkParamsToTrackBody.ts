import type { ParsedCheckParams, TrackParams } from "@autumn/shared";

/** The track a deducting check (`send_event` or a lock) runs: reject mode, or the lock's own overage behaviour. */
export const checkParamsToTrackBody = ({
	body,
	requiredBalance,
}: {
	body: ParsedCheckParams;
	requiredBalance: number;
}): TrackParams => ({
	customer_id: body.customer_id,
	entity_id: body.entity_id,
	feature_id: body.feature_id,
	value: requiredBalance,
	properties: body.properties,
	skip_event: body.skip_event,
	// A lock keeps its overage behaviour for a later confirm above the lock.
	overage_behavior: body.lock?.overage_behavior ?? "reject",
});
