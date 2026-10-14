import { create } from "zustand";
import { persist } from "zustand/middleware";

export type LeafPanelMode = "docked" | "expanded";

interface LeafPanelState {
	open: boolean;
	mode: LeafPanelMode;
	threadId: string;
	threadStarted: boolean;

	openPanel: () => void;
	closePanel: () => void;
	togglePanel: () => void;
	setMode: (mode: LeafPanelMode) => void;
	markThreadStarted: () => void;
	newThread: () => void;
	openThread: (threadId: string) => void;
}

export const useLeafPanelStore = create<LeafPanelState>()(
	persist(
		(set) => ({
			open: false,
			mode: "docked",
			threadId: crypto.randomUUID(),
			threadStarted: false,

			openPanel: () => set({ open: true }),
			closePanel: () => set({ open: false }),
			togglePanel: () => set((s) => ({ open: !s.open })),
			setMode: (mode) => set({ mode }),
			markThreadStarted: () => set({ threadStarted: true }),
			newThread: () =>
				set({ threadId: crypto.randomUUID(), threadStarted: false }),
			openThread: (threadId) => set({ threadId, threadStarted: true }),
		}),
		{
			name: "leaf-panel-store",
			partialize: (s) => ({
				mode: s.mode,
				threadId: s.threadId,
				threadStarted: s.threadStarted,
			}),
		},
	),
);
