import type { SetPlansPolicies } from "../types/setPlansPolicies";
import type { DesiredTimeline, SavedTimeline } from "../types/timeline";
import type { TimelineDiff } from "../types/timelineDiff";
import { plannedSegments } from "./plannedSegments";
import { resolveTimeline } from "./resolveTimeline";
import { timelineToOperations } from "./timelineToOperations";

export const diffTimelines = ({
	saved,
	desired,
	policies,
	now,
}: {
	saved: SavedTimeline;
	desired: DesiredTimeline;
	policies: SetPlansPolicies;
	now: number;
}): TimelineDiff => {
	const planned = plannedSegments({ saved, desired, policies, now });
	const timeline = resolveTimeline({ saved, planned, policies, now });

	return {
		now,
		timeline,
		operations: timelineToOperations({ saved, timeline, now }),
	};
};
