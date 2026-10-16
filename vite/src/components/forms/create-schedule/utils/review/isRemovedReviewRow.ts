import type { SetPlansReviewRow } from "@autumn/shared";

/** A plan or balance that ends here; removed rows render dimmed wherever they appear. */
export const isRemovedReviewRow = (row: SetPlansReviewRow) =>
	row.status === "ends" || row.status === "removed";
