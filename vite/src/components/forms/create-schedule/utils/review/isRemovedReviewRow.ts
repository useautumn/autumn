import type { ReviewChangeRow } from "./types/reviewChange";

export const isRemovedReviewRow = (row: ReviewChangeRow) =>
	row.status === "ends" || row.status === "removed";
