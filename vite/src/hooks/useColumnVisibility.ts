import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";

interface UseColumnVisibilityOptions<T> {
	columns: ColumnDef<T, unknown>[];
	defaultVisibleColumnIds: string[];
}

/**
 * Hook to manage column visibility state with sensible defaults.
 * Columns in `defaultVisibleColumnIds` are shown by default, all others are hidden.
 * Handles dynamic columns by initializing visibility when new columns appear.
 */
export function useColumnVisibility<T>({
	columns,
	defaultVisibleColumnIds,
}: UseColumnVisibilityOptions<T>) {
	const initializedCols = useRef<Set<string>>(new Set());
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

	// Set visibility for new columns as they appear
	useEffect(() => {
		const newVisibilityState: VisibilityState = {};
		let hasNewColumns = false;

		for (const col of columns) {
			if (col.id && !initializedCols.current.has(col.id)) {
				// Show if in default list, hide otherwise
				newVisibilityState[col.id] = defaultVisibleColumnIds.includes(col.id);
				initializedCols.current.add(col.id);
				hasNewColumns = true;
			}
		}

		if (hasNewColumns) {
			setColumnVisibility((prev) => ({ ...prev, ...newVisibilityState }));
		}
	}, [columns, defaultVisibleColumnIds]);

	// Check if any non-default columns are visible
	const hasExtraVisibleColumns = useMemo(() => {
		return Object.entries(columnVisibility).some(
			([key, visible]) => !defaultVisibleColumnIds.includes(key) && visible,
		);
	}, [columnVisibility, defaultVisibleColumnIds]);

	return {
		columnVisibility,
		setColumnVisibility,
		hasExtraVisibleColumns,
	};
}
