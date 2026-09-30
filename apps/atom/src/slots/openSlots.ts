import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getAtomLogger } from "../lib/logging/getAtomLogger.js";
import { createSlotProcessor } from "../processor/createSlotProcessor.js";
import { openCatalogStore } from "../state/openCatalogStore.js";
import { openSqliteStore } from "../state/openSqliteStore.js";
import type { Slots } from "./types/slots.js";

/** One slot file holds every customer until slots are split. */
const SLOT_FILE = "slot-000.sqlite";
const CATALOG_FILE = "catalog.sqlite";

/** Opens a data folder once: its files stay open, and its processor answers from them. */
export const openSlots = ({ folder }: { folder: string }): Slots => {
	mkdirSync(folder, { recursive: true });
	const sqliteStore = openSqliteStore({
		databasePath: join(folder, SLOT_FILE),
	});
	const catalogStore = openCatalogStore({
		databasePath: join(folder, CATALOG_FILE),
	});
	const processor = createSlotProcessor({
		ctx: { sqliteStore, catalogStore, logger: getAtomLogger() },
	});

	function close(): void {
		sqliteStore.close();
		catalogStore.close();
	}

	return {
		processorFor: () => processor,
		setCatalog: (params) => catalogStore.set(params),
		close,
	};
};
