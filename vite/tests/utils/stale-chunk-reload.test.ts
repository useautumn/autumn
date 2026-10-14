import { describe, expect, test } from "bun:test";
import { claimStaleChunkReload } from "@/utils/staleChunkReload";

const createStorage = () => {
	const items = new Map<string, string>();
	return {
		getItem: (key: string) => items.get(key) ?? null,
		setItem: (key: string, value: string) => {
			items.set(key, value);
		},
	};
};

const oldBuild = "https://app.example.com/assets/index-old.js";
const newBuild = "https://app.example.com/assets/index-new.js";

describe("claimStaleChunkReload", () => {
	test("allows the first reload", () => {
		expect(
			claimStaleChunkReload({ storage: createStorage(), buildId: oldBuild }),
		).toBe(true);
	});

	test("blocks a second reload on the same build, however long it took, so a missing chunk can't loop", () => {
		const storage = createStorage();
		claimStaleChunkReload({ storage, buildId: oldBuild });

		expect(claimStaleChunkReload({ storage, buildId: oldBuild })).toBe(false);
	});

	test("allows another reload once the tab is on a newer build", () => {
		const storage = createStorage();
		claimStaleChunkReload({ storage, buildId: oldBuild });

		expect(claimStaleChunkReload({ storage, buildId: newBuild })).toBe(true);
	});

	test("skips the reload when storage is unavailable, since it can't be bounded", () => {
		const storage = {
			getItem: () => {
				throw new Error("SecurityError");
			},
			setItem: () => {
				throw new Error("QuotaExceededError");
			},
		};

		expect(claimStaleChunkReload({ storage, buildId: oldBuild })).toBe(false);
	});
});
