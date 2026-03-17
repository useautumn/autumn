import { Box } from "ink";
import { useMemo } from "react";
import { useVisibleRowCount } from "../../../../lib/hooks/useVisibleRowCount.js";
import { TableHeader, TableRow } from "./TableRow.js";
import type { Column } from "./index.js";

/**
 * Props for the DataTable component
 */
export interface DataTableProps<T> {
	/** Data items to display */
	data: T[];
	/** Column definitions */
	columns: Column<T>[];
	/** Currently selected row index */
	selectedIndex: number;
	/** Callback when row is selected */
	onSelect: (item: T, index: number) => void;
	/** Whether the table has focus */
	isFocused: boolean;
	/** Function to get unique key for each item */
	keyExtractor: (item: T) => string;
	/** Optional: reserved width for adjacent elements (like sidebar) */
	reservedWidth?: number;
	/** Whether search input is currently open (affects visible row calculation) */
	searchOpen?: boolean;
}

// Row overhead: marker (2) + column margins (1 per column after first)
// Table overhead: border left (1) + border right (1) + paddingX (2) = 4
const TABLE_OVERHEAD = 6;
const MIN_COLUMN_WIDTH = 8;
const SAMPLE_SIZE = 50;

/**
 * Calculate column widths based on actual data content.
 * Shows full content by default, only truncates if total row width exceeds available space.
 */
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

/**
 * Calculate the visible window of items based on selected index.
 * Keeps the selected item visible and scrolls the window as needed.
 */
function calculateVisibleWindow(
	totalItems: number,
	selectedIndex: number,
	visibleCount: number,
): { start: number; end: number } {
	if (totalItems <= visibleCount) {
		// All items fit - show everything
		return { start: 0, end: totalItems };
	}

	// Calculate window that keeps selected item visible
	// Try to keep selected item in the middle when possible
	const halfWindow = Math.floor(visibleCount / 2);
	
	let start = selectedIndex - halfWindow;
	let end = start + visibleCount;

	// Clamp to valid range
	if (start < 0) {
		start = 0;
		end = visibleCount;
	} else if (end > totalItems) {
		end = totalItems;
		start = Math.max(0, end - visibleCount);
	}

	return { start, end };
}

/**
 * Generic data table component with dynamic windowed rendering.
 * 
 * Instead of relying on ink-scroll-list for virtualization (which doesn't work well),
 * we calculate how many rows fit in the terminal and render only that window of data.
 * The window shifts as the user navigates to keep the selected item visible.
 */
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
	// Calculate how many rows can fit
	const visibleRowCount = useVisibleRowCount({ searchOpen });

	// Calculate column widths
	const columnWidths = useMemo(
		() => calculateColumnWidths(data, columns, process.stdout.columns ?? 80, reservedWidth),
		[data, columns, reservedWidth],
	);

	// Calculate which slice of data to show
	const { start, end } = useMemo(
		() => calculateVisibleWindow(data.length, selectedIndex, visibleRowCount),
		[data.length, selectedIndex, visibleRowCount],
	);

	// Get the visible slice
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
