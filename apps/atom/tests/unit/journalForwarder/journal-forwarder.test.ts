import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAutumnClient } from "../../../src/autumnClient/createAutumnClient.js";
import { createJournalForwarder } from "../../../src/journalForwarder/createJournalForwarder.js";
import { openSlots } from "../../../src/slots/openSlots.js";
import { journalFilePath } from "../../../src/slots/slotFiles.js";
import {
	MAX_UNSENT_AGE_MS,
	openJournal,
} from "../../../src/state/journal/openJournal.js";
import type { Journal } from "../../../src/state/journal/types/journal.js";
import type { StoredSubject } from "../../../src/state/types/storedSubject.js";
import {
	allSlotsOwnedHere,
	checkRequestFor,
	checkResponseOf,
	forwardReasonOf,
	freshHeld,
	latestApiVersion,
	noFolderPulls,
	noSubjectPulls,
	storedSubjectWith,
	subjectPushOf,
	withAtomSeqs,
} from "../utils/atomFixtures.js";
import { startFakeAutumn, until } from "../utils/fakeAutumnTracks.js";
import {
	createSlotFolder,
	openSlotProcessor,
	owedCommand,
} from "../utils/journalFixtures.js";

const autumn = startFakeAutumn();
afterAll(() => autumn.stop());

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	autumn.reset();
});

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const PUSH_GRACE_MS = 60_000;

/** The forwarder's waits, each held until the test lets it pass: a clock it moves by hand. */
const heldSleeps = () => {
	const waiting: { ms: number; wake: () => void }[] = [];
	return {
		sleep: (ms: number) =>
			new Promise<void>((wake) => waiting.push({ ms, wake })),
		/** The next wait of `ms`, once the forwarder is in it. */
		next: async ({ ms }: { ms: number }) => {
			await until(() => waiting.some((sleep) => sleep.ms === ms));
			const index = waiting.findIndex((sleep) => sleep.ms === ms);
			const [sleep] = waiting.splice(index, 1);
			if (!sleep) throw new Error(`No wait of ${ms} ms`);
			return sleep;
		},
	};
};

const forwarderTo = ({
	sleep,
	warnings = [],
}: {
	sleep: (ms: number) => Promise<void>;
	warnings?: unknown[];
}) =>
	createJournalForwarder({
		ctx: {
			autumnClient: createAutumnClient({ autumnApiUrl: autumn.url }),
			logger: {
				info: () => {},
				warn: (fields: unknown) => void warnings.push(fields),
			},
			sleep,
		},
	});

const asCustomer = ({
	subject,
	customerId,
}: {
	subject: StoredSubject;
	customerId: string;
}): StoredSubject => ({
	...subject,
	state: {
		...subject.state,
		identity: { ...subject.state.identity, customerId },
	},
});

/** `cus_1` and `cus_2` holding 1,000 messages each, their slot's journal handed to Autumn as it fills. */
const openForwardedSlot = async ({
	now = Date.now,
}: {
	now?: () => number;
} = {}) => {
	const sleeps = heldSleeps();
	const warnings: unknown[] = [];
	const pulled: string[] = [];
	const slot = openSlotProcessor({
		journal: openJournal({ databasePath: ":memory:", now }),
	});
	const forwarding = forwarderTo({ sleep: sleeps.sleep, warnings }).forward({
		journal: slot.journal,
		tokenHash: () => "hash_folder",
		pulls: {
			request() {},
			settle: async ({ customerId }) => void pulled.push(customerId),
		},
	});
	cleanups.push(() => {
		forwarding.stop();
		slot.close();
	});
	for (const customerId of ["cus_1", "cus_2"])
		await slot.processor.setSubject(
			subjectPushOf({
				subject: asCustomer({
					subject: storedSubjectWith({ balance: 1000 }),
					customerId,
				}),
			}),
		);
	return { ...slot, sleeps, warnings, pulled };
};

let requests = 0;
const sendEvent = ({ customerId = "cus_1" }: { customerId?: string } = {}) => ({
	...checkRequestFor({
		params: {
			customer_id: customerId,
			send_event: true,
			required_balance: 10,
		},
	}),
	requestId: `atom_req_${++requests}`,
});

