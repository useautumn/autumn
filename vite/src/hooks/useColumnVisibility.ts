import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import { useEffect, useState } from "react";

const STORAGE_PREFIX = "autumn:table-columns:";

type StoredColumnValue = boolean | { visible: boolean; name: string };
type StoredVisibility = Record<string, StoredColumnValue>;

export interface ColumnMeta {
	visible: boolean;
	name?: string;
}

function loadFromStorage(storageKey: string): StoredVisibility | null {
	try {
		const saved = localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);
		if (saved) {
			return JSON.parse(saved) as StoredVisibility;
		}
	} catch {
		// Ignore errors
	}
	return null;
}

/** Parse stored value to get visibility boolean */
function getVisibility(value: StoredColumnValue): boolean {
	return typeof value === "boolean" ? value : value.visible;
}

/** Parse stored value to get column meta (visibility + optional name) */
export function getColumnMeta(
	stored: StoredVisibility,
	columnId: string,
): ColumnMeta | null {
	const value = stored[columnId];
	if (value === undefined) return null;

	if (typeof value === "boolean") {
		return { visible: value };
	}
	return { visible: value.visible, name: value.name };
}

/** Get all visible usage columns with their names from storage */
export function getVisibleUsageColumnsFromStorage(
	storageKey: string,
): Array<{ featureId: string; featureName: string }> {
	const stored = loadFromStorage(storageKey);
	if (!stored) return [];

	return Object.entries(stored)
		.filter(([key, value]) => key.startsWith("usage_") && getVisibility(value))
		.map(([key, value]) => {
			const featureId = key.replace("usage_", "");
			const name = typeof value === "object" ? value.name : featureId;
			return { featureId, featureName: name };
		});
}

/** Defines a group of columns to be rendered together in a submenu */
export interface ColumnGroup {
	key: string;
	label: string;
	columnIds: string[];
}

interface UseColumnVisibilityOptions<T> {
	columns: ColumnDef<T, unknown>[];
	defaultVisibleColumnIds: string[];
	storageKey?: string;
	columnGroups?: ColumnGroup[];
}

export function useColumnVisibility<T>({
	columns,
	defaultVisibleColumnIds,
	storageKey,
	columnGroups = [],
}: UseColumnVisibilityOptions<T>) {
	// Load from localStorage, converting to simple visibility state
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
		() => {
			const stored = storageKey ? loadFromStorage(storageKey) : null;
			if (!stored) return {};

			// Convert stored format to simple visibility state
			const visibility: VisibilityState = {};
			for (const [key, value] of Object.entries(stored)) {
				visibility[key] = getVisibility(value);
			}
			return visibility;
		},
	);

	// Add defaults for any columns not yet in visibility state
	useEffect(() => {
		setColumnVisibility((prev) => {
			let hasNewColumns = false;
			const updated = { ...prev };

			for (const col of columns) {
				if (col.id && !(col.id in prev)) {
					hasNewColumns = true;
					updated[col.id] = defaultVisibleColumnIds.includes(col.id);
				}
			}

			return hasNewColumns ? updated : prev;
		});
	}, [columns, defaultVisibleColumnIds]);

	const hasExtraVisibleColumns = Object.entries(columnVisibility).some(
		([key, visible]) => !defaultVisibleColumnIds.includes(key) && visible,
	);

	return {
		columnVisibility,
		setColumnVisibility,
		hasExtraVisibleColumns,
		columnGroups,
	};
}
