import { beforeEach, describe, expect, test } from "bun:test";

// useActiveSandbox touches localStorage at module load and on every write, and
// bun:test has no DOM. Stub it so we can simulate storage being unavailable
// (private-mode webview, disabled storage, quota exceeded).
const storage = { throwOnWrite: false, store: new Map<string, string>() };

globalThis.localStorage = {
	getItem: (k: string) => storage.store.get(k) ?? null,
	setItem: (k: string, v: string) => {
		if (storage.throwOnWrite) {
			throw new Error("storage unavailable");
		}
		storage.store.set(k, v);
	},
	removeItem: (k: string) => {
		if (storage.throwOnWrite) {
			throw new Error("storage unavailable");
		}
		storage.store.delete(k);
	},
	clear: () => storage.store.clear(),
	key: () => null,
	get length() {
		return storage.store.size;
	},
} as Storage;

const { setActiveSandbox, getActiveSandbox, subscribeActiveSandbox } =
	await import("@/hooks/sandbox/useActiveSandbox");

const s1 = { id: "sb_1", name: "Sandbox One" };

beforeEach(() => {
	storage.throwOnWrite = false;
	storage.store.clear();
	setActiveSandbox(null);
});

describe("setActiveSandbox storage resilience", () => {
	test("persists and applies the selection when storage works", () => {
		setActiveSandbox(s1);
		expect(getActiveSandbox()).toEqual(s1);
		expect(storage.store.get("autumn_active_sandbox")).toBe(JSON.stringify(s1));
	});

	test("still applies + notifies subscribers when setItem throws", () => {
		storage.throwOnWrite = true;
		let notified = 0;
		const unsubscribe = subscribeActiveSandbox(() => {
			notified += 1;
		});

		expect(() => setActiveSandbox(s1)).not.toThrow();
		expect(getActiveSandbox()).toEqual(s1);
		expect(notified).toBe(1);

		unsubscribe();
	});

	test("still clears + notifies subscribers when removeItem throws", () => {
		setActiveSandbox(s1);
		storage.throwOnWrite = true;
		let notified = 0;
		const unsubscribe = subscribeActiveSandbox(() => {
			notified += 1;
		});

		expect(() => setActiveSandbox(null)).not.toThrow();
		expect(getActiveSandbox()).toBeNull();
		expect(notified).toBe(1);

		unsubscribe();
	});
});
