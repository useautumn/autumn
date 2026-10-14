import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const SLOT_FILE = /^slot-\d+-of-(\d+)\.sqlite/;

const padded = (value: number) => String(value).padStart(3, "0");

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
