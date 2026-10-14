export interface PaginationInfo {
	text: string;
	canGoPrev: boolean;
	canGoNext: boolean;
}

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
			text = "Page 1 (only)";
			canGoNext = false;
		} else if (hasMore) {
			text = "Page 1";
			canGoNext = true;
		} else {
			text = "Page 1 (only)";
			canGoNext = false;
		}
	} else {
		if (hasMore) {
			text = `Page ${page} of many`;
			canGoNext = true;
		} else {
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
