import { afterEach, describe, expect, test } from "bun:test";
import {
	openJournal,
	readJournalThreadStats,
} from "../../../src/state/journal/openJournal.js";
import { startThreadStatsTick } from "../../../src/threads/stats/startThreadStatsTick.js";
import {
	createThreadStatsBuffer,
	openThreadCounters,
	readThreadStats,
} from "../../../src/threads/stats/threadStats.js";
import { freshHeld } from "../utils/atomFixtures.js";
import { until } from "../utils/fakeAutumnTracks.js";
import { owedCommand } from "../utils/journalFixtures.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

/** This thread's row as its once-a-second tick publishes it. */
const publishedStats = () => {
	const buffer = createThreadStatsBuffer({ threads: 1 });
	const tick = startThreadStatsTick({
		counters: openThreadCounters({ buffer, index: 0 }),
		held: freshHeld(),
	});
	cleanups.push(tick.stop);
	return () => readThreadStats({ buffer })[0];
};

const appendTo = (journal: ReturnType<typeof openJournal>, i: number) =>
	journal.append({
		customerId: "cus_1",
		command: owedCommand({ commandId: `cmd_${i}`, value: 1 }),
	});

describe("a thread's journal stats", () => {
	test("count what Autumn does not hold yet and the oldest one's age, and fall to nothing once it is sent", async () => {
		const appendedAt = Date.now() - 60_000;
		const journal = openJournal({
			databasePath: ":memory:",
			now: () => appendedAt,
		});
		cleanups.push(() => journal.close());
		// Module state is the thread's own, and test files share a thread: measured from here.
		const before = readJournalThreadStats({ now: Date.now() });
		const stats = publishedStats();
		for (const i of [1, 2, 3]) await appendTo(journal, i);

		await until(() => stats()?.journalUnsent === before.journalUnsent + 3);
		expect(stats()?.tracksAppended).toBe(before.tracksAppended + 3);
		expect(stats()?.journalOldestUnsentMs).toBeGreaterThanOrEqual(60_000);
		expect(stats()?.journalOldestUnsentMs).toBeLessThan(70_000);

		journal.markSent({ entries: journal.unsent({ limit: 10 }) });
		await until(() => stats()?.journalUnsent === before.journalUnsent);
		expect(stats()?.journalOldestUnsentMs).toBe(before.journalOldestUnsentMs);
	}, 10_000);

	test("count a commit that failed, which leaves the deduction to the API", async () => {
		const journal = openJournal({ databasePath: ":memory:" });
		const before = readJournalThreadStats({ now: Date.now() });
		const stats = publishedStats();
		journal.close();

		await expect(appendTo(journal, 1)).rejects.toThrow();

		await until(() => stats()?.appendFailed === before.appendFailed + 1);
		expect(stats()?.tracksAppended).toBe(before.tracksAppended);
	}, 10_000);
});
