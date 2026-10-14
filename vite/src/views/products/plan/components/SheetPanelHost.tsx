import { create } from "zustand";
import { InlineSheetPanel } from "@/components/v2/sheets/InlineSheetPanel";
import { SHEET_ANIMATION } from "../planAnimations";

interface SheetPanelState {
	target: HTMLElement | null;
	setTarget: (target: HTMLElement | null) => void;
	active: { id: string; close: () => void } | null;
	activate: (entry: { id: string; close: () => void }) => void;
	deactivate: (id: string) => void;
}

const useSheetPanelStore = create<SheetPanelState>((set, get) => ({
	target: null,
	setTarget: (target) => set({ target }),
	active: null,
	activate: (entry) => {
		const previous = get().active;
		if (previous && previous.id !== entry.id) previous.close();
		set({ active: entry });
	},
	deactivate: (id) => set((s) => (s.active?.id === id ? { active: null } : s)),
}));

export const useSheetPanelTarget = () => useSheetPanelStore((s) => s.target);

export const useIsActiveSheetOwner = (editorId: string) =>
	useSheetPanelStore((s) => s.active?.id === editorId);

export const useSheetPanelActivation = () => ({
	activate: useSheetPanelStore((s) => s.activate),
	deactivate: useSheetPanelStore((s) => s.deactivate),
});

export function SheetPanelHost() {
	const setTarget = useSheetPanelStore((s) => s.setTarget);
	const active = useSheetPanelStore((s) => s.active);

	return (
		<InlineSheetPanel
			isOpen={active !== null}
			onClose={() => active?.close()}
			transition={SHEET_ANIMATION}
		>
			<div ref={setTarget} className="w-full h-full" />
		</InlineSheetPanel>
	);
}
