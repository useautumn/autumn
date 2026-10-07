import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAtomLogger } from "../lib/logging/getAtomLogger.js";
import { createSlotProcessor } from "../processor/createSlotProcessor.js";
import { openCatalogStore } from "../state/openCatalogStore.js";
import { openSqliteStore } from "../state/openSqliteStore.js";
import { customerIdToSlot } from "./customerIdToSlot.js";
import { removeSlotFilesOfOtherCounts, slotFilePath } from "./slotFiles.js";
import type { Slots } from "./types/slots.js";

export const CATALOG_FILE = "catalog.sqlite";

/** The filesystem the folder sits on, as Linux lists it: a volume shows as its device, the container's own disk as overlay. */
const mountOf = ({ folder }: { folder: string }): string | null => {
	try {
		const mounts = readFileSync("/proc/mounts", "utf8")
			.split("\n")
			.map((line) => line.split(" "))
			.filter(([, mountPoint]) => mountPoint && folder.startsWith(mountPoint));
		const deepest = mounts.sort(
			(a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0),
		)[0];
		return deepest ? `${deepest[0]} on ${deepest[1]} (${deepest[2]})` : null;
	} catch {
		return null;
	}
};

/** Opens a data folder once: one file per slot and the one catalog they share stay open, and each slot's processor answers from its own file. */
export const openSlots = ({
	folder,
	slotCount,
}: {
	folder: string;
	slotCount: number;
}): Slots => {
	// Counted before anything is created: an empty folder on a restart means the volume did not come back.
	const filesFound = existsSync(folder) ? readdirSync(folder).length : 0;
	mkdirSync(folder, { recursive: true });
	removeSlotFilesOfOtherCounts({ folder, slotCount });

	const catalogStore = openCatalogStore({
		databasePath: join(folder, CATALOG_FILE),
	});
	const logger = getAtomLogger();
	const slots = Array.from({ length: slotCount }, (_, slot) => {
		const sqliteStore = openSqliteStore({
			databasePath: slotFilePath({ folder, slot, slotCount }),
		});
		return {
			sqliteStore,
			processor: createSlotProcessor({
				ctx: { sqliteStore, catalogStore, logger },
			}),
		};
	});

	const subjects = slots.reduce(
		(count, { sqliteStore }) => count + sqliteStore.countSubjects(),
		0,
	);
	logger.info(
		{
			type: "atom_data_opened",
			data: {
				folder,
				mount: mountOf({ folder }),
				filesFound,
				slotCount,
				subjects,
				catalogReadAt: catalogStore.read()?.readAt ?? null,
			},
		},
		`Opened ${folder} (${mountOf({ folder }) ?? "mount unknown"}): ${filesFound} files found, ${slotCount} slots, ${subjects} subjects, catalog ${catalogStore.read() ? "present" : "absent"}`,
	);

	function close(): void {
		for (const { sqliteStore } of slots) sqliteStore.close();
		catalogStore.close();
	}

	return {
		processorFor: ({ customerId }) =>
			slots[customerIdToSlot({ customerId, slotCount })].processor,
		setCatalog: (params) => catalogStore.set(params),
		close,
	};
};
