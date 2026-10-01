import type { FullCusProduct, FullCustomer } from "@autumn/shared";
import type { SavedSegment } from "../../timeline/types/timelineSegment";
import type { ReviewSegment } from "./types/reviewPhase";

/** Saved segments live on the customer's rows; resolved ones on the rows after the plan runs. */
export type ReviewRowLookup = {
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

export const savedRowAt = ({
	segment,
	at,
}: {
	segment: SavedSegment;
	at: number;
}) =>
	[...segment.rows].reverse().find((row) => row.startsAt <= at) ??
	segment.rows[0];

/** The row a review segment runs on, carrying the end the timeline gives it. */
export const reviewSegmentCustomerProduct = ({
	reviewSegment,
	lookup,
}: {
	reviewSegment: ReviewSegment;
	lookup: ReviewRowLookup;
}): FullCusProduct | undefined => {
	const row =
		reviewSegment.source === "saved"
			? findRow({
					fullCustomer: lookup.originalFullCustomer,
					customerProductId: savedRowAt({
						segment: reviewSegment.segment,
						at: reviewSegment.at,
					})?.customerProductId,
				})
			: findRow({
					fullCustomer: lookup.finalFullCustomer,
					customerProductId: lookup.customerProductIdBySegmentId.get(
						reviewSegment.segment.id,
					),
				});
	return row ? { ...row, ended_at: reviewSegment.segment.endsAt } : undefined;
};
