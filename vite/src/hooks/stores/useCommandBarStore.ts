import { create } from "zustand";

// Store state interface
interface CommandBarState {
	// Whether the command bar is open
	open: boolean;

	// Actions
	setOpen: (open: boolean) => void;
	openCommandBar: () => void;
	closeCommandBar: () => void;
	toggleCommandBar: () => void;
}

export const useCommandBarStore = create<CommandBarState>((set) => ({
	open: false,

	// Set the open state directly
	setOpen: (open) => {
		set({ open });
	},

	// Open the command bar
	openCommandBar: () => {
		set({ open: true });
	},

	// Close the command bar
	closeCommandBar: () => {
		set({ open: false });
	},

	// Toggle the command bar
	toggleCommandBar: () => {
		set((state) => ({ open: !state.open }));
	},
}));

// Convenience selector for checking if command bar is open
const useIsCommandBarOpen = () => useCommandBarStore((s) => s.open);
