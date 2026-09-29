import { IconButton } from "@autumn/ui/components/general/icon-button";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
} from "@autumn/ui/components/ui/pagination";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui/components/ui/select";
import { cn } from "@autumn/ui/lib/utils";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useHotkeys } from "react-hotkeys-hook";

const numberFormat = new Intl.NumberFormat("en-US");

export function CursorPagination({
	currentPage,
	totalPages,
	canGoPrev,
	canGoNext,
	onPrev,
	onNext,
	disabled = false,
	enableHotkeys = false,
}: {
	currentPage: number;
	totalPages: number | null;
	canGoPrev: boolean;
	canGoNext: boolean;
	onPrev: () => void;
	onNext: () => void;
	disabled?: boolean;
	enableHotkeys?: boolean;
}) {
	useHotkeys(
		"left",
		(e) => {
			if (!canGoPrev) return;
			e.preventDefault();
			onPrev();
		},
		{ enabled: enableHotkeys && canGoPrev },
	);

	useHotkeys(
		"right",
		(e) => {
			if (!canGoNext) return;
			e.preventDefault();
			onNext();
		},
		{ enabled: enableHotkeys && canGoNext },
	);

	const prevDisabled = disabled || !canGoPrev;
	const nextDisabled = disabled || !canGoNext;

	return (
		<Pagination className="w-fit shrink-0 select-none">
			<PaginationContent className="flex items-center gap-1 rounded-lg bg-foreground/4 p-px">
				<PaginationItem>
					<IconButton
						variant="muted"
						size="default"
						aria-label="Previous page"
						icon={<CaretLeftIcon size={12} weight="bold" />}
						onClick={(e) => {
							e.preventDefault();
							if (prevDisabled) return;
							onPrev();
						}}
						disabled={prevDisabled}
						className={cn(
							"size-7 rounded-md bg-transparent",
							prevDisabled && "pointer-events-none opacity-50",
						)}
					/>
				</PaginationItem>
				<PaginationItem className="min-w-[9ch] px-1.5 text-center text-xs text-tertiary-foreground tabular-nums whitespace-nowrap">
					{totalPages === null
						? "..."
						: `${numberFormat.format(currentPage)} / ${numberFormat.format(totalPages)}`}
				</PaginationItem>
				<PaginationItem>
					<IconButton
						variant="muted"
						size="default"
						aria-label="Next page"
						icon={<CaretRightIcon size={12} weight="bold" />}
						onClick={(e) => {
							e.preventDefault();
							if (nextDisabled) return;
							onNext();
						}}
						disabled={nextDisabled}
						className={cn(
							"size-7 rounded-md bg-foreground/4",
							nextDisabled && "pointer-events-none bg-transparent opacity-50",
						)}
					/>
				</PaginationItem>
			</PaginationContent>
		</Pagination>
	);
}

export function PageSizeSelector({
	pageSize,
	options,
	onChange,
	disabled = false,
}: {
	pageSize: number;
	options: readonly number[];
	onChange: (size: number) => void;
	disabled?: boolean;
}) {
	const widestOptionLength = Math.max(
		...options.map((size) => numberFormat.format(size).length),
	);

	return (
		<Select
			value={pageSize.toString()}
			onValueChange={(value) => onChange(Number(value))}
			disabled={disabled}
			items={Object.fromEntries(
				options.map((size) => [size.toString(), numberFormat.format(size)]),
			)}
		>
			<SelectTrigger
				className="h-7 w-fit justify-between rounded-lg border-transparent bg-foreground/4 px-2 text-xs tabular-nums shadow-none"
				style={{ minWidth: `calc(${widestOptionLength}ch + 1.75rem)` }}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{options.map((size) => (
					<SelectItem key={size} value={size.toString()}>
						{numberFormat.format(size)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
