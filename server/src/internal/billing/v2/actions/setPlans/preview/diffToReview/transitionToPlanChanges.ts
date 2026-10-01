import { CusProductStatus } from "@autumn/shared";
import type { CustomerProductTransition } from "@/internal/billing/v2/actions/buildBillingChanges/buildCustomerPlanChanges/buildCustomerPlanChange";
import type {
	TimelineTransition,
	TransitionSide,
} from "../../timeline/types/timelineDiff";
import {
	sideCustomerProduct,
	type TransitionRowLookup,
} from "./transitionCustomerProducts";

const endingTransition = ({
	side,
	lookup,
}: {
	side: TransitionSide;
	lookup: TransitionRowLookup;
}): CustomerProductTransition[] => {
	const before = sideCustomerProduct({ side, lookup });
	return before
		? [{ before, after: { ...before, status: CusProductStatus.Expired } }]
		: [];
};

const startingTransition = ({
	side,
	lookup,
}: {
	side: TransitionSide;
	lookup: TransitionRowLookup;
}): CustomerProductTransition[] => {
	const after = sideCustomerProduct({ side, lookup });
	return after ? [{ before: null, after }] : [];
};

/** A kept plan only reports a change when the request moves its end. */
const retimedTransition = ({
	transition,
	lookup,
}: {
	transition: Extract<TimelineTransition, { kind: "continues" }>;
	lookup: TransitionRowLookup;
}): CustomerProductTransition[] => {
	if (transition.from.endsAt === transition.to.endsAt) return [];
	const before = sideCustomerProduct({ side: transition.from, lookup });
	const after = sideCustomerProduct({ side: transition.to, lookup });
	return before && after ? [{ before, after }] : [];
};

/** The before/after rows plan_changes reads, for the changes this request makes or keeps. */
export const transitionToPlanChanges = ({
	transition,
	lookup,
}: {
	transition: TimelineTransition;
	lookup: TransitionRowLookup;
}): CustomerProductTransition[] => {
	if (transition.origin === "withdrawn") return [];

	switch (transition.kind) {
		case "starts":
			return startingTransition({ side: transition.to, lookup });
		case "ends":
			return endingTransition({ side: transition.from, lookup });
		case "updated": {
			const before = sideCustomerProduct({ side: transition.from, lookup });
			const after = sideCustomerProduct({ side: transition.to, lookup });
			return before && after ? [{ before, after }] : [];
		}
		case "continues":
			return retimedTransition({ transition, lookup });
		default: {
			const unreachable: never = transition;
			return unreachable;
		}
	}
};
