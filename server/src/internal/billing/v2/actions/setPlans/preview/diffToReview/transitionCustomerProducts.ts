import type { FullCusProduct, FullCustomer } from "@autumn/shared";
import type {
	TimelineTransition,
	TransitionSide,
} from "../../timeline/types/timelineDiff";

/** Where a transition side's customer product lives: the saved rows, or the rows after the plan runs. */
export type TransitionRowLookup = {
	originalFullCustomer: FullCustomer;
	finalFullCustomer: FullCustomer;
	customerProductIdBySegmentId: Map<string, string>;
};

const findRow = ({
	fullCustomer,
	customerProductId,
}: {
	fullCustomer: FullCustomer;
	customerProductId?: string;
}) =>
	customerProductId === undefined
		? undefined
		: fullCustomer.customer_products.find(({ id }) => id === customerProductId);

/** The row a side runs on, carrying the end the timeline gives it. */
export const sideCustomerProduct = ({
	side,
	lookup,
}: {
	side: TransitionSide;
	lookup: TransitionRowLookup;
}): FullCusProduct | undefined => {
	const row =
		side.ref.source === "saved"
			? findRow({
					fullCustomer: lookup.originalFullCustomer,
					customerProductId: side.ref.customerProductId,
				})
			: findRow({
					fullCustomer: lookup.finalFullCustomer,
					customerProductId: lookup.customerProductIdBySegmentId.get(
						side.ref.segmentId,
					),
				});
	return row ? { ...row, ended_at: side.endsAt } : undefined;
};

/** The side a review row is about: what runs after the boundary, or what ends at it. */
export const transitionSubject = (
	transition: TimelineTransition,
): TransitionSide => {
	switch (transition.kind) {
		case "starts":
		case "updated":
		case "switches":
		case "continues":
			return transition.to;
		case "ends":
			return transition.from;
		default: {
			const unreachable: never = transition;
			return unreachable;
		}
	}
};

/** The side the subject replaces or continues from, if any. */
export const transitionPredecessor = (
	transition: TimelineTransition,
): TransitionSide | undefined => {
	switch (transition.kind) {
		case "starts":
		case "ends":
			return undefined;
		case "updated":
		case "switches":
		case "continues":
			return transition.from;
		default: {
			const unreachable: never = transition;
			return unreachable;
		}
	}
};
