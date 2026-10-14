import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { createAutumnClient } from "../../../src/autumnClient/createAutumnClient.js";
import { createJournalForwarder } from "../../../src/journalForwarder/createJournalForwarder.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import { noFolderPulls } from "../utils/atomFixtures.js";
import { startFakeAutumn, until } from "../utils/fakeAutumnTracks.js";
import { createSlotFolder, owedCommand } from "../utils/journalFixtures.js";

const autumn = startFakeAutumn();
afterAll(() => autumn.stop());

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	autumn.reset();
});

/** A forwarder whose retries never come round, so only what it sends at once reaches Autumn; its log lines kept. */
const forwarderLogging = () => {
	const lines: { type: string; [field: string]: unknown }[] = [];
	const counted: string[] = [];
	const record = (fields: unknown) =>
		void lines.push(fields as { type: string });
	const forwarder = createJournalForwarder({
		ctx: {
			autumnClient: createAutumnClient({ autumnApiUrl: autumn.url }),
			logger: { info: record, warn: record },
			sleep: () => new Promise(() => {}),
			counters: { add: (field) => void counted.push(field) },
		},
	});
	return { forwarder, lines, counted };
};

/** A slot's journal on disk, handed to `forwarder`, holding `count` deductions Autumn does not have yet. */
const journalOwing = async ({
	forwarder,
	journalPath,
	count,
}: {
	forwarder: ReturnType<typeof forwarderLogging>["forwarder"];
	journalPath: string;
	count: number;
}) => {
	const journal = openJournal({ databasePath: journalPath });
	const forwarding = forwarder.forward({
		journal,
		tokenHash: () => "hash_folder",
		pulls: noFolderPulls,
	});
	for (let i = 1; i <= count; i++)
		await journal.append({
			customerId: "cus_1",
			command: owedCommand({ commandId: `cmd_${i}`, value: 1 }),
		});
	return {
		journal,
		close: () => {
			forwarding.stop();
			journal.close();
		},
	};
};

describe("draining the journals as the Atom stops", () => {
	test("ends as soon as Autumn holds everything: well inside the deadline, nothing unsent", async () => {
		const folder = createSlotFolder();
		cleanups.push(folder.remove);
		const { forwarder, lines } = forwarderLogging();
		const slot = await journalOwing({
			forwarder,
			journalPath: folder.journalPath,
			count: 3,
		});
		cleanups.push(slot.close);

		const startedAt = Date.now();
		await forwarder.drainAll({ deadlineMs: 5_000 });

		expect(Date.now() - startedAt).toBeLessThan(1_000);
		expect(slot.journal.unsent({ limit: 10 })).toHaveLength(0);
		expect(autumn.applied.map(({ seq }) => seq)).toEqual([1, 2, 3]);
		expect(lines).toEqual([
			{ type: "atom_journal_drained", journals: 1, unsent: 0 },
		]);
	});

	test("with Autumn down, ends at the deadline with what is left still in the file, and a reopen sends it", async () => {
		const folder = createSlotFolder();
		cleanups.push(folder.remove);
		autumn.switches.down = true;
		const { forwarder, lines, counted } = forwarderLogging();
		const slot = await journalOwing({
			forwarder,
			journalPath: folder.journalPath,
			count: 3,
		});

		const startedAt = Date.now();
		await forwarder.drainAll({ deadlineMs: 200 });
		const tookMs = Date.now() - startedAt;
		slot.close();

		// One batch failed, and its retry never came round.
		expect(counted).toEqual(["journalForwardFailed"]);
		expect(tookMs).toBeGreaterThanOrEqual(200);
		expect(tookMs).toBeLessThan(1_000);
		expect(
			lines.filter(({ type }) => type.startsWith("atom_journal_drain")),
		).toEqual([
			{ type: "atom_journal_drain_deadline", journals: 1, unsent: 3 },
		]);

		autumn.switches.down = false;
		const reopened = openJournal({ databasePath: folder.journalPath });
		const forwarding = forwarderLogging().forwarder.forward({
			journal: reopened,
			tokenHash: () => "hash_folder",
			pulls: noFolderPulls,
		});
		cleanups.push(() => {
			forwarding.stop();
			reopened.close();
		});
		await until(() => autumn.applied.length === 3);
		expect(autumn.applied.map(({ seq }) => seq)).toEqual([1, 2, 3]);
	});

	test("a parked customer is not drained: the deadline line counts every entry it holds back", async () => {
		const folder = createSlotFolder();
		cleanups.push(folder.remove);
		autumn.switches.refuseCommandIds.add("cmd_2");
		const { forwarder, lines } = forwarderLogging();
		const journal = openJournal({ databasePath: folder.journalPath });
		const forwarding = forwarder.forward({
			journal,
			tokenHash: () => "hash_folder",
			pulls: noFolderPulls,
		});
		cleanups.push(() => {
			forwarding.stop();
			journal.close();
		});
		await Promise.all(
			[1, 2, 3].map((i) =>
				journal.append({
					customerId: "cus_1",
					command: owedCommand({ commandId: `cmd_${i}`, value: 1 }),
				}),
			),
		);
		await until(() => journal.parked().length === 1);

		await forwarder.drainAll({ deadlineMs: 200 });

		expect(
			lines.filter(({ type }) => type.startsWith("atom_journal_drain")),
		).toEqual([
			{ type: "atom_journal_drain_deadline", journals: 1, unsent: 2 },
		]);
	});

	test("with no journals, ends at once", async () => {
		const { forwarder, lines } = forwarderLogging();

		await forwarder.drainAll({ deadlineMs: 5_000 });

		expect(lines).toEqual([
			{ type: "atom_journal_drained", journals: 0, unsent: 0 },
		]);
	});
});
