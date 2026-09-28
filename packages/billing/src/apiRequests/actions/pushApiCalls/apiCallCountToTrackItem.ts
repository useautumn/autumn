import type { TrackItem } from "../../../actions/pushHourlyMeters/types/trackItem";
import { apiRequestEventProperties } from "../../apiRequestCatalog";
import type { ApiCallCount } from "../../types/apiCallCount";

export const API_CALL_FEATURE_ID = "api_call";

/** The key Autumn dedups on; the ledger stores the same one. */
export const apiCallIdempotencyKey = ({
	orgId,
	hourStartMs,
	endpointId,
}: Pick<ApiCallCount, "orgId" | "hourStartMs" | "endpointId">): string =>
	`api_call:${orgId}:${new Date(hourStartMs).toISOString()}:${endpointId}`;

export const apiCallCountToTrackItem = (count: ApiCallCount): TrackItem => ({
	customerId: count.orgId,
	featureId: API_CALL_FEATURE_ID,
	value: count.requests,
	timestampMs: count.hourStartMs,
	idempotencyKey: apiCallIdempotencyKey(count),
	properties: { [apiRequestEventProperties.endpointId]: count.endpointId },
});
