import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { customerIdToSlot } from "../../../src/slots/customerIdToSlot.js";
import { openSlots } from "../../../src/slots/openSlots.js";
import type { Slots } from "../../../src/slots/types/slots.js";
import {
	checkRequestFor,
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
	const slots = openSlots({ folder, slotCount });
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
	test("is always the same for the same customer, and always one of the slots", () => {
		for (const customerId of customerIds) {
			const slot = customerIdToSlot({ customerId, slotCount: 128 });

			expect(slot).toBe(customerIdToSlot({ customerId, slotCount: 128 }));
			expect(slot).toBeGreaterThanOrEqual(0);
			expect(slot).toBeLessThan(128);
		}
	});

	test("spreads customers over every slot, none holding far more than its share", () => {
		const perSlot = new Array<number>(8).fill(0);
		for (const customerId of customerIds)
			perSlot[customerIdToSlot({ customerId, slotCount: 8 })]++;

		// 2000 customers over 8 slots is 250 each when even.
		expect(Math.min(...perSlot)).toBeGreaterThan(200);
		expect(Math.max(...perSlot)).toBeLessThan(300);
	});
});

describe("a data folder's slots", () => {
	test("there is one file per slot, named with the count it was split into", () => {
		const folder = newFolder();

		open({ folder, slotCount: 4 });

		expect(slotFilesIn(folder)).toEqual([
			"slot-000-of-004.sqlite",
			"slot-001-of-004.sqlite",
			"slot-002-of-004.sqlite",
			"slot-003-of-004.sqlite",
		]);
	});

	test("a customer is found again in the slot it was stored in", () => {
		const slots = open({ folder: newFolder(), slotCount: 4 });
		const subject = storedSubjectWith({ balance: 10 });

		slots
			.processorFor({ customerId: "cus_1" })
			.setSubject(subjectPushOf({ subject }));
		const reply = slots
			.processorFor({ customerId: "cus_1" })
			.check({ request: checkRequestFor() });

		expect(reply.allowed).toBe(true);
	});

	test("customers and the count of slots survive a restart", () => {
		const folder = newFolder();
		const first = open({ folder, slotCount: 4 });
		first
			.processorFor({ customerId: "cus_1" })
			.setSubject(
				subjectPushOf({ subject: storedSubjectWith({ balance: 10 }) }),
			);
		first.close();
		opened.splice(0);

		const reopened = open({ folder, slotCount: 4 });

		expect(
			reopened
				.processorFor({ customerId: "cus_1" })
				.check({ request: checkRequestFor() }).allowed,
		).toBe(true);
	});

	test("opened with a different count, the old files are dropped: customers would be looked for in the wrong ones", () => {
		const folder = newFolder();
		const first = open({ folder, slotCount: 4 });
		first
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
