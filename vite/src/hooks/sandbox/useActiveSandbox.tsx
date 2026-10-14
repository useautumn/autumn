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

export const setActiveSandbox = (sandbox: ActiveSandbox | null) => {
	current = sandbox;
	try {
		if (sandbox) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(sandbox));
		} else {
			localStorage.removeItem(STORAGE_KEY);
		}
	} catch {}
	for (const listener of listeners) {
		listener();
	}
};

export const subscribeActiveSandbox = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export const getActiveSandbox = () => current;

export const useActiveSandbox = () =>
	useSyncExternalStore(subscribeActiveSandbox, getActiveSandbox);
