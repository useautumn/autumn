import { TrackParamsSchema } from "@autumn/shared";
import type { TrackRequest } from "../../processor/types/track.js";
import { CannotAnswerError } from "../forward/cannotAnswerError.js";
import { headerToApiVersion } from "./checkContract.js";

/** `POST /v1/track` exactly as Autumn's API takes it. The body's idempotency_key is the key the API's track claims. */
export const trackCallToRequest = ({
	body,
	apiVersionHeader,
	requestId,
	occurredAt,
	movedFrom = null,
}: {
	body: unknown;
	apiVersionHeader: string | undefined;
	requestId: string;
	occurredAt: number;
	movedFrom?: string | null;
}): TrackRequest => {
	const params = TrackParamsSchema.safeParse(body);
	const apiVersion = headerToApiVersion({ header: apiVersionHeader });
	if (!params.success || apiVersion === undefined)
		throw new CannotAnswerError({ reason: "unreadable_request" });
	// The API derives a version from the org's creation date, which Atom does not hold.
	if (apiVersion === null)
		throw new CannotAnswerError({ reason: "no_api_version" });

	return {
		requestId,
		occurredAt,
		// The API takes an empty key as none.
		idempotencyKey: params.data.idempotency_key || null,
		params: params.data,
		apiVersion,
		movedFrom,
	};
};
