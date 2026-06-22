import { useSyncExternalStore } from "react";

export type ActiveSandbox = {
	id: string;
	name: string;
	color?: string;
	icon?: string;
};

const STORAGE_KEY = "autumn_active_sandbox";
const listeners = new Set<() => void>();

const read = (): ActiveSandbox | null => {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as ActiveSandbox) : null;
	} catch {
		return null;
	}
};

let current: ActiveSandbox | null = read();

/** Select (or clear) the active sandbox sub-org. Persists across reloads and
 *  notifies subscribers (the axios layer + the switcher) so requests start
 *  carrying the `x-sandbox-org-id` resolver tag. */
export const setActiveSandbox = (sandbox: ActiveSandbox | null) => {
	current = sandbox;
	if (sandbox) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(sandbox));
	} else {
		localStorage.removeItem(STORAGE_KEY);
	}
	for (const listener of listeners) {
		listener();
	}
};

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

const getSnapshot = () => current;

export const useActiveSandbox = () =>
	useSyncExternalStore(subscribe, getSnapshot);
