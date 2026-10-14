import { describe, expect, test } from "bun:test";
import { addSeconds } from "date-fns";
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

describe("claimStaleChunkReload", () => {
	const now = new Date("2026-10-14T14:10:57Z");

	test("allows the first reload", () => {
		expect(claimStaleChunkReload({ storage: createStorage(), now })).toBe(true);
	});

	test("blocks a second reload right after the first, so a missing chunk can't loop", () => {
		const storage = createStorage();
		claimStaleChunkReload({ storage, now });

		expect(claimStaleChunkReload({ storage, now: addSeconds(now, 2) })).toBe(
			false,
		);
	});

	test("allows another reload once the cooldown has passed, for a later deploy", () => {
		const storage = createStorage();
		claimStaleChunkReload({ storage, now });

		expect(claimStaleChunkReload({ storage, now: addSeconds(now, 60) })).toBe(
			true,
		);
	});
});
