import {
	ApiVersion,
	type ApiVersionClass,
	type TrackParams,
	TrackParamsSchema,
} from "@autumn/shared";
import type { CheckRequest } from "../../processor/types/check.js";
import {
	CannotAnswerError,
	type ForwardReason,
} from "../forward/cannotAnswerError.js";
import { checkCallToRequest, headerToApiVersion } from "./checkContract.js";

/** Every track Atom leaves to the API, told from the request alone. The first rule that applies names the reason. */
const TRACK_RULES: {
	reason: ForwardReason;
	applies: (track: TrackParams, apiVersion: ApiVersionClass) => boolean;
}[] = [
	{
		reason: "track_version",
		applies: (_, apiVersion) => apiVersion.lt(ApiVersion.V2_1),
	},
	{ reason: "track_by_event", applies: (track) => !track.feature_id },
	// Before 2.5 an omitted `async` waits for the deduction (V2_4_TrackParamsChange).
	{
		reason: "sync_track",
		applies: (track, apiVersion) =>
			!(track.async ?? apiVersion.gte(ApiVersion.V2_5)),
	},
	{
		reason: "track_option",
		applies: (track) =>
			track.overage_behavior !== undefined ||
			track.timestamp !== undefined ||
			(track.value ?? 1) <= 0,
	},
];

/**
 * `POST /v1/track` exactly as Autumn's API takes it, as the deducting check of its value. The body's idempotency_key
 * is the deduction's key, as the API's track claims it; a track the rules rule out is left to the API.
 */
export const trackCallToRequest = ({
	body,
	query,
	apiVersionHeader,
	requestId,
	occurredAt,
}: {
	body: unknown;
	query: Record<string, string>;
	apiVersionHeader: string | undefined;
	requestId: string;
	occurredAt: number;
}): CheckRequest => {
	const track = TrackParamsSchema.safeParse(body);
	const apiVersion = headerToApiVersion({ header: apiVersionHeader });
	if (!track.success || apiVersion === undefined)
		throw new CannotAnswerError({ reason: "unreadable_request" });
	if (apiVersion === null)
		throw new CannotAnswerError({ reason: "no_api_version" });
	const reason = TRACK_RULES.find(({ applies }) =>
		applies(track.data, apiVersion),
	)?.reason;
	if (reason) throw new CannotAnswerError({ reason });

	const request = checkCallToRequest({
		body: {
			customer_id: track.data.customer_id,
			entity_id: track.data.entity_id,
			feature_id: track.data.feature_id,
			required_balance: track.data.value ?? 1,
			properties: track.data.properties,
			send_event: true,
			skip_event: track.data.skip_event,
			customer_data: track.data.customer_data,
			entity_data: track.data.entity_data,
		},
		query,
		apiVersionHeader,
		idempotencyKey: track.data.idempotency_key,
		requestId,
		occurredAt,
	});
	return { ...request, kind: "track" };
};