const remainingOf = async ({
	processor,
}: {
	processor: ReturnType<typeof openSlotProcessor>["processor"];
}) =>
	(await checkResponseOf({ processor, request: checkRequestFor() })).balance
		?.remaining;

const nothingUnsent = ({ journal }: { journal: Journal }) =>
	journal.countUnsent() === 0;

describe("handing the journal to Autumn", () => {
	test("2xx: the batch is marked sent, and stays in the view until a push shows it", async () => {
		const { processor, journal } = await openForwardedSlot();

		const reply = await checkResponseOf({ processor, request: sendEvent() });

		await until(() => nothingUnsent({ journal }));
		expect(autumn.applied).toEqual([
			{ writer: journal.writerId, customerId: "cus_1", seq: 1, value: 10 },
		]);
		expect(reply.balance?.remaining).toBe(990);
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
		expect(await remainingOf({ processor })).toBe(990);
	});

	test("5xx after Autumn took the batch: the retry is deduplicated, one deduction", async () => {
		const { processor, journal, sleeps } = await openForwardedSlot();
		autumn.switches.loseNextAck = true;

		await processor.check({ request: sendEvent() });
		(await sleeps.next({ ms: 1000 })).wake();

		await until(() => nothingUnsent({ journal }));
		expect(autumn.applied).toEqual([
			{ writer: journal.writerId, customerId: "cus_1", seq: 1, value: 10 },
		]);
		expect(autumn.requestSizes).toEqual([1, 1]);
	});

	test("Autumn down 60 s: checks keep answering, retries back off 1 s to 30 s, and the journal drains in order afterwards", async () => {
		const { processor, journal, sleeps } = await openForwardedSlot();
		autumn.switches.down = true;

		const remaining: (number | undefined)[] = [];
		const deduct = async () =>
			remaining.push(
				(await checkResponseOf({ processor, request: sendEvent() })).balance
					?.remaining,
			);
		await deduct();
		let downForMs = 0;
		for (const delay of RETRY_DELAYS_MS) {
			const retry = await sleeps.next({ ms: delay });
			downForMs += retry.ms;
			await deduct();
			if (downForMs >= 60_000) autumn.switches.down = false;
			retry.wake();
		}

		await until(() => nothingUnsent({ journal }));
		expect(downForMs).toBeGreaterThanOrEqual(60_000);
		expect(remaining).toEqual([990, 980, 970, 960, 950, 940, 930]);
		expect(autumn.applied.map(({ seq }) => seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});

	test("400/401: logged once, kept and retried with backoff, never dropped", async () => {
		const { processor, journal, sleeps, warnings } = await openForwardedSlot();
		autumn.switches.refuseWith = 401;

		await processor.check({ request: sendEvent() });
		(await sleeps.next({ ms: 1000 })).wake();
		(await sleeps.next({ ms: 2000 })).wake();
		autumn.switches.refuseWith = 400;
		const retry = await sleeps.next({ ms: 4000 });

		expect(warnings).toEqual([
			expect.objectContaining({ type: "atom_journal_forward_failed" }),
		]);
		expect(journal.unsent({ limit: 10 })).toHaveLength(1);
		autumn.switches.refuseWith = null;
		retry.wake();
		await until(() => nothingUnsent({ journal }));
		expect(autumn.applied).toHaveLength(1);
	});

	test("deductions committed a few ms apart go to Autumn together, not one tracks.append each", async () => {
		const { journal } = await openForwardedSlot();

		for (let index = 0; index < 10; index++) {
			await journal.append({
				customerId: "cus_1",
				command: owedCommand({ commandId: `spaced_${index}`, value: 1 }),
			});
			await Bun.sleep(1);
		}
		await until(() => nothingUnsent({ journal }));

		expect(autumn.applied).toHaveLength(10);
		expect(autumn.requestSizes.length).toBeLessThanOrEqual(2);
	});

	test("a folder's journals go to Autumn together: one tracks.append carries every journal with something to send", async () => {
		const forwarder = forwarderTo({ sleep: heldSleeps().sleep });
		const tokenHash = () => "hash_folder";
		const journals = [1, 2, 3].map(() =>
			openJournal({ databasePath: ":memory:" }),
		);
		const forwardings = journals.map((journal) =>
			forwarder.forward({ journal, tokenHash, pulls: noFolderPulls }),
		);
		cleanups.push(() => {
			for (const forwarding of forwardings) forwarding.stop();
			for (const journal of journals) journal.close();
		});

		await Promise.all(
			journals.map((journal, index) =>
				journal.append({
					customerId: `cus_${index}`,
					command: owedCommand({
						commandId: `slot_${index}`,
						value: 1,
						customerId: `cus_${index}`,
					}),
				}),
			),
		);
		await until(() => journals.every((journal) => nothingUnsent({ journal })));

		expect(autumn.requestSizes).toEqual([3]);
		expect(new Set(autumn.applied.map(({ writer }) => writer))).toEqual(
			new Set(journals.map(({ writerId }) => writerId)),
		);
	});

	test("batches hold at most 500 tracks, each customer's in seq order", async () => {
		const { journal } = await openForwardedSlot();
		autumn.switches.down = true;
		await Promise.all(
			Array.from({ length: 1200 }, (_, index) => {
				const customerId = index % 2 === 0 ? "cus_1" : "cus_2";
				return journal.append({
					customerId,
					command: owedCommand({
						commandId: `batched_${index}`,
						value: 1,
						customerId,
					}),
				});
			}),
		);

		autumn.switches.down = false;
		await until(() => nothingUnsent({ journal }));

		expect(autumn.requestSizes.slice(-3)).toEqual([500, 500, 200]);
		for (const customerId of ["cus_1", "cus_2"])
			expect(
				autumn.applied
					.filter((track) => track.customerId === customerId)
					.map(({ seq }) => seq),
			).toEqual(Array.from({ length: 600 }, (_, index) => index + 1));
	});
});

describe("a track Autumn refuses on its own", () => {
	/** Each `[customerId, commandId]` appended at once, so they commit and go to Autumn as one batch. */
	const appendTogether = ({
		journal,
		commands,
	}: {
		journal: Journal;
		commands: [customerId: string, commandId: string][];
	}) =>
		Promise.all(
			commands.map(([customerId, commandId]) =>
				journal.append({
					customerId,
					command: owedCommand({ commandId, value: 1, customerId }),
				}),
			),
		);
	const appliedTo = (customerId: string) =>
		autumn.applied
			.filter((track) => track.customerId === customerId)
			.map(({ seq }) => seq);

	test("one refused track parks its customer: that customer's later entries wait, the other customers' 7 go, with one warn line", async () => {
		const { journal, warnings } = await openForwardedSlot();
		autumn.switches.refuseCommandIds.add("bad");

		const appended = await appendTogether({
			journal,
			commands: [
				["cus_2", "x1"],
				["cus_2", "x2"],
				["cus_2", "x3"],
				["cus_1", "bad"],
				["cus_2", "x4"],
				["cus_2", "x5"],
				["cus_1", "later"],
				["cus_2", "x6"],
				["cus_2", "x7"],
			],
		});

		await until(() => journal.parked().length === 1);
		expect(autumn.applied).toHaveLength(7);
		expect(appliedTo("cus_2")).toEqual([1, 2, 3, 4, 5, 6, 7]);
		expect(journal.unsent({ limit: 10 })).toEqual([]);
		expect(appliedTo("cus_1")).toEqual([]);
		expect(journal.parked()).toEqual([appended[3]]);
		expect(journal.owed({ customerId: "cus_1" })).toEqual([
			appended[3],
			appended[6],
		]);
		expect(warnings).toEqual([
			expect.objectContaining({
				type: "atom_journal_track_parked",
				customerId: "cus_1",
				seq: 1,
			}),
		]);
	});

	test("a parked customer's refused track is retried alone, backing off 1 s to 30 s, while other customers still go; once Autumn takes it, the customer's remaining entries follow in order", async () => {
		const { journal, sleeps, warnings } = await openForwardedSlot();
		autumn.switches.refuseCommandIds.add("bad");
		await appendTogether({
			journal,
			commands: [
				["cus_1", "bad"],
				["cus_2", "other_0"],
			],
		});
		await until(() => journal.parked().length === 1);

		for (const [index, delay] of [...RETRY_DELAYS_MS, 30_000].entries()) {
			const retry = await sleeps.next({ ms: delay });
			await appendTogether({
				journal,
				commands: [
					["cus_1", `waiting_${index}`],
					["cus_2", `other_${index + 1}`],
				],
			});
			await until(() => appliedTo("cus_2").length === index + 2);
			retry.wake();
		}
		const accepted = await sleeps.next({ ms: 30_000 });
		autumn.switches.refuseCommandIds.clear();
		accepted.wake();

		await until(() => nothingUnsent({ journal }));
		expect(journal.parked()).toEqual([]);
		expect(appliedTo("cus_1")).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		expect(
			warnings.filter(
				(fields) =>
					(fields as { type: string }).type === "atom_journal_track_parked",
			),
		).toHaveLength(1);
	});

	test("an Autumn refusing every request parks nothing, and the whole batch backs off as before", async () => {
		const { journal, sleeps, warnings } = await openForwardedSlot();
		autumn.switches.refuseWith = 400;

		await appendTogether({
			journal,
			commands: [
				["cus_1", "a"],
				["cus_2", "b"],
				["cus_1", "c"],
				["cus_2", "d"],
			],
		});
		const retry = await sleeps.next({ ms: 1000 });

		expect(journal.parked()).toEqual([]);
		expect(journal.unsent({ limit: 10 })).toHaveLength(4);
		expect(warnings).toEqual([
			expect.objectContaining({ type: "atom_journal_forward_failed" }),
		]);
		autumn.switches.refuseWith = null;
		retry.wake();
		await until(() => nothingUnsent({ journal }));
		expect(autumn.applied).toHaveLength(4);
	});

	test("a refused batch of one, with nothing beside it to show Autumn reads the rest, is not parked", async () => {
		const { journal, sleeps } = await openForwardedSlot();
		autumn.switches.refuseCommandIds.add("bad");

		await appendTogether({ journal, commands: [["cus_1", "bad"]] });
		await sleeps.next({ ms: 1000 });

		expect(journal.parked()).toEqual([]);
		expect(journal.unsent({ limit: 10 })).toHaveLength(1);
	});
});

describe("a finalize the Atom settled", () => {
	test("is handed in after its lock as the lock it names: customer, lock, entity and feature from its row, never the row", async () => {
		const { processor, journal } = await openForwardedSlot();
		await processor.check({
			request: {
				...sendEvent(),
				params: {
					...sendEvent().params,
					send_event: undefined,
					lock: { enabled: true, lock_id: "lock_1" },
				},
			},
		});
		await processor.finalize({
			request: {
				requestId: "atom_req_finalize",
				occurredAt: 1_700_000_000_000,
				params: {
					customer_id: "cus_1",
					lock_id: "lock_1",
					action: "confirm",
					override_value: 4,
					properties: { model: "small" },
				},
				apiVersion: latestApiVersion,
			},
		});

		await until(() => nothingUnsent({ journal }));
		expect(autumn.applied.map(({ seq }) => seq)).toEqual([1]);
		expect(autumn.finalized).toEqual([
			{
				writerId: journal.writerId,
				seq: 2,
				requestId: "atom_req_finalize",
				occurredAt: 1_700_000_000_000,
				customer_id: "cus_1",
				lock_id: "lock_1",
				entity_id: null,
				feature_id: "messages",
				finalValue: 4,
				properties: { model: "small" },
			},
		]);
	});
});

describe("a deduction sent again after a restart", () => {
	test("is the very command sent before: same request id, idempotency key, writer and seq", async () => {
		const folder = createSlotFolder();
		cleanups.push(folder.remove);
		const handedIn: unknown[][] = [];
		/** Each boot's forwarder, recording what it hands Autumn. */
		const boot = () => {
			const sent: unknown[] = [];
			handedIn.push(sent);
			const slot = openSlotProcessor({
				subjectsPath: folder.subjectsPath,
				journal: openJournal({ databasePath: folder.journalPath }),
			});
			const forwarding = createJournalForwarder({
				ctx: {
					autumnClient: {
						appendTracks: async ({ tracks }) => {
							for (const track of tracks)
								sent.push({ writer: track.writerId, ...track });
						},
					},
					logger: { info() {}, warn() {} },
					sleep: () => new Promise(() => {}),
				},
			}).forward({
				journal: slot.journal,
				tokenHash: () => "hash_folder",
				pulls: noFolderPulls,
			});
			return { ...slot, sent, stop: forwarding.stop };
		};

		const first = boot();
		await first.processor.setSubject(
			subjectPushOf({ subject: storedSubjectWith({ balance: 1000 }) }),
		);
		await first.processor.check({ request: sendEvent() });
		await until(() => first.sent.length === 1);
		first.stop();
		first.close();

		// No push showed it applied, so the restarted Atom sends it again.
		const second = boot();
		cleanups.push(() => {
			second.stop();
			second.close();
		});
		await until(() => second.sent.length === 1);

		expect(second.sent).toEqual(first.sent);
		expect(first.sent[0]).toMatchObject({
			seq: 1,
			command: {
				requestId: expect.stringMatching(/^atom_req_/),
				commandId: expect.stringMatching(/^atom_req_/),
				idempotency: { key: expect.stringMatching(/^track:atom_req_/) },
			},
		});
	});
});

describe("one writer per journal file", () => {
	test("two journals for one customer are two writers: a push that has seen w1's tracks clears only w1's", async () => {
		const journals = [0, 1].map(() =>
			openJournal({ databasePath: ":memory:" }),
		);
		const forwarder = forwarderTo({ sleep: () => Bun.sleep(1) });
		for (const journal of journals) {
			const forwarding = forwarder.forward({
				journal,
				tokenHash: () => "hash_folder",
				pulls: { request() {}, settle: async () => {} },
			});
			cleanups.push(() => {
				forwarding.stop();
				journal.close();
			});
			await journal.append({
				customerId: "cus_1",
				command: owedCommand({
					commandId: `writer_${journal.writerId}`,
					value: 10,
				}),
			});
		}
		const [w1, w2] = journals as [Journal, Journal];
		await until(() => journals.every((journal) => nothingUnsent({ journal })));

		for (const journal of journals)
			journal.reconcile({
				customerId: "cus_1",
				atomSeqs: { atom_1: { [w1.writerId]: 1 } },
			});

		expect(
			autumn.applied.map(({ writer, seq }) => [writer, seq]).sort(),
		).toEqual(
			[
				[w1.writerId, 1],
				[w2.writerId, 1],
			].sort(),
		);
		expect(w1.owed({ customerId: "cus_1" })).toEqual([]);
		expect(w2.owed({ customerId: "cus_1" }).map(({ seq }) => seq)).toEqual([1]);
	});
});

describe("a sent deduction no push clears", () => {
	test("sent but no push within the grace: the customer is pulled, and the read clears it", async () => {
		const { processor, journal, sleeps, pulled } = await openForwardedSlot();
		await processor.check({ request: sendEvent() });
		await until(() => nothingUnsent({ journal }));

		(await sleeps.next({ ms: PUSH_GRACE_MS })).wake();
		await until(() => pulled.length > 0);
		expect(pulled).toEqual(["cus_1"]);

		await processor.setSubject(
			subjectPushOf({
				subject: withAtomSeqs({
					subject: storedSubjectWith({ balance: 990, readAt: 2000 }),
					writerSeqs: { [journal.writerId]: 1 },
				}),
			}),
		);
		expect(journal.owed({ customerId: "cus_1" })).toEqual([]);
		expect(await remainingOf({ processor })).toBe(990);
	});

	test("a pull that does not clear it is tried again after another grace, three times at most", async () => {
		const { processor, journal, sleeps, pulled } = await openForwardedSlot();
		await processor.check({ request: sendEvent() });
		await until(() => nothingUnsent({ journal }));

		for (let round = 1; round <= 3; round++) {
			(await sleeps.next({ ms: PUSH_GRACE_MS })).wake();
			await until(() => pulled.length === round);
		}
		await Bun.sleep(10);

		expect(pulled).toEqual(["cus_1", "cus_1", "cus_1"]);
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
	});

	test("a push that clears it within the grace pulls nothing", async () => {
		const { processor, journal, sleeps, pulled } = await openForwardedSlot();
		await processor.check({ request: sendEvent() });
		await until(() => nothingUnsent({ journal }));

		await processor.setSubject(
			subjectPushOf({
				subject: withAtomSeqs({
					subject: storedSubjectWith({ balance: 990, readAt: 2000 }),
					writerSeqs: { [journal.writerId]: 1 },
				}),
			}),
		);
		(await sleeps.next({ ms: PUSH_GRACE_MS })).wake();
		await Bun.sleep(10);

		expect(pulled).toEqual([]);
	});
});

describe("the journal's ceiling, per customer", () => {
	test("ceiling reached: that customer's send_event goes to the API, others are deducted here; after the drain it is deducted here again", async () => {
		let clock = 1_700_000_000_000;
		const { processor, journal, sleeps } = await openForwardedSlot({
			now: () => clock,
		});
		autumn.switches.down = true;

		await processor.check({ request: sendEvent() });
		const retry = await sleeps.next({ ms: 1000 });
		clock += MAX_UNSENT_AGE_MS + 1;

		expect(
			await forwardReasonOf(() => processor.check({ request: sendEvent() })),
		).toBe("journal_backlog");
		expect(
			(
				await checkResponseOf({
					processor,
					request: sendEvent({ customerId: "cus_2" }),
				})
			).allowed,
		).toBe(true);

		autumn.switches.down = false;
		retry.wake();
		await until(() => nothingUnsent({ journal }));
		expect(autumn.applied).toHaveLength(2);
		expect(
			(await checkResponseOf({ processor, request: sendEvent() })).balance
				?.remaining,
		).toBe(980);
	});
});

describe("journals found at boot", () => {
	const folders: string[] = [];
	afterEach(() => {
		for (const folder of folders.splice(0))
			rmSync(folder, { recursive: true, force: true });
	});

	const newFolder = () => {
		const folder = mkdtempSync(join(tmpdir(), "atom-forwarded-"));
		folders.push(folder);
		return folder;
	};

	/** A journal file left by an earlier run, owing `values` from `cus_1`. */
	const leaveJournal = async ({
		folder,
		slot,
		slotCount,
		values,
	}: {
		folder: string;
		slot: number;
		slotCount: number;
		values: number[];
	}) => {
		const journal = openJournal({
			databasePath: journalFilePath({ folder, slot, slotCount }),
		});
		for (const [index, value] of values.entries())
			await journal.append({
				customerId: "cus_1",
				command: owedCommand({ commandId: `left_${index}`, value }),
			});
		journal.close();
	};

	const openFolder = ({
		folder,
		slotCount,
	}: {
		folder: string;
		slotCount: number;
	}) => {
		const slots = openSlots({
			folder,
			slotCount,
			owners: allSlotsOwnedHere,
			held: freshHeld(),
			pulls: { subjectPulls: noSubjectPulls, tokenHash: () => "hash_folder" },
			journalForwarder: forwarderTo({ sleep: () => Bun.sleep(1) }),
		});
		cleanups.push(() => slots.close());
		return slots;
	};

	test("boot with pending rows forwards them", async () => {
		const folder = newFolder();
		await leaveJournal({ folder, slot: 0, slotCount: 1, values: [10, 20] });

		openFolder({ folder, slotCount: 1 });

		await until(() => autumn.applied.length === 2);
		expect(autumn.applied.map(({ value }) => value)).toEqual([10, 20]);
	});

	test("old-split journals are forwarded before deletion: a slot-count change never loses a deduction", async () => {
		const folder = newFolder();
		await leaveJournal({ folder, slot: 3, slotCount: 4, values: [5, 6] });
		autumn.switches.down = true;
		const oldSplit = () =>
			readdirSync(folder).filter((name) => name.includes("-of-004"));

		openFolder({ folder, slotCount: 2 });
		await Bun.sleep(20);
		expect(oldSplit()).not.toEqual([]);

		autumn.switches.down = false;
		await until(() => oldSplit().length === 0);
		expect(autumn.applied.map(({ value }) => value)).toEqual([5, 6]);
	});
});
