import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type pg from "pg";
import { JOURNAL_PATH } from "./paths.ts";
import {
	getPendingMigrations,
	type JournalEntry,
	selectMigrationsToApply,
} from "./pendingMigrations.ts";

const journal = (
	JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as { entries: JournalEntry[] }
).entries;
const [gapA, gapB] = journal.slice(-3, -1);
const newestBranchOnly = journal.at(-1)!.when + 1_000;

const clientWithRecorded = (createdAts: number[]) =>
	({
		query: async () => ({
			rows: createdAts.map((createdAt) => ({ created_at: String(createdAt) })),
		}),
	}) as unknown as pg.Client;

const recordedWithGap = [
	...journal
		.filter((entry) => entry.when !== gapA.when && entry.when !== gapB.when)
		.map((entry) => entry.when),
	newestBranchOnly,
];

describe("getPendingMigrations", () => {
	test("flags unrecorded migrations older than a newer recorded one", async () => {
		const pending = await getPendingMigrations(
			clientWithRecorded(recordedWithGap),
		);
		expect(pending.map(({ tag, outOfOrder }) => ({ tag, outOfOrder }))).toEqual(
			[
				{ tag: gapA.tag, outOfOrder: true },
				{ tag: gapB.tag, outOfOrder: true },
			],
		);
	});

	test("reports nothing once every migration is recorded", async () => {
		const pending = await getPendingMigrations(
			clientWithRecorded([
				...journal.map((entry) => entry.when),
				newestBranchOnly,
			]),
		);
		expect(pending).toEqual([]);
	});
});

describe("selectMigrationsToApply", () => {
	test("applies the gap on a local DB and skips it on a remote one", async () => {
		const unrecorded = await getPendingMigrations(
			clientWithRecorded(recordedWithGap),
		);
		const tags = (databaseUrl: string) =>
			selectMigrationsToApply({ unrecorded, databaseUrl }).map(
				({ tag }) => tag,
			);

		expect(
			tags("postgresql://postgres:postgres@localhost:5432/autumn"),
		).toEqual([gapA.tag, gapB.tag]);
		expect(tags("postgresql://user:pass@db.example.com:5432/autumn")).toEqual(
			[],
		);
	});
});
