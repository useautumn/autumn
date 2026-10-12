import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAtomLogger } from "../lib/logging/getAtomLogger.js";
import { createSlotProcessor } from "../processor/createSlotProcessor.js";
import type { SlotProcessor } from "../processor/types/slotProcessor.js";
import type { HeldSubjects } from "../state/heldSubjects/types/heldSubjects.js";
import { openCatalogStore } from "../state/openCatalogStore.js";
import { openSqliteStore } from "../state/openSqliteStore.js";
import type {
	AppliedSubject,
	SubjectCursor,
} from "../state/repos/subjectStates.js";
import type { SqliteStore } from "../state/types/sqliteStore.js";
import type { CatalogUpdate } from "../threads/owners/types/ownerCall.js";
import type { SlotOwners } from "../threads/owners/types/slotOwners.js";
import { customerIdToSlot } from "./customerIdToSlot.js";
import { removeSlotFilesOfOtherCounts, slotFilePath } from "./slotFiles.js";
import type { SinceRequest, Slots, SubjectSource } from "./types/slots.js";

export const CATALOG_FILE = "catalog.sqlite";
/** Subjects copied from a peer per request. */
const CATCH_UP_PAGE = 500;

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
	held,
	now = Date.now,
}: {
	folder: string;
	slotCount: number;
	/** The folder's name on a multi-tenant Atom, so a call to another thread names it too. */
	atomId?: string | null;
	owners: SlotOwners;
	/** This thread's parsed subjects, shared by every store it opens. */
	held: HeldSubjects;
	/** This replica's clock, stamped on every write. */
	now?: () => number;
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
			held,
			now,
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

	async function listSince(params: SinceRequest): Promise<AppliedSubject[]> {
		const store = slots[params.slot]?.sqliteStore;
		if (store) return store.listAppliedAfter(params);
		const owner = owners.ownerOf({ slot: params.slot });
		return owners.listSinceOn({ thread: owner, atomId, ...params });
	}

	function ownedStores(): SqliteStore[] {
		return slots.flatMap(({ sqliteStore }) =>
			sqliteStore ? [sqliteStore] : [],
		);
	}

	function listOwnAppliedAfter({
		after,
		limit,
	}: {
		after: number;
		limit: number;
	}): AppliedSubject[] {
		return ownedStores()
			.flatMap((store) =>
				store.listAppliedAfter({ after, cursor: null, limit }),
			)
			.sort((a, b) => a.appliedAt - b.appliedAt)
			.slice(0, limit);
	}

	type Version = { readAt: number; logOffset: bigint };
	const isNewer = (a: Version, b: Version) =>
		a.readAt > b.readAt || (a.readAt === b.readAt && a.logOffset > b.logOffset);

	/** Only what is newer than the row held is written, so a pass over what is already held rewrites nothing. */
	function writeNewer({
		store,
		page,
	}: {
		store: SqliteStore;
		page: AppliedSubject[];
	}): number {
		const subjects = page
			.map(({ subject }) => subject)
			.filter((subject) => {
				const { customerId, entityId } = subject.state.identity;
				const held = store.readVersion({
					customerId,
					entityId: entityId ?? null,
				});
				return !held || isNewer(subject, held);
			});
		if (subjects.length === 0) return 0;
		return store.setSubjects({ subjects }).filter(Boolean).length;
	}

	/** Pages until a short one, each page starting past the last row of the one before. */
	async function catchUp({
		source,
		window,
	}: {
		source: SubjectSource;
		window: number | null;
	}) {
		const catalog = await source.catalog({
			readAtAfter: catalogStore.read()?.readAt ?? -1,
		});
		if (catalog) await setCatalog(catalog);
		let written = 0;
		let synced = 0;
		for (const [slot, { sqliteStore }] of slots.entries()) {
			if (!sqliteStore) continue;
			let after: number | null = null;
			let cursor: SubjectCursor | null = null;
			let first = true;
			for (;;) {
				const page = await source.since({
					slot,
					slotCount,
					after: first ? null : after,
					window: first ? window : null,
					cursor,
					limit: CATCH_UP_PAGE,
				});
				first = false;
				after = page.after;
				written += writeNewer({ store: sqliteStore, page: page.subjects });
				const last = page.subjects.at(-1);
				if (!last || page.subjects.length < CATCH_UP_PAGE) break;
				cursor = {
					appliedAt: last.appliedAt,
					customerId: last.subject.state.identity.customerId,
					entityId: last.subject.state.identity.entityId ?? "",
				};
			}
			synced += 1;
		}
		return { slots: synced, written };
	}

	return {
		slotCount,
		processorFor: ({ customerId }) =>
			slots[customerIdToSlot({ customerId, slotCount })].processor,
		setCatalog,
		installCatalog: (params) => catalogStore.install(params),
		catalogSince: ({ readAtAfter }) => {
			const held = catalogStore.rows();
			return held && held.readAt > readAtAfter ? held : null;
		},
		listSince,
		maxAppliedAt: () =>
			Math.max(0, ...ownedStores().map((store) => store.maxAppliedAt())),
		listOwnAppliedAfter,
		catchUp,
		close,
	};
};
