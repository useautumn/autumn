import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const SLOT_FILE = /^slot-\d+-of-(\d+)\.sqlite/;

const padded = (value: number) => String(value).padStart(3, "0");

/** The count is in the name, so a file can only ever be read under the split it was written with. */
export const slotFilePath = ({
	folder,
	slot,
	slotCount,
}: {
	folder: string;
	slot: number;
	slotCount: number;
}): string =>
	join(folder, `slot-${padded(slot)}-of-${padded(slotCount)}.sqlite`);

/** Files from another slot count hold customers this split would look for elsewhere: they are dropped, and Autumn sends the customers again. */
export const removeSlotFilesOfOtherCounts = ({
	folder,
	slotCount,
}: {
	folder: string;
	slotCount: number;
}): void => {
	for (const name of readdirSync(folder)) {
		const countInName = SLOT_FILE.exec(name)?.[1];
		if (countInName === undefined || Number(countInName) === slotCount)
			continue;
		rmSync(join(folder, name), { force: true });
	}
};

const JOURNAL_FILE = /^journal-(\d+)-of-(\d+)\.sqlite$/;

/** A slot's journal sits beside its file, named the same way, so a split only ever reads the journals it wrote. */
export const journalFilePath = ({
	folder,
	slot,
	slotCount,
}: {
	folder: string;
	slot: number;
	slotCount: number;
}): string =>
	join(folder, `journal-${padded(slot)}-of-${padded(slotCount)}.sqlite`);

/** Journals another split wrote: no slot of this one appends to them, but what they hold is still owed to Autumn. */
export const journalFilesOfOtherCounts = ({
	folder,
	slotCount,
}: {
	folder: string;
	slotCount: number;
}): { path: string; slot: number }[] =>
	readdirSync(folder).flatMap((name) => {
		const [, slot, countInName] = JOURNAL_FILE.exec(name) ?? [];
		if (slot === undefined || Number(countInName) === slotCount) return [];
		return [{ path: join(folder, name), slot: Number(slot) }];
	});

/** A journal and its log, once everything it held has reached Autumn. */
export const removeJournalFiles = ({ path }: { path: string }): void => {
	for (const suffix of ["", "-wal", "-shm"])
		rmSync(`${path}${suffix}`, { force: true });
};
