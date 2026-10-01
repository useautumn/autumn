import type {
	TimelineDiff,
	TimelineTransition,
	TransitionSide,
} from "@/internal/billing/v2/actions/setPlans/timeline/types/timelineDiff";
import { B, B2, C, NOW } from "./timelineFixtures";

const MOMENT_NAMES = new Map<number, string>([
	[NOW, "now"],
	[B, "B"],
	[B2, "B2"],
	[C, "C"],
]);

const momentName = (at: number | null) =>
	at === null ? "never" : (MOMENT_NAMES.get(at) ?? String(at));

const sideName = (side: TransitionSide) => side.configHash;

const transitionSides = (transition: TimelineTransition) => {
	switch (transition.kind) {
		case "starts":
			return sideName(transition.to);
		case "ends":
			return sideName(transition.from);
		case "updated":
		case "switches":
		case "continues":
			return `${sideName(transition.from)}->${sideName(transition.to)}`;
		default: {
			const unreachable: never = transition;
			return unreachable;
		}
	}
};

/** Transitions as `at:kind:origin:config`, sorted, for compact golden expectations. */
export const describeTransitions = (diff: TimelineDiff) =>
	diff.transitions
		.map(
			(transition) =>
				`${momentName(transition.at)}:${transition.kind}:${transition.origin}:${transitionSides(transition)}`,
		)
		.sort();

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
