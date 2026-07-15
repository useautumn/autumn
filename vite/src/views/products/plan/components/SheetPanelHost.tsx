import { create } from "zustand";
import { InlineSheetPanel } from "@/components/v2/sheets/InlineSheetPanel";
import { SHEET_ANIMATION } from "../planAnimations";

/**
 * Shared sheet host. The plan editor and every inline license editor render
 * their sheet *content* into this single, always-mounted panel, so switching the
 * active sheet between the plan and a license swaps the panel's content instead
 * of unmounting one panel and mounting another. Mount exactly once at the page
 * level.
 *
 * Flow: the host publishes its inner content node (`target`). The editor whose
 * sheet is open registers itself as `active` (its close handler) and portals its
 * content into `target`. Only one sheet is ever open, so there's one active
 * editor at a time; the panel opens whenever an editor is active.
 */
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
		// Only one editor owns the sheet at a time: opening one closes the other
		// (e.g. switching from a plan feature to a license feature), so their
		// content never portals into the shared panel simultaneously.
		if (previous && previous.id !== entry.id) previous.close();
		set({ active: entry });
	},
	deactivate: (id) => set((s) => (s.active?.id === id ? { active: null } : s)),
}));

/** The DOM node an active editor portals its sheet content into. */
export const useSheetPanelTarget = () => useSheetPanelStore((s) => s.target);

/** Whether the given editor currently owns the shared panel. Only the owner
 * portals its content, so two editors never write into the panel at once even
 * during the one render between a switch and the loser's deactivation effect. */
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
