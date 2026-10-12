import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { customerIdToSlot } from "../../../src/slots/customerIdToSlot.js";
import { openSlots } from "../../../src/slots/openSlots.js";
import type { Slots, SubjectSource } from "../../../src/slots/types/slots.js";
import type { StoredSubject } from "../../../src/state/types/storedSubject.js";
import {
	allSlotsOwnedHere,
	checkRequestFor,
	checkResponseOf,
	freshHeld,
	storedSubjectWith,
	subjectPushOf,
} from "../utils/atomFixtures.js";

const opened: Slots[] = [];
const directories: string[] = [];
const newFolder = () => {
	const folder = mkdtempSync(join(tmpdir(), "atom-slots-"));
	directories.push(folder);
	return folder;
};
const open = ({ folder, slotCount }: { folder: string; slotCount: number }) => {
	const slots = openSlots({
		folder,
		slotCount,
		owners: allSlotsOwnedHere,
		held: freshHeld(),
	});
	opened.push(slots);
	return slots;
};
afterEach(() => {
	for (const slots of opened.splice(0)) slots.close();
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

const slotFilesIn = (folder: string) =>
	readdirSync(folder)
		.filter((name) => name.startsWith("slot-") && name.endsWith(".sqlite"))
		.sort();

const customerIds = Array.from({ length: 2000 }, (_, i) => `cus_${i}`);

describe("the slot a customer lives in", () => {
	test("is always the same for the same customer, and always one of the slots", async () => {
		for (const customerId of customerIds) {
			const slot = customerIdToSlot({ customerId, slotCount: 128 });

			expect(slot).toBe(customerIdToSlot({ customerId, slotCount: 128 }));
			expect(slot).toBeGreaterThanOrEqual(0);
			expect(slot).toBeLessThan(128);
		}
	});

	test("spreads customers over every slot, none holding far more than its share", async () => {
		const perSlot = new Array<number>(8).fill(0);
		for (const customerId of customerIds)
			perSlot[customerIdToSlot({ customerId, slotCount: 8 })]++;

		// 2000 customers over 8 slots is 250 each when even.
		expect(Math.min(...perSlot)).toBeGreaterThan(200);
		expect(Math.max(...perSlot)).toBeLessThan(300);
	});
});

describe("a data folder's slots", () => {
	test("there is one file per slot, named with the count it was split into", async () => {
		const folder = newFolder();

		open({ folder, slotCount: 4 });

		expect(slotFilesIn(folder)).toEqual([
			"slot-000-of-004.sqlite",
			"slot-001-of-004.sqlite",
			"slot-002-of-004.sqlite",
			"slot-003-of-004.sqlite",
		]);
	});

	test("a customer is found again in the slot it was stored in", async () => {
		const slots = open({ folder: newFolder(), slotCount: 4 });
		const subject = storedSubjectWith({ balance: 10 });

		await slots
			.processorFor({ customerId: "cus_1" })
			.setSubject(subjectPushOf({ subject }));
		const reply = await checkResponseOf({
			processor: slots.processorFor({ customerId: "cus_1" }),
			request: checkRequestFor(),
		});

		expect(reply.allowed).toBe(true);
	});

	test("customers and the count of slots survive a restart", async () => {
		const folder = newFolder();
		const first = open({ folder, slotCount: 4 });
		await first
			.processorFor({ customerId: "cus_1" })
			.setSubject(
				subjectPushOf({ subject: storedSubjectWith({ balance: 10 }) }),
			);
		first.close();
		opened.splice(0);

		const reopened = open({ folder, slotCount: 4 });

		const reply = await checkResponseOf({
			processor: reopened.processorFor({ customerId: "cus_1" }),
			request: checkRequestFor(),
		});

		expect(reply.allowed).toBe(true);
	});

	test("opened with a different count, the old files are dropped: customers would be looked for in the wrong ones", async () => {
		const folder = newFolder();
		const first = open({ folder, slotCount: 4 });
		await first
			.processorFor({ customerId: "cus_1" })
			.setSubject(
				subjectPushOf({ subject: storedSubjectWith({ balance: 10 }) }),
			);
		first.close();
		opened.splice(0);

		open({ folder, slotCount: 2 });

		expect(slotFilesIn(folder)).toEqual([
			"slot-000-of-002.sqlite",
			"slot-001-of-002.sqlite",
		]);
		expect(readdirSync(folder).some((name) => name.includes("-of-004"))).toBe(
			false,
		);
	});
});

describe("a replica catching up from a peer", () => {
	const sourceOf = ({
		pages,
		catalog = null,
	}: {
		pages: (params: {
			slot: number;
			window: number | null;
			cursor: unknown;
		}) => StoredSubject[];
		catalog?: { rows: never[]; readAt: number } | null;
	}) => {
		const asked: { slot: number; window: number | null; cursor: unknown }[] =
			[];
		const source: SubjectSource = {
			since: async ({ slot, window, cursor }) => {
				asked.push({ slot, window, cursor });
				return {
					after: 0,
					subjects: pages({ slot, window, cursor }).map((subject) => ({
						subject,
						appliedAt: subject.readAt,
					})),
				};
			},
			catalog: async () => catalog,
		};
		return { source, asked };
	};

	test("asks each slot it owns for the window given, writes only what is newer than it holds, and takes a newer catalog", async () => {
		const slots = open({ folder: newFolder(), slotCount: 2 });
		const held = storedSubjectWith({ balance: 10, readAt: 120_000 });
		await slots
			.processorFor({ customerId: "cus_1" })
			.setSubject(subjectPushOf({ subject: held }));
		const newer = storedSubjectWith({ balance: 3, readAt: 130_000 });
		const slotOfCus1 = customerIdToSlot({ customerId: "cus_1", slotCount: 2 });
		const { source, asked } = sourceOf({
			pages: ({ slot }) => (slot === slotOfCus1 ? [held, newer] : []),
			catalog: { rows: [], readAt: 5 },
		});

		const result = await slots.catchUp({ source, window: 90_000 });
		const reply = await checkResponseOf({
			processor: slots.processorFor({ customerId: "cus_1" }),
			request: checkRequestFor({ params: { required_balance: 4 } }),
		});

		// The copy already held is not rewritten; the newer one is.
		expect(result).toEqual({ slots: 2, written: 1 });
		expect(asked.map(({ window }) => window)).toEqual([90_000, 90_000]);
		expect(reply.allowed).toBe(false);
		expect(slots.installCatalog({ rows: [], readAt: 4 })).toBe(false);
	});

	test("pages past a full page from the last row's key", async () => {
		const slots = open({ folder: newFolder(), slotCount: 1 });
		const many = Array.from({ length: 500 }, (_, i) => {
			const subject = storedSubjectWith({ balance: 1, readAt: 1_000 });
			return {
				...subject,
				state: {
					...subject.state,
					identity: { ...subject.state.identity, customerId: `cus_${i}` },
				},
			};
		});
		const { source, asked } = sourceOf({
			pages: ({ cursor }) => (cursor ? [] : many),
		});

		const result = await slots.catchUp({ source, window: null });

		expect(result.written).toBe(500);
		expect(asked.length).toBe(2);
		expect(asked[1]?.cursor).toEqual({
			appliedAt: 1_000,
			customerId: "cus_499",
			entityId: "",
		});
	});

	test("answers a peer's listSince from the slot's file, and knows its own newest write", async () => {
		const now = 1_700;
		const slots = openSlots({
			folder: newFolder(),
			slotCount: 2,
			owners: allSlotsOwnedHere,
			held: freshHeld(),
			now: () => now,
		});
		opened.push(slots);
		await slots.processorFor({ customerId: "cus_1" }).setSubject(
			subjectPushOf({
				subject: storedSubjectWith({ balance: 10, readAt: 1 }),
			}),
		);
		const slot = customerIdToSlot({ customerId: "cus_1", slotCount: 2 });

		const since = await slots.listSince({
			slot,
			after: null,
			cursor: null,
			limit: 10,
		});
		const nothingNewer = await slots.listSince({
			slot,
			after: 1_701,
			cursor: null,
			limit: 10,
		});

		expect(since.map((s) => s.appliedAt)).toEqual([1_700]);
		expect(nothingNewer).toEqual([]);
		expect(slots.maxAppliedAt()).toBe(1_700);
		expect(slots.listOwnAppliedAfter({ after: 1_700, limit: 10 }).length).toBe(
			1,
		);
	});
});
