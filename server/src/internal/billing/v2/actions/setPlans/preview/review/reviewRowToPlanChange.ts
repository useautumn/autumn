import { CusProductStatus } from "@autumn/shared";
import type { CustomerProductTransition } from "@/internal/billing/v2/actions/buildBillingChanges/buildCustomerPlanChanges/buildCustomerPlanChange";
import {
	type ReviewRowLookup,
	reviewSegmentCustomerProduct,
} from "./reviewSegmentCustomerProduct";
import type { ReviewPlanRow } from "./types/reviewPhase";

/** The before/after rows plan_changes reads for one review row; a kept plan reports nothing. */
export const reviewRowToPlanChange = ({
	row,
	lookup,
}: {
	row: ReviewPlanRow;
	lookup: ReviewRowLookup;
}): CustomerProductTransition[] => {
	const before =
		"before" in row
			? reviewSegmentCustomerProduct({ reviewSegment: row.before, lookup })
			: undefined;
	const after =
		"after" in row
			? reviewSegmentCustomerProduct({ reviewSegment: row.after, lookup })
			: undefined;

	switch (row.status) {
		case "starts":
			return after ? [{ before: null, after }] : [];
		case "ends":
			return before
				? [{ before, after: { ...before, status: CusProductStatus.Expired } }]
				: [];
		case "updated":
			return before && after ? [{ before, after }] : [];
		case "kept":
			return [];
		default: {
			const unreachable: never = row;
			return unreachable;
		}
	}
};
