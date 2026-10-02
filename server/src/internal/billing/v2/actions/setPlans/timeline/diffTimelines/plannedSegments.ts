import { earliestEnd, isAliveAt } from "../timelineGuards";
import type { SetPlansPolicies } from "../types/setPlansPolicies";
import type { DesiredTimeline, SavedTimeline } from "../types/timeline";
import type { ResolvedSegmentOrigin } from "../types/timelineDiff";
import type {
	DesiredSegment,
	InstanceIdentity,
	SavedSegment,
} from "../types/timelineSegment";

/** A segment the timeline must hold, before deciding which saved rows carry it. */
export type PlannedSegment = InstanceIdentity & {
	configHash: string;
	lifetime: boolean;
	paidRecurring: boolean;
	startsAt: number;
	endsAt: number | null;
	origin: Exclude<ResolvedSegmentOrigin, "untouched">;
	desired?: DesiredSegment;
};

const desiredToPlanned = (desired: DesiredSegment): PlannedSegment => ({
	key: desired.key,
	planId: desired.planId,
	internalEntityId: desired.internalEntityId,
	replacementKey: desired.replacementKey,
	configHash: desired.configHash,
	lifetime: desired.lifetime,
	paidRecurring: desired.paidRecurring,
	startsAt: desired.startsAt,
	endsAt: desired.endsAt,
	origin: "declared",
	desired,
});

/** The first time a declared plan claims the saved plan's group and scope. */
const firstClaimStart = ({
	savedSegment,
	desired,
	now,
}: {
	savedSegment: SavedSegment;
	desired: DesiredTimeline;
	now: number;
}): number | null => {
	const claimStarts = desired.segments
		.filter(
			(segment) =>
				segment.replacementKey === savedSegment.replacementKey &&
				segment.internalEntityId === savedSegment.internalEntityId &&
				(segment.endsAt === null || segment.endsAt > now),
		)
		.map((segment) => Math.max(segment.startsAt, now));
	return claimStarts.length > 0 ? Math.min(...claimStarts) : null;
};

/** An undeclared live plan kept running until a declared plan claims its group, the schedule ends, or it cancels. */
const retainedSegment = ({
	savedSegment,
	desired,
	now,
}: {
	savedSegment: SavedSegment;
	desired: DesiredTimeline;
	now: number;
}): PlannedSegment | undefined => {
	const [liveRow] = savedSegment.rows;
	const endsAt = earliestEnd([
		firstClaimStart({ savedSegment, desired, now }),
		savedSegment.onLiveSubscription ? desired.endsAt : null,
		liveRow?.canceling ? savedSegment.endsAt : null,
	]);
	if (endsAt !== null && endsAt <= now) return undefined;

	return {
		key: savedSegment.key,
		planId: savedSegment.planId,
		internalEntityId: savedSegment.internalEntityId,
		replacementKey: savedSegment.replacementKey,
		configHash: savedSegment.configHash,
		lifetime: false,
		paidRecurring: false,
		startsAt: now,
		endsAt,
		origin: "retained",
	};
};

const isUndeclaredLiveSegment = ({
	savedSegment,
	declaredKeys,
	now,
}: {
	savedSegment: SavedSegment;
	declaredKeys: Set<string>;
	now: number;
}) =>
	!savedSegment.lifetime &&
	!declaredKeys.has(savedSegment.key) &&
	isAliveAt({ segment: savedSegment, at: now });

/** The declared segments, plus — when the policy retains them — the live plans the request leaves out. */
export const plannedSegments = ({
	saved,
	desired,
	policies,
	now,
}: {
	saved: SavedTimeline;
	desired: DesiredTimeline;
	policies: SetPlansPolicies;
	now: number;
}): PlannedSegment[] => {
	const declared = desired.segments.map(desiredToPlanned);
	if (policies.undeclared === "end") return declared;

	const declaredKeys = new Set(declared.map(({ key }) => key));
	const retained = saved.segments
		.filter((savedSegment) =>
			isUndeclaredLiveSegment({ savedSegment, declaredKeys, now }),
		)
		.flatMap((savedSegment) => {
			const segment = retainedSegment({ savedSegment, desired, now });
			return segment ? [segment] : [];
		});

	return [...declared, ...retained];
};
