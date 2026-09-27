import type { PushResult } from "../../../actions/pushHourlyMeters/types/pushResult";
import type { MeteringContext } from "../../../types/meteringContext";
import { pushTrackItems } from "../../../utils/pushTrackItems";
import type { ApiCallCount } from "../../types/apiCallCount";
import { apiCallCountToTrackItem } from "./apiCallCountToTrackItem";

/** Tracks counted API calls against `api_call`, one item per (org, hour, endpoint). */
export const pushApiCalls = async ({
	ctx,
	counts,
}: {
	ctx: MeteringContext;
	counts: ApiCallCount[];
}): Promise<PushResult> => {
	const items = counts.map(apiCallCountToTrackItem);
	return pushTrackItems({ ctx, items });
};
