import type { RequestedPhase } from "../timeline/desiredTimeline/types/requestedPhase";
import type { SetPlansPolicies } from "../timeline/types/setPlansPolicies";
import type {
	DesiredTimeline,
	SavedTimeline,
} from "../timeline/types/timeline";
import type { TimelineDiff } from "../timeline/types/timelineDiff";

/** Everything set_plans decides, read once in setup and projected by compute and preview. */
export type SetPlansTimeline = {
	requestedPhases: RequestedPhase[];
	saved: SavedTimeline;
	desired: DesiredTimeline;
	policies: SetPlansPolicies;
	diff: TimelineDiff;
	/** Rows outside the request's entity or subscription scope, which the schedule must keep. */
	outOfScopeCustomerProductIds: string[];
};
