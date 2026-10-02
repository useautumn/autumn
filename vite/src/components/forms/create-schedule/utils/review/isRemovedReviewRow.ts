import type { ReviewChangeRow } from "./types/reviewChange";

/** A plan or balance that ends here; removed rows render dimmed wherever they appear. */
export const isRemovedReviewRow = (row: ReviewChangeRow) =>
	row.status === "ends" || row.status === "removed";
