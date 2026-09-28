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
		<div className="flex justify-center items-center gap-2 text-xs text-tertiary-foreground shrink-0 select-none">
			<Pagination className="w-fit h-7 text-xs">
				<PaginationContent className="w-full flex justify-between items-center gap-2">
					{/* Fixed width fits "999,999 / 999,999" so loading or paging never pushes the toolbar. */}
					<PaginationItem className="w-[17ch] text-right text-muted-foreground font-medium tabular-nums whitespace-nowrap">
						{totalPages === null
							? "..."
							: `${numberFormat.format(currentPage)} / ${numberFormat.format(totalPages)}`}
					</PaginationItem>
					<PaginationItem>
						<IconButton
							variant="secondary"
							size="default"
							icon={<CaretLeftIcon size={12} weight="bold" />}
							onClick={(e) => {
								e.preventDefault();
								if (prevDisabled) return;
								onPrev();
							}}
							disabled={prevDisabled}
							className={prevDisabled ? "pointer-events-none opacity-50" : ""}
						/>
					</PaginationItem>
					<PaginationItem>
						<IconButton
							variant="secondary"
							size="default"
							icon={<CaretRightIcon size={12} weight="bold" />}
							onClick={(e) => {
								e.preventDefault();
								if (nextDisabled) return;
								onNext();
							}}
							disabled={nextDisabled}
							className={nextDisabled ? "pointer-events-none opacity-50" : ""}
						/>
					</PaginationItem>
				</PaginationContent>
			</Pagination>
		</div>
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
				className="h-7 w-fit justify-between px-2 text-xs tabular-nums"
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
