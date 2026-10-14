import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const hasSubmitShortcutModifier = (event: {
	metaKey: boolean;
	ctrlKey: boolean;
}) => event.metaKey || event.ctrlKey;

export const getMetaKey = () =>
	navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl";
