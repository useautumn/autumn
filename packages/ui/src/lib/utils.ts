import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Cmd/ctrl is reserved for sheet-level submit shortcuts (e.g. cmd+enter via
 * ShortcutButton), so focused toggles must not handle keys with it held.
 */
export const hasSubmitShortcutModifier = (event: {
	metaKey: boolean;
	ctrlKey: boolean;
}) => event.metaKey || event.ctrlKey;
