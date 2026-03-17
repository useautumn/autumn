/**
 * Pagination display information
 */
export interface PaginationInfo {
	/** Display text for the page indicator */
	text: string;
	/** Can navigate to previous page */
	canGoPrev: boolean;
	/** Can navigate to next page */
	canGoNext: boolean;
}

/**
 * Calculate pagination display information based on current page state.
 *
 * @param page - Current page number (1-indexed)
 * @param itemCount - Number of items on the current page
 * @param pageSize - Maximum items per page
 * @param hasMore - Whether API indicates more items exist
 * @returns Pagination display info with text and navigation flags
 */
export function getPaginationDisplay(
	page: number,
	itemCount: number,
	pageSize: number,
	hasMore: boolean,
): PaginationInfo {
	let text: string;
	let canGoNext: boolean;

	if (page === 1) {
		if (itemCount < pageSize) {
			// Certain: no more pages
			text = "Page 1 (only)";
			canGoNext = false;
		} else if (hasMore) {
			// Full page with more available
			text = "Page 1";
			canGoNext = true;
		} else {
			// Full page but no more (edge case)
			text = "Page 1 (only)";
			canGoNext = false;
		}
	} else {
		if (hasMore) {
			// Certain: more exists
			text = `Page ${page} of many`;
			canGoNext = true;
		} else {
			// Certain: end reached
			text = `Page ${page} (last)`;
			canGoNext = false;
		}
	}

	return {
		text,
		canGoPrev: page > 1,
		canGoNext,
	};
}
