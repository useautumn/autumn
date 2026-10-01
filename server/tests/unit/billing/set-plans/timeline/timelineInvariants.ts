import { expect } from "bun:test";
import { diffTimelines } from "@/internal/billing/v2/actions/setPlans/timeline/diffTimelines/diffTimelines";
import { rowsToSavedTimeline } from "@/internal/billing/v2/actions/setPlans/timeline/savedTimeline/rowsToSavedTimeline";
import type { SetPlansPolicies } from "@/internal/billing/v2/actions/setPlans/timeline/types/setPlansPolicies";
import type {
	DesiredTimeline,
	SavedTimeline,
} from "@/internal/billing/v2/actions/setPlans/timeline/types/timeline";
import type {
	ResolvedSegment,
	TimelineDiff,
	TimelineOperation,
	TimelineTransition,
} from "@/internal/billing/v2/actions/setPlans/timeline/types/timelineDiff";
import type { TimelineRow } from "@/internal/billing/v2/actions/setPlans/timeline/types/timelineRow";
import { NOW } from "./timelineFixtures";

export type TimelineCase = {
	rows: TimelineRow[];
	desired: DesiredTimeline;
	policies: SetPlansPolicies;
};

export const runTimelineCase = ({ rows, desired, policies }: TimelineCase) => {
	const saved = rowsToSavedTimeline({ rows, now: NOW });
	const diff = diffTimelines({ saved, desired, policies, now: NOW });
	return { saved, diff };
};

const segmentRow = (segment: ResolvedSegment): TimelineRow => ({
	customerProductId: `inserted:${segment.id}`,
	planId: segment.planId,
	internalEntityId: segment.internalEntityId,
	replacementKey: segment.replacementKey,
	configHash: segment.configHash,
	lifetime: segment.lifetime,
	onLiveSubscription: true,
	startsAt: segment.startsAt,
	endsAt: segment.endsAt,
	scheduled: segment.startsAt > NOW,
	canceling: false,
	pastDue: false,
	externalId: null,
});

/** The saved rows after the diff's row writes, the way execution would leave them. */
export const applyTimelineOperations = ({
	rows,
	diff,
}: {
	rows: TimelineRow[];
	diff: TimelineDiff;
}): TimelineRow[] => {
	const removedIds = new Set(
		diff.operations.flatMap((operation) =>
			operation.type === "expire" || operation.type === "delete"
				? [operation.customerProductId]
				: [],
		),
	);
	const retimes = new Map(
		diff.operations.flatMap((operation) =>
			operation.type === "retime"
				? [[operation.customerProductId, operation.endsAt] as const]
				: [],
		),
	);
	const segmentsById = new Map(
		diff.timeline.map((segment) => [segment.id, segment]),
	);

	const remainingRows = rows
		.filter((row) => !removedIds.has(row.customerProductId))
		.map((row) =>
			retimes.has(row.customerProductId)
				? { ...row, endsAt: retimes.get(row.customerProductId) ?? null }
				: row,
		);
	const insertedRows = diff.operations.flatMap((operation) => {
		if (operation.type !== "insert") return [];
		const segment = segmentsById.get(operation.segmentId);
		return segment ? [segmentRow(segment)] : [];
	});

	return [...remainingRows, ...insertedRows];
};

type ComparableSegment = {
	planId: string;
	internalEntityId: string | null;
	configHash: string;
	startsAt: number;
	endsAt: number | null;
};

const toComparable = (
	segments: (ComparableSegment & { key: string })[],
): string[] => {
	const sorted = [...segments].sort(
		(first, second) =>
			first.key.localeCompare(second.key) || first.startsAt - second.startsAt,
	);
	const merged: (ComparableSegment & { key: string })[] = [];
	for (const segment of sorted) {
		const previous = merged[merged.length - 1];
		const continuesPrevious =
			previous !== undefined &&
			previous.key === segment.key &&
			previous.configHash === segment.configHash &&
			previous.endsAt === segment.startsAt;
		if (previous && continuesPrevious) previous.endsAt = segment.endsAt;
		else merged.push({ ...segment });
	}
	return merged
		.map((segment) =>
			[
				segment.planId,
				segment.internalEntityId ?? "customer",
				segment.configHash,
				Math.max(segment.startsAt, NOW),
				segment.endsAt ?? "never",
			].join("|"),
		)
		.sort();
};

/** I6: executing the operations and re-reading the rows yields exactly the resolved timeline. */
export const expectRoundTrip = ({
	rows,
	diff,
}: {
	rows: TimelineRow[];
	diff: TimelineDiff;
}) => {
	const rebuilt = rowsToSavedTimeline({
		rows: applyTimelineOperations({ rows, diff }),
		now: NOW,
	});
	expect(toComparable(rebuilt.segments)).toEqual(toComparable(diff.timeline));
};

