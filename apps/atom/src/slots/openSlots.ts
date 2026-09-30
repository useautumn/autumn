import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getAtomLogger } from "../lib/logging/getAtomLogger.js";
import { createSlotProcessor } from "../processor/createSlotProcessor.js";
import { openCatalogStore } from "../state/openCatalogStore.js";
import { openSqliteStore } from "../state/openSqliteStore.js";
import { customerIdToSlot } from "./customerIdToSlot.js";
import { removeSlotFilesOfOtherCounts, slotFilePath } from "./slotFiles.js";
import type { Slots } from "./types/slots.js";

const CATALOG_FILE = "catalog.sqlite";

/** Opens a data folder once: one file per slot and the one catalog they share stay open, and each slot's processor answers from its own file. */
export const openSlots = ({
	folder,
	slotCount,
}: {
	folder: string;
	slotCount: number;
}): Slots => {
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
