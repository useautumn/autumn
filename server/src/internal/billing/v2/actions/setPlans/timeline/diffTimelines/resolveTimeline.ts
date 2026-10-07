import {
	groupByKey,
	isAliveAt,
	sortByStart,
	startsInFuture,
} from "../timelineGuards";
import type { SetPlansPolicies } from "../types/setPlansPolicies";
import type { SavedTimeline } from "../types/timeline";
import type { ResolvedSegment } from "../types/timelineDiff";
import type { SavedRow, SavedSegment } from "../types/timelineSegment";
import type { PlannedSegment } from "./plannedSegments";

type CarryRules = {
	policies: SetPlansPolicies;
	liveRowsCarry: boolean;
	now: number;
};

export const resolvedSegmentId = ({
	key,
	startsAt,
}: {
	key: string;
	startsAt: number;
}) => `${key}@${startsAt}`;

/** The policy keeps a canceling live plan's cancellation through a re-list. */
const keepsLiveCancellation = ({
	liveRow,
	policies,
}: {
	liveRow?: SavedRow;
	policies: SetPlansPolicies;
}) => liveRow?.canceling === true && policies.canceling === "keepCancellation";

const liveRowCarries = ({
	liveRow,
	planned,
	rules,
}: {
	liveRow: SavedRow;
	planned: PlannedSegment;
	rules: CarryRules;
}) => {
	if (planned.origin === "retained") return true;
	// A one-off purchase has no cycle to restart, so recreating it would only charge it again.
	if (planned.lifetime) return true;
	const keepsCancellation = keepsLiveCancellation({
		liveRow,
		policies: rules.policies,
	});
	// No Stripe period is open for the plan, so even an unchanged listing starts one, like a new price would.
	const startsStripeBilling =
		liveRow.unbilledByStripe &&
		rules.policies.unbilledRows === "recreate" &&
		!keepsCancellation;
	if (startsStripeBilling) return false;
	if (!rules.liveRowsCarry) return false;
	if (liveRow.canceling && rules.policies.canceling === "recreate") {
		return false;
	}
	if (liveRow.pastDue && rules.policies.pastDue === "recreate") return false;
	return true;
};

/** A saved segment carries a planned one when it already grants the same config from the same start. */
const savedCarriesPlanned = ({
	savedSegment,
	planned,
	rules,
}: {
	savedSegment: SavedSegment;
	planned: PlannedSegment;
	rules: CarryRules;
}) => {
	if (savedSegment.configHash !== planned.configHash) return false;

	const plannedStartsNow = !startsInFuture({
		segment: planned,
		now: rules.now,
	});
	if (!plannedStartsNow) return savedSegment.startsAt === planned.startsAt;

	const [liveRow] = savedSegment.rows;
	return (
		liveRow !== undefined &&
		isAliveAt({ segment: savedSegment, at: rules.now }) &&
		liveRowCarries({ liveRow, planned, rules })
	);
};

/** A canceling plan re-listed with no end of its own keeps its cancellation, carried or recreated; an explicit end replaces it. */
const isCancellationKept = ({
	planned,
	savedSegment,
	policies,
}: {
	planned: PlannedSegment;
	savedSegment: SavedSegment;
	policies: SetPlansPolicies;
}) =>
	keepsLiveCancellation({ liveRow: savedSegment.rows[0], policies }) &&
	planned.endsAt === null;

/** Like Stripe's cancel_at_period_end, a kept cancellation lands at the period end, which a reset-now moves. */
const keptCancellationEndsAt = ({
	savedSegment,
	policies,
}: {
	savedSegment: SavedSegment;
	policies: SetPlansPolicies;
}): number | null => {
	const cycleResetsNow = policies.liveRows === "recreateRenewing";
	const resetPeriodEndsAt = cycleResetsNow
		? savedSegment.rows[0]?.periodEndsAtAfterReset
		: undefined;
	return resetPeriodEndsAt ?? savedSegment.endsAt;
};

const carriedEndsAt = ({
	planned,
	savedSegment,
	policies,
}: {
	planned: PlannedSegment;
	savedSegment: SavedSegment;
	policies: SetPlansPolicies;
}): number | null =>
	isCancellationKept({ planned, savedSegment, policies })
		? keptCancellationEndsAt({ savedSegment, policies })
		: planned.endsAt;

/** The live plan a recreated segment replaces now, when it keeps that plan's cancellation. */
const findInheritedCancellation = ({
	planned,
	savedSegments,
	rules,
}: {
	planned: PlannedSegment;
	savedSegments: SavedSegment[];
	rules: CarryRules;
}): SavedSegment | undefined => {
	if (startsInFuture({ segment: planned, now: rules.now })) return undefined;
	const replaced = savedSegments.find((savedSegment) =>
		isAliveAt({ segment: savedSegment, at: rules.now }),
	);
	if (!replaced) return undefined;
	return isCancellationKept({
		planned,
		savedSegment: replaced,
		policies: rules.policies,
	})
		? replaced
		: undefined;
};

const toResolvedSegment = ({
	planned,
	carriedBy,
	endsAt,
	inheritsCancellation,
}: {
	planned: PlannedSegment;
	carriedBy?: SavedSegment;
	endsAt: number | null;
	inheritsCancellation?: boolean;
}): ResolvedSegment => ({
	id: resolvedSegmentId(planned),
	key: planned.key,
	planId: planned.planId,
	internalEntityId: planned.internalEntityId,
	replacementKey: planned.replacementKey,
	configHash: planned.configHash,
	lifetime: planned.lifetime,
	startsAt: planned.startsAt,
	endsAt,
	origin: planned.origin,
	desired: planned.desired,
	carriedBy,
	inheritsCancellation,
});

