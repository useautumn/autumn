import { IconButton } from "@autumn/ui";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

/** Compact "start–end of total" pager for sheet lists. */
export function SheetPaginationControls({
	rangeStart,
	rangeEnd,
	total,
	canPrev,
	canNext,
	onPrev,
	onNext,
}: {
	rangeStart: number;
	rangeEnd: number;
	total: number;
	canPrev: boolean;
	canNext: boolean;
	onPrev: () => void;
	onNext: () => void;
}) {
	return (
		<div className="flex items-center justify-between pt-3">
			<span className="text-xs text-tertiary-foreground tabular-nums">
				{rangeStart}–{rangeEnd} of {total}
			</span>
			<div className="flex items-center gap-1">
				<IconButton
					aria-label="Previous page"
					icon={<CaretLeftIcon size={14} />}
					iconOrientation="center"
					variant="secondary"
					size="sm"
					disabled={!canPrev}
					onClick={onPrev}
				/>
				<IconButton
					aria-label="Next page"
					icon={<CaretRightIcon size={14} />}
					iconOrientation="center"
					variant="secondary"
					size="sm"
					disabled={!canNext}
					onClick={onNext}
				/>
			</div>
		</div>
	);
}
