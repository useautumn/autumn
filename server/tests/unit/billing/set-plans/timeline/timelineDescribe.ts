import type { ReviewRows } from "@/internal/billing/v2/actions/setPlans/preview/review/timelineToReviewRows";
import type { ReviewPlanRow } from "@/internal/billing/v2/actions/setPlans/preview/review/types/reviewPhase";
import type { TimelineDiff } from "@/internal/billing/v2/actions/setPlans/timeline/types/timelineDiff";
import { B, B2, C, NOW } from "./timelineFixtures";

const MOMENT_NAMES = new Map<number, string>([
	[NOW, "now"],
	[B, "B"],
	[B2, "B2"],
	[C, "C"],
]);

const momentName = (at: number | null) =>
	at === null ? "never" : (MOMENT_NAMES.get(at) ?? String(at));

const rowConfig = (row: ReviewPlanRow) => {
	switch (row.status) {
		case "starts":
			return row.after.segment.configHash;
		case "ends":
			return row.before.segment.configHash;
		case "updated":
			return `${row.before.segment.configHash}->${row.after.segment.configHash}`;
		case "kept":
			return row.after.segment.configHash;
		default: {
			const unreachable: never = row;
			return unreachable;
		}
	}
};

/** Review rows as `phase:status:config`, removed phases as `phase:removed:config`, sorted. */
export const describeReview = (review: ReviewRows) =>
	[
		...review.phases.flatMap(({ at, rows }) =>
			rows.map((row) => `${momentName(at)}:${row.status}:${rowConfig(row)}`),
		),
		...review.removedPhases.flatMap(({ at, rows }) =>
			rows.map((row) => `${momentName(at)}:removed:${rowConfig(row)}`),
		),
	].sort();

/** Row writes as `type:id[:end]`, keeps left out, sorted. */
export const describeOperations = (diff: TimelineDiff) =>
	diff.operations
		.flatMap((operation) => {
			switch (operation.type) {
				case "keep":
					return [];
				case "retime":
					return [
						`retime:${operation.customerProductId}:${momentName(operation.endsAt)}`,
					];
				case "expire":
				case "delete":
					return [`${operation.type}:${operation.customerProductId}`];
				case "insert": {
					const segment = diff.timeline.find(
						({ id }) => id === operation.segmentId,
					);
					return [
						`insert:${segment?.configHash}:${momentName(segment?.startsAt ?? null)}-${momentName(segment?.endsAt ?? null)}`,
					];
				}
				default: {
					const unreachable: never = operation;
					return unreachable;
				}
			}
		})
		.sort();