const resolveKey = ({
	planned,
	savedSegments,
	rules,
}: {
	planned: PlannedSegment[];
	savedSegments: SavedSegment[];
	rules: CarryRules;
}): ResolvedSegment[] => {
	const uncarriedSaved = sortByStart(savedSegments);

	return sortByStart(planned).map((plannedSegment) => {
		const carriedBy = uncarriedSaved.find((savedSegment) =>
			savedCarriesPlanned({ savedSegment, planned: plannedSegment, rules }),
		);
		if (!carriedBy) {
			const cancellationSource = findInheritedCancellation({
				planned: plannedSegment,
				savedSegments: uncarriedSaved,
				rules,
			});
			return toResolvedSegment({
				planned: plannedSegment,
				endsAt: cancellationSource
					? keptCancellationEndsAt({
							savedSegment: cancellationSource,
							policies: rules.policies,
						})
					: plannedSegment.endsAt,
				inheritsCancellation: cancellationSource !== undefined,
			});
		}

		uncarriedSaved.splice(uncarriedSaved.indexOf(carriedBy), 1);
		return toResolvedSegment({
			planned: plannedSegment,
			carriedBy,
			endsAt: carriedEndsAt({
				planned: plannedSegment,
				savedSegment: carriedBy,
				policies: rules.policies,
			}),
		});
	});
};

/** A live one-off purchase nothing carries runs on exactly as saved. */
const untouchedLifetimeSegments = ({
	saved,
	resolved,
	now,
}: {
	saved: SavedTimeline;
	resolved: ResolvedSegment[];
	now: number;
}): ResolvedSegment[] => {
	const carried = new Set(resolved.map(({ carriedBy }) => carriedBy));
	return saved.segments
		.filter(
			(savedSegment) =>
				savedSegment.lifetime &&
				!carried.has(savedSegment) &&
				isAliveAt({ segment: savedSegment, at: now }),
		)
		.map((savedSegment) => ({
			id: resolvedSegmentId(savedSegment),
			key: savedSegment.key,
			planId: savedSegment.planId,
			internalEntityId: savedSegment.internalEntityId,
			replacementKey: savedSegment.replacementKey,
			configHash: savedSegment.configHash,
			lifetime: true,
			startsAt: savedSegment.startsAt,
			endsAt: savedSegment.endsAt,
			origin: "untouched",
			carriedBy: savedSegment,
		}));
};

const splitSegmentAt = ({
	savedSegment,
	startsAt,
}: {
	savedSegment: SavedSegment;
	startsAt: number;
}): SavedSegment[] => {
	const splitIndex = savedSegment.rows.findIndex(
		(row, index) => index > 0 && row.startsAt === startsAt,
	);
	if (splitIndex < 0) return [savedSegment];

	const head = savedSegment.rows.slice(0, splitIndex);
	const tail = savedSegment.rows.slice(splitIndex);
	return [
		{
			...savedSegment,
			endsAt: head[head.length - 1]?.endsAt ?? startsAt,
			rows: head,
		},
		{ ...savedSegment, startsAt, rows: tail },
	];
};

/** A saved run split where a planned segment starts, so the rows from there on can carry it alone. */
const splitAtPlannedStarts = ({
	saved,
	planned,
	now,
}: {
	saved: SavedTimeline;
	planned: PlannedSegment[];
	now: number;
}): SavedTimeline => {
	const futureStartsByKey = groupByKey(
		planned.filter((segment) => startsInFuture({ segment, now })),
	);
	return {
		segments: saved.segments.flatMap((savedSegment) =>
			(futureStartsByKey.get(savedSegment.key) ?? []).reduce<SavedSegment[]>(
				(segments, { startsAt }) =>
					segments.flatMap((segment) =>
						splitSegmentAt({ savedSegment: segment, startsAt }),
					),
				[savedSegment],
			),
		),
	};
};

const resolveWithRules = ({
	saved,
	planned,
	rules,
}: {
	saved: SavedTimeline;
	planned: PlannedSegment[];
	rules: CarryRules;
}) => {
	const savedByKey = groupByKey(saved.segments);
	const resolved = [...groupByKey(planned)].flatMap(([key, plannedForKey]) =>
		resolveKey({
			planned: plannedForKey,
			savedSegments: savedByKey.get(key) ?? [],
			rules,
		}),
	);
	return [
		...resolved,
		...untouchedLifetimeSegments({ saved, resolved, now: rules.now }),
	];
};

const insertsPaidRecurringNow = ({
	resolved,
	now,
}: {
	resolved: ResolvedSegment[];
	now: number;
}) =>
	resolved.some(
		(segment) =>
			!segment.carriedBy &&
			segment.desired?.paidRecurring === true &&
			!startsInFuture({ segment, now }),
	);

/** Pairs every planned segment with the saved segment that already runs it, if any. */
export const resolveTimeline = ({
	saved: unsplitSaved,
	planned,
	policies,
	now,
}: {
	saved: SavedTimeline;
	planned: PlannedSegment[];
	policies: SetPlansPolicies;
	now: number;
}): ResolvedSegment[] => {
	const saved = splitAtPlannedStarts({ saved: unsplitSaved, planned, now });
	const carrying = resolveWithRules({
		saved,
		planned,
		rules: {
			policies,
			now,
			liveRowsCarry:
				policies.liveRows !== "recreate" &&
				policies.liveRows !== "recreateRenewing",
		},
	});

	const recreatesLiveRows =
		policies.liveRows === "recreateWhenPaidRecurringStarts" &&
		insertsPaidRecurringNow({ resolved: carrying, now });
	if (!recreatesLiveRows) return carrying;

	return resolveWithRules({
		saved,
		planned,
		rules: { policies, now, liveRowsCarry: false },
	});
};
