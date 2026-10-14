import { create } from "zustand";

interface CommandBarState {
	open: boolean;

	setOpen: (open: boolean) => void;
	openCommandBar: () => void;
	closeCommandBar: () => void;
	toggleCommandBar: () => void;
}

export const useCommandBarStore = create<CommandBarState>((set) => ({
	open: false,

	setOpen: (open) => {
		set({ open });
	},

	openCommandBar: () => {
		set({ open: true });
	},

	closeCommandBar: () => {
		set({ open: false });
	},

	toggleCommandBar: () => {
		set((state) => ({ open: !state.open }));
	},
}));

const useIsCommandBarOpen = () => useCommandBarStore((s) => s.open);
