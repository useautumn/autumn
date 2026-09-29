import { describe, expect, test } from "bun:test";
import { type ByocCacheEntry, isNewerCacheEntry } from "../../src/byoc.js";
import { createMemoryByocCacheWriter } from "./utils/memoryByocCacheWriter.js";

const entryAt = (logOffset: string): ByocCacheEntry => ({
	schema_version: 1,
	api_version: "2.4.0",
	log_offset: logOffset,
	computed_at: 1,
	object: "oversized",
});

describe("which entry wins", () => {
	test("a later log offset replaces; an equal or earlier one does not", () => {
		expect(isNewerCacheEntry({ incoming: entryAt("5"), stored: null })).toBe(
			true,
		);
		expect(
			isNewerCacheEntry({ incoming: entryAt("6"), stored: entryAt("5") }),
		).toBe(true);
		expect(
			isNewerCacheEntry({ incoming: entryAt("5"), stored: entryAt("5") }),
		).toBe(false);
		expect(
			isNewerCacheEntry({ incoming: entryAt("4"), stored: entryAt("5") }),
		).toBe(false);
	});

	test("offsets compare as 64-bit numbers, not strings", () => {
		expect(
			isNewerCacheEntry({
				incoming: entryAt("10"),
				stored: entryAt("9"),
			}),
		).toBe(true);
		expect(
			isNewerCacheEntry({
				incoming: entryAt("9007199254740993"),
				stored: entryAt("9007199254740992"),
			}),
		).toBe(true);
	});
});

describe("the memory writer", () => {
	test("keeps the latest entry per deployment and key, dropping replays", async () => {
		const writer = createMemoryByocCacheWriter();
		const slot = { deploymentId: "dep_1", key: "v1.customer.cus_1" };
		expect(await writer.write({ ...slot, entry: entryAt("7") })).toBe(
			"written",
		);
		expect(await writer.write({ ...slot, entry: entryAt("6") })).toBe("stale");
		expect(writer.read(slot)?.log_offset).toBe("7");
		expect(
			writer.read({ deploymentId: "dep_2", key: "v1.customer.cus_1" }),
		).toBeNull();
	});
});
