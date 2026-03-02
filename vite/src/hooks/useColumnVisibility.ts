import type {
	ColumnDef,
	Updater,
	VisibilityState,
} from "@tanstack/react-table";
import { useCallback, useMemo, useRef, useState } from "react";

const STORAGE_PREFIX = "autumn:table-columns:";

type StoredColumnValue = boolean | { visible: boolean; name: string };

function loadFromStorage(storageKey: string): VisibilityState | null {
	try {
		const saved = localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);
		if (!saved) return null;

		const parsed = JSON.parse(saved) as Record<string, StoredColumnValue>;
		const visibility: VisibilityState = {};
		for (const [key, value] of Object.entries(parsed)) {
			visibility[key] = typeof value === "boolean" ? value : value.visible;
		}
		return visibility;
	} catch {
		return null;
	}
}

/** Get all visible usage columns with their names from storage */
export function getVisibleUsageColumnsFromStorage({
	storageKey,
}: {
	storageKey: string;
}): Array<{ featureId: string; featureName: string }> {
	try {
		const saved = localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);
		if (!saved) return [];

		const parsed = JSON.parse(saved) as Record<string, StoredColumnValue>;
		return Object.entries(parsed)
			.filter(
				([key, value]) =>
					key.startsWith("usage_") &&
					(typeof value === "boolean" ? value : value.visible),
			)
			.map(([key, value]) => {
				const featureId = key.replace("usage_", "");
				const name =
					typeof value === "object" ? value.name : featureId;
				return { featureId, featureName: name };
			});
	} catch {
		return [];
	}
}

function saveToStorage(storageKey: string, state: VisibilityState): void {
	try {
		localStorage.setItem(
			`${STORAGE_PREFIX}${storageKey}`,
			JSON.stringify(state),
		);
	} catch {}
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
	const [savedVisibility, setSavedVisibility] = useState<VisibilityState>(
		() => {
			if (!storageKey) return {};
			return loadFromStorage(storageKey) ?? {};
		},
	);

	const [isDirty, setIsDirty] = useState(false);

	// Derive effective visibility synchronously — fills in defaults for any
	// column not yet in savedVisibility, so there's never a render frame where
	// new columns flash visible before being hidden by an async useEffect.
	const columnVisibility = useMemo(() => {
		const result: VisibilityState = {};
		for (const col of columns) {
			if (!col.id) continue;
			if (col.id in savedVisibility) {
				result[col.id] = savedVisibility[col.id];
			} else {
				result[col.id] = defaultVisibleColumnIds.includes(col.id);
			}
		}
		return result;
	}, [columns, savedVisibility, defaultVisibleColumnIds]);

	const columnVisibilityRef = useRef(columnVisibility);
	columnVisibilityRef.current = columnVisibility;

	// Only user-initiated changes (column toggles) flow through this setter,
	// so the dirty flag accurately reflects unsaved user intent.
	const setColumnVisibility = useCallback(
		(updaterOrValue: Updater<VisibilityState>) => {
			const newState =
				typeof updaterOrValue === "function"
					? updaterOrValue(columnVisibilityRef.current)
					: updaterOrValue;
			setSavedVisibility(newState);
			setIsDirty(true);
		},
		[],
	);

	const saveColumnVisibility = useCallback(() => {
		if (!storageKey) return;
		saveToStorage(storageKey, columnVisibilityRef.current);
		setIsDirty(false);
	}, [storageKey]);

	return {
		columnVisibility,
		setColumnVisibility,
		isDirty,
		saveColumnVisibility,
		columnGroups,
	};
}
