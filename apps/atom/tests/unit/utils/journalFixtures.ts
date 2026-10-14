import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TrackCommand } from "@autumn/balance-engine";
import { createTrackCommand } from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { getAtomLogger } from "../../../src/lib/logging/getAtomLogger.js";
import { createSlotProcessor } from "../../../src/processor/createSlotProcessor.js";
import type { SlotProcessorContext } from "../../../src/processor/types/slotProcessor.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import type { Journal } from "../../../src/state/journal/types/journal.js";
import { openCatalogStore } from "../../../src/state/openCatalogStore.js";
import { createOpenLocks } from "../../../src/state/openLocks/createOpenLocks.js";
import { openSqliteStore } from "../../../src/state/openSqliteStore.js";
import { freshHeld, noFolderPulls } from "./atomFixtures.js";

/** A slot on disk with its journal beside it, so a test can reopen both as a restart would. */
export const createSlotFolder = () => {
	const folder = mkdtempSync(join(tmpdir(), "atom-slot-"));
	return {
		subjectsPath: join(folder, "slot-000-of-001.sqlite"),
		journalPath: join(folder, "journal-000-of-001.sqlite"),
		remove: () => rmSync(folder, { recursive: true, force: true }),
	};
};

/** One slot's processor, its journal in memory unless one is given. */
export const openSlotProcessor = ({
	subjectsPath = ":memory:",
	journal = openJournal({ databasePath: ":memory:" }),
}: {
	subjectsPath?: string;
	journal?: Journal;
} = {}) => {
	const sqliteStore = openSqliteStore({
		databasePath: subjectsPath,
		held: freshHeld(),
	});
	const catalogStore = openCatalogStore({ databasePath: ":memory:" });
	const ctx: SlotProcessorContext = {
		sqliteStore,
		catalogStore,
		logger: getAtomLogger(),
		subjectPulls: noFolderPulls,
		journal,
		openLocks: createOpenLocks(),
	};
	return {
		ctx,
		journal,
		processor: createSlotProcessor({ ctx }),
		close: () => {
			sqliteStore.close();
			catalogStore.close();
			journal.close();
		},
	};
};

/** A deduction of `value` messages from the customer (`cus_1` unless named), as the Atom journals one it granted. */
export const owedCommand = ({
	commandId,
	value,
	customerId = "cus_1",
}: {
	commandId: string;
	value: number;
	customerId?: string;
}): TrackCommand => {
	const command = createTrackCommand({
		commandId,
		value,
		overageBehavior: "overflow",
	});
	return {
		...command,
		identity: { ...command.identity, customerId },
		enforceOverdueBlock: true,
	};
};
