import type { RequestedPhase } from "../timeline/desiredTimeline/types/requestedPhase";
import type { SetPlansPolicies } from "../timeline/types/setPlansPolicies";
import type {
	DesiredTimeline,
	SavedTimeline,
} from "../timeline/types/timeline";
import type { TimelineDiff } from "../timeline/types/timelineDiff";

export type SetPlansTimeline = {
	requestedPhases: RequestedPhase[];
	saved: SavedTimeline;
	desired: DesiredTimeline;
	policies: SetPlansPolicies;
	diff: TimelineDiff;
	outOfScopeCustomerProductIds: string[];
};
