import { ApiVersion } from "@autumn/shared";
import {
	CannotAnswerError,
	type ForwardReason,
} from "../../../lib/forward/cannotAnswerError.js";
import type { AnswerableTrack, TrackRequest } from "../../types/track.js";

const DEFAULT_VALUE = 1;

/** Every track Atom leaves to the API, told from the request alone. The first rule that applies names the reason. */
const FORWARD_RULES: {
	reason: ForwardReason;
	applies: (request: TrackRequest) => boolean;
}[] = [
	{
		reason: "track_version",
		applies: ({ apiVersion }) => apiVersion.lt(ApiVersion.V2_1),
	},
	{ reason: "track_by_event", applies: ({ params }) => !params.feature_id },
	// Before 2.5 an omitted `async` waits for the deduction (V2_4_TrackParamsChange).
	{
		reason: "sync_track",
		applies: ({ params, apiVersion }) =>
			!(params.async ?? apiVersion.gte(ApiVersion.V2_5)),
	},
	{
		reason: "track_option",
		applies: ({ params }) =>
			params.overage_behavior !== undefined ||
			params.timestamp !== undefined ||
			(params.value ?? DEFAULT_VALUE) <= 0,
	},
	// Atom deducts a customer's own track; an entity's is the API's.
	{ reason: "send_event", applies: ({ params }) => Boolean(params.entity_id) },
	// These can create the customer or the entity.
	{
		reason: "customer_data",
		applies: ({ params }) =>
			params.customer_data !== undefined || params.entity_data !== undefined,
	},
];

/** The request reduced to what Atom deducts; a request a rule applies to is left to the API. */
export const trackRequestToAnswerableTrack = ({
	request,
}: {
	request: TrackRequest;
}): AnswerableTrack => {
	const reason = FORWARD_RULES.find(({ applies }) => applies(request))?.reason;
	if (reason) throw new CannotAnswerError({ reason });

	const { params } = request;
	// No rule applied, so it is present; this only tells the compiler.
	if (!params.feature_id)
		throw new CannotAnswerError({ reason: "track_by_event" });

	return {
		requestId: request.requestId,
		occurredAt: request.occurredAt,
		customerId: params.customer_id,
		featureId: params.feature_id,
		value: params.value ?? DEFAULT_VALUE,
		properties: params.properties ?? null,
		idempotencyKey: request.idempotencyKey,
		skipEvent: params.skip_event === true,
	};
};
