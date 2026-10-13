import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TrackCommand } from "@autumn/balance-engine";
import { createTrackCommand } from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { getAtomLogger } from "../../../src/lib/logging/getAtomLogger.js";
import { createSlotProcessor } from "../../../src/processor/createSlotProcessor.js";
import type { SlotProcessorContext } from "../../../src/processor/types/slotProcessor.js";
import type { Journal } from "../../../src/state/journal/types/journal.js";
import { openCatalogStore } from "../../../src/state/openCatalogStore.js";
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

/** One slot's processor; `journal` null is a deployment whose writes flag is off. */
export const openSlotProcessor = ({
	subjectsPath = ":memory:",
	journal,
}: {
	subjectsPath?: string;
	journal: Journal | null;
}) => {
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
	};
	return {
		ctx,
		processor: createSlotProcessor({ ctx }),
		close: () => {
			sqliteStore.close();
			catalogStore.close();
			journal?.close();
		},
	};
};

/** A deduction of `value` messages from `cus_1`, as the Atom journals one it granted. */
export const owedCommand = ({
	commandId,
	value,
}: {
	commandId: string;
	value: number;
}): TrackCommand => ({
	...createTrackCommand({ commandId, value, overageBehavior: "overflow" }),
	enforceOverdueBlock: true,
});
