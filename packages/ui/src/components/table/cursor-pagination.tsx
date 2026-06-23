import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useHotkeys } from "react-hotkeys-hook";
import { IconButton } from "../general/icon-button";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
} from "../ui/pagination";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";

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
					<PaginationItem className="text-muted-foreground font-medium text-center tabular-nums">
						{totalPages === null ? "..." : `${currentPage} / ${totalPages}`}
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
	return (
		<Select
			value={pageSize.toString()}
			onValueChange={(value) => onChange(Number(value))}
			disabled={disabled}
			items={Object.fromEntries(
				options.map((size) => [size.toString(), size.toString()]),
			)}
		>
			<SelectTrigger className="h-7 w-fit px-2 text-xs">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{options.map((size) => (
					<SelectItem key={size} value={size.toString()}>
						{size}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
