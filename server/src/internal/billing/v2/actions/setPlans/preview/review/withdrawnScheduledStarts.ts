import type { FullCusProduct, FullCustomer } from "@autumn/shared";
import type { SavedTimeline } from "../../timeline/types/timeline";
import type { TimelineDiff } from "../../timeline/types/timelineDiff";
import type { SavedSegment } from "../../timeline/types/timelineSegment";

const isStillScheduled = ({
	savedSegment,
	diff,
}: {
	savedSegment: SavedSegment;
	diff: TimelineDiff;
}) =>
	diff.timeline.some(
		(segment) =>
			segment.key === savedSegment.key &&
			(segment.endsAt === null || segment.endsAt > savedSegment.startsAt),
	);

export const withdrawnScheduledStarts = ({
	saved,
	diff,
	originalFullCustomer,
}: {
	saved: SavedTimeline;
	diff: TimelineDiff;
	originalFullCustomer: FullCustomer;
}): FullCusProduct[] =>
	saved.segments
		.filter(
			(savedSegment) =>
				savedSegment.startsAt > diff.now &&
				!isStillScheduled({ savedSegment, diff }),
		)
		.flatMap((savedSegment) => {
			const customerProduct = originalFullCustomer.customer_products.find(
				({ id }) => id === savedSegment.rows[0]?.customerProductId,
			);
			return customerProduct ? [customerProduct] : [];
		});
