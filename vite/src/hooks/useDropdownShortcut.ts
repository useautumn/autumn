import { useHotkeys } from "react-hotkeys-hook";

/**
 * Hook to toggle a dropdown open/closed with a keyboard shortcut
 */
export function useDropdownShortcut({
	shortcut,
	isOpen,
	setIsOpen,
	enabled = true,
}: {
	shortcut: string;
	isOpen: boolean;
	setIsOpen: (open: boolean) => void;
	enabled?: boolean;
}) {
	useHotkeys(
		shortcut,
		(e) => {
			e.preventDefault();
			setIsOpen(!isOpen);
		},
		{
			enabled,
			enableOnFormTags: false,
		},
	);
}

/**
 * Hook to trigger an action when a dropdown is open and a key is pressed
 */
function useMenuItemShortcut({
	shortcut,
	onTrigger,
	isMenuOpen,
	enabled = true,
}: {
	shortcut: string;
	onTrigger: () => void;
	isMenuOpen: boolean;
	enabled?: boolean;
}) {
	useHotkeys(
		shortcut,
		(e) => {
			e.preventDefault();
			onTrigger();
		},
		{
			enabled: enabled && isMenuOpen,
			enableOnFormTags: false,
		},
	);
}
