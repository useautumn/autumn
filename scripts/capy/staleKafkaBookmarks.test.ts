import { describe, expect, test } from "bun:test";
import {
	findStaleBookmarks,
	parseLogEndOffsets,
} from "./staleKafkaBookmarks.ts";

const logEnds = parseLogEndOffsets({
	output: [
		"local-events:0:0",
		"local-events:1:50",
		"local-commands:0:0",
		"local-commands:1:10",
		"garbage line",
	].join("\n"),
});

describe("findStaleBookmarks", () => {
	test("flags a bookmark past its events log end", () => {
		const stale = findStaleBookmarks({
			bookmarks: [
				{
					topic: "local-events",
					partition: 0,
					nextOffset: 1714n,
					commandNextOffset: null,
				},
				{
					topic: "local-events",
					partition: 1,
					nextOffset: 50n,
					commandNextOffset: 10n,
				},
			],
			logEnds,
		});
		expect(stale.map((b) => b.partition)).toEqual([0]);
	});

	test("flags a command bookmark past its commands log end", () => {
		const stale = findStaleBookmarks({
			bookmarks: [
				{
					topic: "local-events",
					partition: 1,
					nextOffset: 40n,
					commandNextOffset: 11n,
				},
			],
			logEnds,
		});
		expect(stale).toHaveLength(1);
	});

	test("flags bookmarks for topics the broker no longer has", () => {
		const stale = findStaleBookmarks({
			bookmarks: [
				{
					topic: "local-ownership",
					partition: 0,
					nextOffset: 5n,
					commandNextOffset: null,
				},
			],
			logEnds,
		});
		expect(stale).toHaveLength(1);
	});

	test("keeps a zero bookmark on a missing topic", () => {
		const stale = findStaleBookmarks({
			bookmarks: [
				{
					topic: "local-ownership",
					partition: 0,
					nextOffset: 0n,
					commandNextOffset: null,
				},
			],
			logEnds,
		});
		expect(stale).toEqual([]);
	});
});
