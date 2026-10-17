import type {
	AdminBucketObjects,
	AdminObjectListing,
} from "../../../../src/external/s3/types/adminBucketObjects.js";

export function createMemoryAdminObjects({
	now = Date.now,
}: {
	now?: () => number;
} = {}) {
	const stored = new Map<string, { text: string; etag: string; at: number }>();
	const state: {
		version: number;
		unavailable: boolean;
		afterRead: ((key: string) => Promise<void>) | null;
	} = { version: 0, unavailable: false, afterRead: null };
	function guard(): void {
		if (state.unavailable) throw new Error("S3 did not answer");
	}
	function put({ key, body }: { key: string; body: string }): void {
		state.version += 1;
		stored.set(key, { text: body, etag: `"v${state.version}"`, at: now() });
	}
	const objects: AdminBucketObjects = {
		list: async ({ prefix }) => {
			guard();
			const listed: AdminObjectListing[] = [];
			for (const [key, object] of stored)
				if (key.startsWith(prefix))
					listed.push({ key, lastModifiedAt: object.at });
			return listed;
		},
		read: async ({ key }) => {
			guard();
			const object = stored.get(key);
			const read = object ? { text: object.text, etag: object.etag } : null;
			const hook = state.afterRead;
			state.afterRead = null;
			await hook?.(key);
			return read;
		},
		create: async ({ key, body }) => {
			guard();
			if (stored.has(key)) return false;
			put({ key, body });
			return true;
		},
		replace: async ({ key, body, etag }) => {
			guard();
			if (stored.get(key)?.etag !== etag) return false;
			put({ key, body });
			return true;
		},
		remove: async ({ key }) => {
			guard();
			stored.delete(key);
		},
	};
	return { objects, stored, state, put };
}
