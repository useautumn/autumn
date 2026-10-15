import { Database } from "bun:sqlite";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TrackCommand } from "@autumn/balance-engine";
import {
	createState,
	createTrackCommand,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import {
	MAX_OWED_PER_CUSTOMER,
	MAX_UNSENT_AGE_MS,
	MAX_UNSENT_PER_THREAD,
	openJournal,
} from "../../../src/state/journal/openJournal.js";
import type { Journal } from "../../../src/state/journal/types/journal.js";

const folders: string[] = [];
const journals: Journal[] = [];
const journalPath = () => {
	const folder = mkdtempSync(join(tmpdir(), "atom-journal-"));
	folders.push(folder);
	return join(folder, "journal-000-of-001.sqlite");
};
const open = (params: Parameters<typeof openJournal>[0]) => {
	const journal = openJournal(params);
	journals.push(journal);
	return journal;
};
afterEach(() => {
	for (const journal of journals.splice(0)) journal.close();
	for (const folder of folders.splice(0))
		rmSync(folder, { recursive: true, force: true });
});

const commandOf = ({
	commandId,
	value = 10,
	customerId = "cus_1",
}: {
	commandId: string;
	value?: number;
	customerId?: string;
}) => ({
	...createTrackCommand({ commandId, value, overageBehavior: "overflow" }),
	identity: { ...createState().identity, customerId },
});

const rowsIn = ({ databasePath }: { databasePath: string }) => {
	const database = new Database(databasePath, { readonly: true });
	try {
		return database
			.query<{ customerId: string; seq: number }, []>(
				"SELECT customer_id AS customerId, seq FROM journal_entries ORDER BY customer_id, seq",
			)
			.all();
	} finally {
		database.close();
	}
};

describe("journal", () => {
	test("seq is per customer and strictly increasing, in the order appends arrive", async () => {
		const journal = open({ databasePath: journalPath() });

		const entries = await Promise.all([
			journal.append({
				customerId: "cus_1",
				command: commandOf({ commandId: "a" }),
			}),
			journal.append({
				customerId: "cus_2",
				command: commandOf({ commandId: "b", customerId: "cus_2" }),
			}),
			journal.append({
				customerId: "cus_1",
				command: commandOf({ commandId: "c" }),
			}),
		]);

		expect(
			entries.map(({ customerId, seq, command }) => [
				customerId,
				seq,
				command.commandId,
			]),
		).toEqual([
			["cus_1", 1, "a"],
			["cus_2", 1, "b"],
			["cus_1", 2, "c"],
		]);
		expect(journal.owed({ customerId: "cus_1" }).map(({ seq }) => seq)).toEqual(
			[1, 2],
		);
	});

	test("an entry is owed from the moment it is appended, before its commit lands", async () => {
		const journal = open({ databasePath: journalPath() });

		const append = journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});

		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
		await append;
	});

	test("restart: pending rows survive a reopen, as the worker's own commands", async () => {
		const databasePath = journalPath();
		const first = openJournal({ databasePath });
		const command = commandOf({ commandId: "a" });
		await first.append({ customerId: "cus_1", command });
		first.close();

		const reopened = open({ databasePath });

		expect(reopened.owed({ customerId: "cus_1" })).toEqual([
			{
				customerId: "cus_1",
				writerId: reopened.writerId,
				seq: 1,
				appendedAt: expect.any(Number),
				command,
			},
		]);
	});

	test("atomic append: a throw after the journal commit leaves exactly one row", async () => {
		const databasePath = journalPath();
		const journal = open({ databasePath });

		const appendThenFail = async () => {
			await journal.append({
				customerId: "cus_1",
				command: commandOf({ commandId: "a" }),
			});
			throw new Error("the caller failed after its ack");
		};

		await expect(appendThenFail()).rejects.toThrow("after its ack");
		expect(rowsIn({ databasePath })).toEqual([{ customerId: "cus_1", seq: 1 }]);
	});

	test("atomic append: a throw before the commit leaves none, for every append in its batch", async () => {
		const databasePath = journalPath();
		const journal = open({ databasePath });
		// Properties that cannot be written as JSON fail the commit part-way through its batch.
		const unwritable = {
			...commandOf({ commandId: "b" }),
			properties: { amount: 1n },
		} as unknown as TrackCommand;

		const settled = await Promise.allSettled([
			journal.append({
				customerId: "cus_1",
				command: commandOf({ commandId: "a" }),
			}),
			journal.append({ customerId: "cus_1", command: unwritable }),
		]);

		expect(settled.map(({ status }) => status)).toEqual([
			"rejected",
			"rejected",
		]);
		expect(rowsIn({ databasePath })).toEqual([]);
		expect(journal.owed({ customerId: "cus_1" })).toEqual([]);
	});

	test("owed is the same array until the customer's entries change", async () => {
		const journal = open({ databasePath: journalPath() });

		const empty = journal.owed({ customerId: "cus_1" });
		expect(journal.owed({ customerId: "cus_1" })).toBe(empty);
		expect(journal.owed({ customerId: "cus_2" })).toBe(empty);

		await journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});
		const one = journal.owed({ customerId: "cus_1" });
		expect(one).not.toBe(empty);
		expect(journal.owed({ customerId: "cus_1" })).toBe(one);
	});

	test("an append grows the customer's owed array in place, never copying it; a push that trims it gives a new one", async () => {
		const journal = open({ databasePath: journalPath() });
		await journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});
		const owed = journal.owed({ customerId: "cus_1" });

		await journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "b" }),
		});
		expect(journal.owed({ customerId: "cus_1" })).toBe(owed);
		expect(owed.map(({ seq }) => seq)).toEqual([1, 2]);

		await journal.reconcile({
			customerId: "cus_1",
			atomSeqs: { atom_1: { [journal.writerId]: 1 } },
		});
		expect(journal.owed({ customerId: "cus_1" })).not.toBe(owed);
		expect(owed.map(({ seq }) => seq)).toEqual([1, 2]);
	});

	test("a push drops every entry it has seen from this journal's writer, and a dropped seq is never reused", async () => {
		const databasePath = journalPath();
		const journal = open({ databasePath });
		for (const commandId of ["a", "b"])
			await journal.append({
				customerId: "cus_1",
				command: commandOf({ commandId }),
			});

		await journal.reconcile({
			customerId: "cus_1",
			atomSeqs: { atom_1: { [journal.writerId]: 1 } },
		});
		const next = await journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "c" }),
		});

		expect(next.seq).toBe(3);
		expect(rowsIn({ databasePath })).toEqual([
			{ customerId: "cus_1", seq: 2 },
			{ customerId: "cus_1", seq: 3 },
		]);
	});

	test("a push that has seen nothing from this journal's writer leaves every entry owed", async () => {
		const journal = open({ databasePath: journalPath() });
		await journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});
		const owed = journal.owed({ customerId: "cus_1" });

		await journal.reconcile({ customerId: "cus_1", atomSeqs: null });
		await journal.reconcile({
			customerId: "cus_1",
			atomSeqs: { atom_1: { other_writer: 7 } },
		});
		await journal.reconcile({
			customerId: "cus_1",
			atomSeqs: { atom_1: { [journal.writerId]: 0 } },
		});

		expect(journal.owed({ customerId: "cus_1" })).toBe(owed);
	});

	test("unsent is what is committed and Autumn does not hold yet, in commit order, and each commit says so", async () => {
		const journal = open({ databasePath: journalPath() });
		let commits = 0;
		journal.onCommitted(() => commits++);

		const pending = journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});
		expect(journal.unsent({ limit: 10 })).toEqual([]);
		const first = await pending;
		await journal.append({
			customerId: "cus_2",
			command: commandOf({ commandId: "b", customerId: "cus_2" }),
		});
		journal.markSent({ entries: [first] });

		expect(commits).toBe(2);
		expect(
			journal.unsent({ limit: 10 }).map(({ command }) => command.commandId),
		).toEqual(["b"]);
		expect(journal.owed({ customerId: "cus_1" })).toEqual([first]);
	});

	test("restart: every owed row is unsent again, so whatever Autumn may already hold is sent again and deduplicated", async () => {
		const databasePath = journalPath();
		const first = openJournal({ databasePath });
		const sent = await first.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});
		await first.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "b" }),
		});
		first.markSent({ entries: [sent] });
		first.close();

		expect(
			open({ databasePath })
				.unsent({ limit: 10 })
				.map(({ seq }) => seq),
		).toEqual([1, 2]);
	});

	test("ceiling: a customer owing more than MAX_OWED_PER_CUSTOMER is backed up until a push clears it; others are not", async () => {
		const journal = open({ databasePath: journalPath() });

		await Promise.all(
			Array.from({ length: MAX_OWED_PER_CUSTOMER + 1 }, (_, index) =>
				journal.append({
					customerId: "cus_1",
					command: commandOf({ commandId: `cmd_${index}`, value: 1 }),
				}),
			),
		);

		expect(journal.isBackedUp({ customerId: "cus_1" })).toBe(true);
		expect(journal.isBackedUp({ customerId: "cus_2" })).toBe(false);
		await journal.reconcile({
			customerId: "cus_1",
			atomSeqs: { atom_1: { [journal.writerId]: 1 } },
		});
		expect(journal.isBackedUp({ customerId: "cus_1" })).toBe(false);
	}, 30_000);

	test("ceiling: a customer whose oldest unsent deduction is older than MAX_UNSENT_AGE_MS is backed up until Autumn holds it; others are not", async () => {
		let clock = 0;
		const journal = open({ databasePath: journalPath(), now: () => clock });
		const old = await journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});
		clock += MAX_UNSENT_AGE_MS;
		await journal.append({
			customerId: "cus_2",
			command: commandOf({ commandId: "b", customerId: "cus_2" }),
		});
		clock += 1;

		expect(journal.isBackedUp({ customerId: "cus_1" })).toBe(true);
		expect(journal.isBackedUp({ customerId: "cus_2" })).toBe(false);
		journal.markSent({ entries: [old] });
		expect(journal.isBackedUp({ customerId: "cus_1" })).toBe(false);
	});

	test("a fresh file gets a new writer id: its #1 is not dropped by a push saying the old writer saw 7", async () => {
		const old = open({ databasePath: journalPath() });
		const fresh = open({ databasePath: journalPath() });
		await fresh.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});

		await fresh.reconcile({
			customerId: "cus_1",
			atomSeqs: { atom_1: { [old.writerId]: 7 } },
		});

		expect(fresh.writerId).not.toBe(old.writerId);
		expect(fresh.owed({ customerId: "cus_1" }).map(({ seq }) => seq)).toEqual([
			1,
		]);
	});

	test("restart on the same file keeps its writer id and continues its seq", async () => {
		const databasePath = journalPath();
		const first = openJournal({ databasePath });
		await first.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});
		const { writerId } = first;
		first.close();

		const reopened = open({ databasePath });
		const next = await reopened.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "b" }),
		});

		expect([reopened.writerId, next.seq]).toEqual([writerId, 2]);
	});

	test("forget drops everything a customer owes, from the file too, and leaves others", async () => {
		const databasePath = journalPath();
		const journal = open({ databasePath });
		await journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});
		await journal.append({
			customerId: "cus_2",
			command: commandOf({ commandId: "b", customerId: "cus_2" }),
		});

		await journal.forget({ customerId: "cus_1" });

		expect(journal.owed({ customerId: "cus_1" })).toEqual([]);
		expect(
			journal.unsent({ limit: 10 }).map(({ customerId }) => customerId),
		).toEqual(["cus_2"]);
		expect(rowsIn({ databasePath })).toEqual([{ customerId: "cus_2", seq: 1 }]);
	});

	test("ceiling: a customer's sent but still owed deductions are never walked to find its oldest unsent one", async () => {
		const lookupsWithSentPrefix = async ({ sent }: { sent: number }) => {
			const journal = open({ databasePath: journalPath() });
			await Promise.all(
				Array.from({ length: sent + 1 }, (_, index) =>
					journal.append({
						customerId: "cus_1",
						command: commandOf({ commandId: `c_${index}`, value: 1 }),
					}),
				),
			);
			journal.markSent({ entries: journal.unsent({ limit: sent }) });
			const lookups = spyOn(Set.prototype, "has");
			try {
				journal.isBackedUp({ customerId: "cus_1" });
				return lookups.mock.calls.length;
			} finally {
				lookups.mockRestore();
			}
		};

		expect(await lookupsWithSentPrefix({ sent: 10_000 })).toBe(
			await lookupsWithSentPrefix({ sent: 10 }),
		);
	}, 30_000);

	test("ceiling: deductions sent out of order leave the oldest still unsent deciding, until it is sent, reconciled or forgotten", async () => {
		let clock = 0;
		const journal = open({ databasePath: journalPath(), now: () => clock });
		const appendAt = async (commandId: string) => {
			const entry = await journal.append({
				customerId: "cus_1",
				command: commandOf({ commandId }),
			});
			clock += MAX_UNSENT_AGE_MS / 2;
			return entry;
		};
		const first = await appendAt("a");
		const second = await appendAt("b");
		const third = await appendAt("c");
		clock += 1;

		journal.markSent({ entries: [third, first] });
		expect(journal.isBackedUp({ customerId: "cus_1" })).toBe(true);
		journal.markSent({ entries: [second] });
		expect(journal.isBackedUp({ customerId: "cus_1" })).toBe(false);

		const late = await appendAt("d");
		clock += MAX_UNSENT_AGE_MS;
		expect(journal.isBackedUp({ customerId: "cus_1" })).toBe(true);
		await journal.reconcile({
			customerId: "cus_1",
			atomSeqs: { atom_1: { [journal.writerId]: late.seq } },
		});
		expect(journal.isBackedUp({ customerId: "cus_1" })).toBe(false);

		await appendAt("e");
		clock += MAX_UNSENT_AGE_MS;
		expect(journal.isBackedUp({ customerId: "cus_1" })).toBe(true);
		await journal.forget({ customerId: "cus_1" });
		expect(journal.isBackedUp({ customerId: "cus_1" })).toBe(false);
	});

	test("a refused entry parks its customer: its later entries leave the batches with it, other customers' stay, and it still counts as unsent for the ceiling", async () => {
		let clock = 0;
		const journal = open({ databasePath: journalPath(), now: () => clock });
		const append = (customerId: string, commandId: string) =>
			journal.append({
				customerId,
				command: commandOf({ commandId, customerId }),
			});
		const first = await append("cus_1", "a");
		const bad = await append("cus_1", "bad");
		const later = await append("cus_1", "c");
		const other = await append("cus_2", "x");

		journal.markSent({ entries: [first] });
		journal.park({ entry: bad });
		clock += MAX_UNSENT_AGE_MS + 1;

		expect(journal.unsent({ limit: 10 })).toEqual([other]);
		expect(journal.countUnsent()).toBe(3);
		expect(journal.parked()).toEqual([bad]);
		expect(journal.owed({ customerId: "cus_1" })).toEqual([first, bad, later]);
		expect(journal.isBackedUp({ customerId: "cus_1" })).toBe(true);
		journal.markSent({ entries: [bad] });
		expect(journal.parked()).toEqual([]);
		expect(journal.unsent({ limit: 10 })).toEqual([later, other]);
	});

	test("a parked customer is unparked by a push that shows its refused entry applied, or by its customer being forgotten", async () => {
		const journal = open({ databasePath: journalPath() });
		const appendParked = async (commandId: string) => {
			const entry = await journal.append({
				customerId: "cus_1",
				command: commandOf({ commandId }),
			});
			journal.park({ entry });
			return entry;
		};

		const pushed = await appendParked("a");
		await journal.reconcile({
			customerId: "cus_1",
			atomSeqs: { atom_1: { [journal.writerId]: pushed.seq } },
		});
		expect(journal.parked()).toEqual([]);

		await appendParked("b");
		await journal.forget({ customerId: "cus_1" });
		expect(journal.parked()).toEqual([]);
	});

	test("ceiling: past MAX_UNSENT_PER_THREAD unsent across the thread's journals, every customer's send_event goes to the API until Autumn takes some", async () => {
		const appendMany = async ({
			journal,
			count,
			customers,
		}: {
			journal: Journal;
			count: number;
			customers: number;
		}) =>
			Promise.all(
				Array.from({ length: count }, (_, index) => {
					const customerId = `cus_${index % customers}`;
					return journal.append({
						customerId,
						command: commandOf({
							commandId: `c_${index}`,
							customerId,
							value: 1,
						}),
					});
				}),
			);
		const first = open({ databasePath: journalPath() });
		const second = open({ databasePath: journalPath() });
		await appendMany({
			journal: first,
			count: MAX_UNSENT_PER_THREAD,
			customers: 10,
		});
		await appendMany({ journal: second, count: 1, customers: 1 });

		expect(second.isBackedUp({ customerId: "cus_0" })).toBe(true);
		first.markSent({ entries: first.unsent({ limit: 1 }) });
		expect(second.isBackedUp({ customerId: "cus_0" })).toBe(false);
	}, 30_000);
});

