import { Box } from "ink";
import { useMemo } from "react";
import { useVisibleRowCount } from "../../../../lib/hooks/useVisibleRowCount.js";
import { TableHeader, TableRow } from "./TableRow.js";
import type { Column } from "./index.js";

export interface DataTableProps<T> {
	data: T[];
	columns: Column<T>[];
	selectedIndex: number;
	onSelect: (item: T, index: number) => void;
	isFocused: boolean;
	keyExtractor: (item: T) => string;
	reservedWidth?: number;
	searchOpen?: boolean;
}

const TABLE_OVERHEAD = 6;
const MIN_COLUMN_WIDTH = 8;
const SAMPLE_SIZE = 50;

function calculateColumnWidths<T>(
	data: T[],
	columns: Column<T>[],
	terminalWidth: number,
	reservedWidth: number = 0,
): number[] {
	const columnMargins = Math.max(0, columns.length - 1);
	const markerWidth = 2;
	const availableWidth =
		terminalWidth - TABLE_OVERHEAD - reservedWidth - columnMargins - markerWidth;

	const sampleData = data.slice(0, SAMPLE_SIZE);

	const maxWidths = columns.map((column) => {
		let maxLen = column.header.length;

		for (const item of sampleData) {
			const content = column.render(item, false);
			if (typeof content === "string") {
				maxLen = Math.max(maxLen, content.length);
			}
		}

		if (column.minWidth) {
			maxLen = Math.max(maxLen, column.minWidth);
		}

		return maxLen;
	});

	const totalContentWidth = maxWidths.reduce((sum, w) => sum + w, 0);

	if (totalContentWidth <= availableWidth) {
		return maxWidths;
	}

	const ratio = availableWidth / totalContentWidth;

	return maxWidths.map((width) => {
		const proportionalWidth = Math.floor(width * ratio);
		return Math.max(MIN_COLUMN_WIDTH, proportionalWidth);
	});
}

function calculateVisibleWindow(
	totalItems: number,
	selectedIndex: number,
	visibleCount: number,
): { start: number; end: number } {
	if (totalItems <= visibleCount) {
		return { start: 0, end: totalItems };
	}

	const halfWindow = Math.floor(visibleCount / 2);
	
	let start = selectedIndex - halfWindow;
	let end = start + visibleCount;

	if (start < 0) {
		start = 0;
		end = visibleCount;
	} else if (end > totalItems) {
		end = totalItems;
		start = Math.max(0, end - visibleCount);
	}

	return { start, end };
}

export function DataTable<T>({
	data,
	columns,
	selectedIndex,
	onSelect,
	isFocused,
	keyExtractor,
	reservedWidth = 0,
	searchOpen = false,
}: DataTableProps<T>) {
	const visibleRowCount = useVisibleRowCount({ searchOpen });

	const columnWidths = useMemo(
		() => calculateColumnWidths(data, columns, process.stdout.columns ?? 80, reservedWidth),
		[data, columns, reservedWidth],
	);

	const { start, end } = useMemo(
		() => calculateVisibleWindow(data.length, selectedIndex, visibleRowCount),
		[data.length, selectedIndex, visibleRowCount],
	);

	const visibleData = data.slice(start, end);

	return (
		<Box flexDirection="column" flexGrow={1}>
			<TableHeader columns={columns} columnWidths={columnWidths} />
			<Box flexDirection="column">
				{visibleData.map((item, visibleIndex) => {
					const actualIndex = start + visibleIndex;
					return (
						<TableRow
							key={keyExtractor(item)}
							item={item}
							columns={columns}
							isSelected={actualIndex === selectedIndex}
							isFocused={isFocused}
							columnWidths={columnWidths}
						/>
					);
				})}
			</Box>
		</Box>
	);
}