const isChange = (operation: TimelineOperation) => operation.type !== "keep";

const isRequestChange = (transition: TimelineTransition) =>
	transition.origin !== "saved" && transition.kind !== "continues";

/** I1: a request equal to the saved state writes nothing and reports no change. */
export const expectIdempotent = ({ diff }: { diff: TimelineDiff }) => {
	expect(diff.operations.filter(isChange)).toEqual([]);
	expect(diff.transitions.filter(isRequestChange)).toEqual([]);
};

const transitionKeys = (transition: TimelineTransition): string[] => {
	switch (transition.kind) {
		case "starts":
			return [transition.to.key];
		case "ends":
			return [transition.from.key];
		case "updated":
		case "continues":
			return [transition.from.key, transition.to.key];
		default: {
			const unreachable: never = transition;
			return unreachable;
		}
	}
};

/** I3: every row write shows as a request or withdrawn change, and every such change has a write. */
export const expectOneToOne = ({ diff }: { diff: TimelineDiff }) => {
	const changes = diff.transitions.filter(isRequestChange);
	const changedKeys = new Set(changes.flatMap(transitionKeys));
	const writtenKeys = new Set(
		diff.operations.filter(isChange).map((operation) => operation.key),
	);

	for (const operation of diff.operations.filter(isChange)) {
		expect({ operation, shown: changedKeys.has(operation.key) }).toEqual({
			operation,
			shown: true,
		});
	}
	for (const transition of changes) {
		expect({
			transition: `${transition.kind}@${transition.at}:${transitionKeys(transition).join(",")}`,
			written: transitionKeys(transition).some((key) => writtenKeys.has(key)),
		}).toEqual({
			transition: `${transition.kind}@${transition.at}:${transitionKeys(transition).join(",")}`,
			written: true,
		});
	}
};

/** I4: the resolved timeline holds every declared segment; only an open-ended one keeps a cancel date. */
export const expectProjection = ({
	saved,
	desired,
	diff,
}: {
	saved: SavedTimeline;
	desired: DesiredTimeline;
	diff: TimelineDiff;
}) => {
	const cancelEnds = new Map(
		saved.segments.flatMap((segment) =>
			segment.rows[0]?.canceling ? [[segment.key, segment.endsAt]] : [],
		),
	);
	const declared = diff.timeline.filter(({ origin }) => origin === "declared");
	expect(declared).toHaveLength(desired.segments.length);

	for (const desiredSegment of desired.segments) {
		const resolved = declared.find(
			(segment) =>
				segment.key === desiredSegment.key &&
				segment.startsAt === desiredSegment.startsAt,
		);
		expect(resolved?.configHash).toBe(desiredSegment.configHash);
		const cancelEndsAt = cancelEnds.get(desiredSegment.key);
		const clipped =
			resolved?.carriedBy !== undefined &&
			cancelEndsAt !== undefined &&
			cancelEndsAt !== null &&
			desiredSegment.endsAt === null;
		expect(resolved?.endsAt).toBe(
			clipped ? cancelEndsAt : desiredSegment.endsAt,
		);
	}
};

/** I5: in retain mode no undeclared live plan ends, unless a declared plan claims its group. */
export const expectRetained = ({
	saved,
	desired,
	diff,
}: {
	saved: SavedTimeline;
	desired: DesiredTimeline;
	diff: TimelineDiff;
}) => {
	const declaredKeys = new Set(desired.segments.map(({ key }) => key));
	const undeclaredLive = saved.segments.filter(
		(segment) =>
			!declaredKeys.has(segment.key) &&
			segment.startsAt <= NOW &&
			(segment.endsAt === null || segment.endsAt > NOW),
	);

	for (const savedSegment of undeclaredLive) {
		const claimed = desired.segments.some(
			(segment) =>
				segment.replacementKey === savedSegment.replacementKey &&
				segment.internalEntityId === savedSegment.internalEntityId,
		);
		if (claimed) continue;

		const expired = diff.operations.some(
			(operation) =>
				operation.type === "expire" && operation.key === savedSegment.key,
		);
		expect({ key: savedSegment.key, expired }).toEqual({
			key: savedSegment.key,
			expired: false,
		});
	}
};

export const expectAllInvariants = (timelineCase: TimelineCase) => {
	const { saved, diff } = runTimelineCase(timelineCase);
	expectRoundTrip({ rows: timelineCase.rows, diff });
	expectOneToOne({ diff });
	expectProjection({ saved, desired: timelineCase.desired, diff });
	if (timelineCase.policies.undeclared === "retain") {
		expectRetained({ saved, desired: timelineCase.desired, diff });
	}
	return { saved, diff };
};
