import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_PREFIX = "autumn:table-columns:";

function loadVisibilityFromStorage(storageKey: string): VisibilityState | null {
	try {
		const saved = localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);
		if (saved) {
			return JSON.parse(saved) as VisibilityState;
		}
	} catch {
		// Ignore errors
	}
	return null;
}

interface UseColumnVisibilityOptions<T> {
	columns: ColumnDef<T, unknown>[];
	defaultVisibleColumnIds: string[];
	storageKey?: string;
}

/**
 * Hook to manage column visibility state with sensible defaults.
 * Columns in `defaultVisibleColumnIds` are shown by default, all others are hidden.
 * Handles dynamic columns by initializing visibility when new columns appear.
 * If storageKey is provided, loads saved visibility from localStorage synchronously.
 */
export function useColumnVisibility<T>({
	columns,
	defaultVisibleColumnIds,
	storageKey,
}: UseColumnVisibilityOptions<T>) {
	const initializedCols = useRef<Set<string>>(new Set());

	// Load initial visibility from localStorage synchronously (no flash)
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
		() => {
			if (storageKey) {
				const saved = loadVisibilityFromStorage(storageKey);
				if (saved) {
					// Mark saved columns as initialized
					for (const colId of Object.keys(saved)) {
						initializedCols.current.add(colId);
					}
					return saved;
				}
			}
			return {};
		},
	);

	// Set visibility for new columns as they appear
	useEffect(() => {
		setColumnVisibility((prev) => {
			const newVisibilityState: VisibilityState = {};
			let hasNewColumns = false;

			for (const col of columns) {
				if (col.id && !initializedCols.current.has(col.id)) {
					// Only set default visibility if not already set (avoids overriding explicit visibility)
					if (!(col.id in prev)) {
						newVisibilityState[col.id] = defaultVisibleColumnIds.includes(
							col.id,
						);
					}
					initializedCols.current.add(col.id);
					hasNewColumns = true;
				}
			}

			if (hasNewColumns && Object.keys(newVisibilityState).length > 0) {
				return { ...prev, ...newVisibilityState };
			}
			return prev;
		});
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
