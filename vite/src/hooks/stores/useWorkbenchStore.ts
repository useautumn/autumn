import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkbenchMethod =
	| "all"
	| "GET"
	| "POST"
	| "PUT"
	| "PATCH"
	| "DELETE";
export type WorkbenchStatus = "all" | "2xx" | "4xx" | "5xx";

export const WORKBENCH_MIN_HEIGHT = 200;
export const WORKBENCH_MAX_HEIGHT_RATIO = 0.92;
export const WORKBENCH_DEFAULT_HEIGHT = 360;

interface WorkbenchFilters {
	method: WorkbenchMethod;
	status: WorkbenchStatus;
	search: string;
}

interface WorkbenchState {
	isOpen: boolean;
	height: number;
	filters: WorkbenchFilters;
	selectedLogId: string | null;

	open: () => void;
	close: () => void;
	toggle: () => void;
	setHeight: (height: number) => void;
	setFilters: (filters: Partial<WorkbenchFilters>) => void;
	setSelectedLogId: (id: string | null) => void;
}

const DEFAULT_FILTERS: WorkbenchFilters = {
	method: "all",
	status: "all",
	search: "",
};

export const useWorkbenchStore = create<WorkbenchState>()(
	persist(
		(set) => ({
			isOpen: false,
			height: WORKBENCH_DEFAULT_HEIGHT,
			filters: DEFAULT_FILTERS,
			selectedLogId: null,

			open: () => set({ isOpen: true }),
			close: () => set({ isOpen: false }),
			toggle: () => set((s) => ({ isOpen: !s.isOpen })),
			setHeight: (height) => set({ height }),
			setFilters: (filters) =>
				set((s) => ({ filters: { ...s.filters, ...filters } })),
			setSelectedLogId: (id) => set({ selectedLogId: id }),
		}),
		{
			name: "workbench-store",
			partialize: (s) => ({ height: s.height }),
		},
	),
);