describe("a journal's handoff", () => {
	test("waits for the entries still committing and hands them as unsent: what the new owner must still send", async () => {
		const journal = open({ databasePath: journalPath() });
		const append = journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});

		const handoffs = await journal.handoffs();
		await append;

		expect(handoffs).toEqual([
			{
				customerId: "cus_1",
				entries: [expect.objectContaining({ seq: 1, sent: false })],
			},
		]);
		expect(journal.countUnsent()).toBe(1);
	});

	test("names what Autumn already holds as sent, so the new owner holds it without sending it again", async () => {
		const journal = open({ databasePath: journalPath() });
		const first = await journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});
		await journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "b" }),
		});
		journal.markSent({ entries: [first] });

		expect(
			(await journal.handoffs())[0]?.entries.map(({ seq, sent }) => ({
				seq,
				sent,
			})),
		).toEqual([
			{ seq: 1, sent: true },
			{ seq: 2, sent: false },
		]);
	});
});

describe("journal entries carry their writer", () => {
	test("an entry held under another writer keeps that writer, raises no seq of this file, and clears only against its own watermark", async () => {
		const databasePath = journalPath();
		const first = openJournal({ databasePath });
		const own = await first.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "own" }),
		});
		first.close();
		const database = new Database(databasePath);
		database.run(
			"INSERT INTO journal_entries (customer_id, writer_id, seq, appended_at, command_json) VALUES ('cus_1', 'writer-other', 7, ?, ?)",
			[own.appendedAt - 1, JSON.stringify(commandOf({ commandId: "theirs" }))],
		);
		database.close();

		const journal = open({ databasePath });
		expect(
			journal
				.owed({ customerId: "cus_1" })
				.map(({ writerId, seq }) => ({ writerId, seq })),
		).toEqual([
			{ writerId: "writer-other", seq: 7 },
			{ writerId: own.writerId, seq: 1 },
		]);
		const next = await journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "own-2" }),
		});
		expect(next.seq).toBe(2);

		await journal.reconcile({
			customerId: "cus_1",
			atomSeqs: { atom_1: { [own.writerId]: 2 } },
		});
		expect(
			journal
				.owed({ customerId: "cus_1" })
				.map(({ writerId, seq }) => ({ writerId, seq })),
		).toEqual([{ writerId: "writer-other", seq: 7 }]);

		await journal.reconcile({
			customerId: "cus_1",
			atomSeqs: { atom_1: { [own.writerId]: 2, "writer-other": 7 } },
		});
		expect(journal.owed({ customerId: "cus_1" })).toEqual([]);
		expect(rowsIn({ databasePath })).toEqual([]);
	});
});
