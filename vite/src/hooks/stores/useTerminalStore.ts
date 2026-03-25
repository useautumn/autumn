import { create } from "zustand";

interface TerminalState {
	open: boolean;
	setOpen: (open: boolean) => void;
	openTerminal: () => void;
	closeTerminal: () => void;
	toggleTerminal: () => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
	open: false,

	setOpen: (open) => set({ open }),
	openTerminal: () => set({ open: true }),
	closeTerminal: () => set({ open: false }),
	toggleTerminal: () => set((state) => ({ open: !state.open })),
}));
