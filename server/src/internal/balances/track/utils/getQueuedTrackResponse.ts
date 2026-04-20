import {
	AffectedResource,
	type ApiVersion,
	ApiVersionClass,
	applyResponseVersionChanges,
	type TrackParams,
	type TrackResponseV3,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const getQueuedTrackResponse = ({
	ctx,
	body,
	apiVersion,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	apiVersion?: ApiVersion;
}) =>
	applyResponseVersionChanges<TrackResponseV3>({
		input: {
			customer_id: body.customer_id,
			entity_id: body.entity_id,
			event_name: body.event_name,
			value: body.value ?? 1,
			balance: null,
		},
		targetVersion: apiVersion
			? new ApiVersionClass(apiVersion)
			: ctx.apiVersion,
		resource: AffectedResource.Track,
		legacyData: {
			feature_id: body.feature_id || body.event_name,
		},
		ctx,
	});
