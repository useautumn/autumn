import type {
	PendingActionRedis,
	PendingActionRedisMulti,
} from "../../src/mcp-server/agent/pending-actions.js";

export const createTestRedis = (): PendingActionRedis => {
	const store = new Map<string, string>();

	return {
		multi: () => {
			const ops: (() => void)[] = [];
			const multi: PendingActionRedisMulti = {
				set: (key, value) => {
					ops.push(() => store.set(key, value));
					return multi;
				},
				exec: async () => {
					ops.forEach((op) => op());
				},
			};
			return multi;
		},
		get: async (key) => store.get(key) ?? null,
		getdel: async (key) => {
			const value = store.get(key) ?? null;
			store.delete(key);
			return value;
		},
		del: async (...keys) => {
			keys.forEach((key) => store.delete(key));
		},
		keys: async (pattern) => {
			const prefix = pattern.replace(/\*$/, "");
			return [...store.keys()].filter((key) => key.startsWith(prefix));
		},
	};
};
