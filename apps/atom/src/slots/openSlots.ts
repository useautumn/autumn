import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAtomLogger } from "../lib/logging/getAtomLogger.js";
import { createSlotProcessor } from "../processor/createSlotProcessor.js";
import type { SlotProcessor } from "../processor/types/slotProcessor.js";
import { openCatalogStore } from "../state/openCatalogStore.js";
import { openSqliteStore } from "../state/openSqliteStore.js";
import type { SqliteStore } from "../state/types/sqliteStore.js";
import type { CatalogUpdate } from "../threads/owners/types/ownerCall.js";
import type { SlotOwners } from "../threads/owners/types/slotOwners.js";
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

/** A slot this thread owns answers from its own file; any other is answered on the thread that owns it. */
type OpenedSlot = { sqliteStore: SqliteStore | null; processor: SlotProcessor };

/** Opens a data folder once: this thread's slot files and the one catalog they share stay open. */
export const openSlots = ({
	folder,
	slotCount,
	atomId = null,
	owners,
}: {
	folder: string;
	slotCount: number;
	/** The folder's name on a multi-tenant Atom, so a call to another thread names it too. */
	atomId?: string | null;
	owners: SlotOwners;
}): Slots => {
	// Counted before anything is created: an empty folder on a restart means the volume did not come back.
	const filesFound = existsSync(folder) ? readdirSync(folder).length : 0;
	mkdirSync(folder, { recursive: true });
	removeSlotFilesOfOtherCounts({ folder, slotCount });

	const catalogStore = openCatalogStore({
		databasePath: join(folder, CATALOG_FILE),
	});
	const logger = getAtomLogger();
	const slots = Array.from({ length: slotCount }, (_, slot): OpenedSlot => {
		const owner = owners.ownerOf({ slot });
		if (owner !== owners.index)
			return {
				sqliteStore: null,
				processor: owners.processorOn({ thread: owner, atomId }),
			};
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
		(count, { sqliteStore }) => count + (sqliteStore?.countSubjects() ?? 0),
		0,
	);
	logger.info(
		{
			type: "atom_data_opened",
			data: {
				folder,
				thread: owners.index,
				mount: mountOf({ folder }),
				filesFound,
				slotCount,
				subjects,
				catalogReadAt: catalogStore.read()?.readAt ?? null,
			},
		},
		`Opened ${folder} (${mountOf({ folder }) ?? "mount unknown"}) on thread ${owners.index}: ${filesFound} files found, ${slotCount} slots, ${subjects} subjects held here, catalog ${catalogStore.read() ? "present" : "absent"}`,
	);

	function close(): void {
		for (const { sqliteStore } of slots) sqliteStore?.close();
		catalogStore.close();
	}

	/**
	 * The catalog's file belongs to slot 0's owner, which hands each stored catalog to every other thread. A thread
	 * that is restarting misses the hand-off and reads the file as it opens, so the push still counts as stored.
	 */
	async function setCatalog(params: CatalogUpdate): Promise<boolean> {
		const catalogOwner = owners.ownerOf({ slot: 0 });
		if (catalogOwner !== owners.index)
			return owners
				.catalogOn({ thread: catalogOwner, atomId })
				.setCatalog(params);
		if (!catalogStore.set(params)) return false;
		const others = Array.from(
			{ length: owners.threads },
			(_, thread) => thread,
		).filter((thread) => thread !== owners.index);
		await Promise.allSettled(
			others.map((thread) =>
				owners.catalogOn({ thread, atomId }).installCatalog(params),
			),
		);
		return true;
	}

	return {
		processorFor: ({ customerId }) =>
			slots[customerIdToSlot({ customerId, slotCount })].processor,
		setCatalog,
		installCatalog: (params) => catalogStore.install(params),
		close,
	};
};
