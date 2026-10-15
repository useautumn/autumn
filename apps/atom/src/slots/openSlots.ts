import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
	Forwarding,
	JournalForwarder,
} from "../journalForwarder/types/journalForwarder.js";
import { getAtomLogger } from "../lib/logging/getAtomLogger.js";
import { createSlotProcessor } from "../processor/createSlotProcessor.js";
import type { HandoffBarrier } from "../replicas/handover/createHandoffBarrier.js";
import type { CustomerHandoff } from "../replicas/handover/types/customerHandoff.js";
import type { ReplicaRing } from "../replicas/types/replicaRing.js";
import type { KeyRelay } from "../replication/keys/createKeyRelay.js";
import type { HeldSubjects } from "../state/heldSubjects/types/heldSubjects.js";
import { openJournal } from "../state/journal/openJournal.js";
import type { Journal } from "../state/journal/types/journal.js";
import { openCatalogStore } from "../state/openCatalogStore.js";
import {
	createOpenLocks,
	type OpenLocks,
} from "../state/openLocks/createOpenLocks.js";
import { openSqliteStore } from "../state/openSqliteStore.js";
import type { SubjectPulls } from "../subjectPulls/types/subjectPulls.js";
import type { CatalogUpdate } from "../threads/owners/types/ownerCall.js";
import type { SlotOwners } from "../threads/owners/types/slotOwners.js";
import { customerIdToSlot } from "./customerIdToSlot.js";
import { catchUp } from "./replica/catchUp.js";
import { copyRecentKeys } from "./replica/copyRecentKeys.js";
import { serveReplicaReads } from "./replica/serveReplicaReads.js";
import type { ReplicaSlotsContext } from "./replica/types/replicaSlotsContext.js";
import {
	journalFilePath,
	journalFilesOfOtherCounts,
	removeJournalFiles,
	removeSlotFilesOfOtherCounts,
	slotFilePath,
} from "./slotFiles.js";
import type { OpenedSlot } from "./types/openedSlot.js";
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

/** Opens a data folder once: this thread's slot files and the one catalog they share stay open. */
export const openSlots = ({
	folder,
	slotCount,
	atomId = null,
	owners,
	held,
	now = Date.now,
	pulls,
	journalForwarder,
	barrier,
	ring,
	keyRelay,
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
	/** This thread's pulls, and the token hash the folder proves itself with. */
	pulls: { subjectPulls: SubjectPulls; tokenHash: () => string };
	/** This thread's way to hand Autumn what its slots' journals hold. */
	journalForwarder: JournalForwarder;
	/** Holds a moved customer's first requests until the old owner's entries for it have landed on this thread. */
	barrier?: HandoffBarrier;
	/** Who owns each customer across the replicas: a request for one that moved away is refused, not decided here. */
	ring?: Pick<ReplicaRing, "self" | "ownerOf">;
	/** This thread's way to relay the idempotency keys its slots' journals take to the other replicas. */
	keyRelay?: KeyRelay;
}): Slots => {
	// Counted before anything is created: an empty folder on a restart means the volume did not come back.
	const filesFound = existsSync(folder) ? readdirSync(folder).length : 0;
	mkdirSync(folder, { recursive: true });
	removeSlotFilesOfOtherCounts({ folder, slotCount });

	const catalogStore = openCatalogStore({
		databasePath: join(folder, CATALOG_FILE),
	});
	const logger = getAtomLogger();
	// A miss is decided on the slot's owner thread, so the pulled body is stored there too.
	const subjectPulls = pulls.subjectPulls.forFolder({
		tokenHash: pulls.tokenHash,
		applyPulled: async ({ customerId, body }) =>
			(await processorFor({ customerId }).setSubject({ customerId, body }))
				.stored,
	});
	const journals: Journal[] = [];
	/** The locks each live slot took, beside its journal: handed over together, customer by customer. */
	const openLocksOf = new Map<Journal, OpenLocks>();
	const forwardings: Forwarding[] = [];
	const forwardedOf = ({ journal }: { journal: Journal }) => ({
		journal,
		tokenHash: pulls.tokenHash,
		pulls: subjectPulls,
	});
	const slots = Array.from({ length: slotCount }, (_, slot): OpenedSlot => {
		const owner = owners.ownerOf({ slot });
		if (owner !== owners.index)
			return {
				sqliteStore: null,
				journal: null,
				processor: owners.processorOn({ thread: owner, atomId }),
			};
		const sqliteStore = openSqliteStore({
			databasePath: slotFilePath({ folder, slot, slotCount }),
			held,
			now,
		});
		const journal = openJournal({
			databasePath: journalFilePath({ folder, slot, slotCount }),
			onKeysCommitted: (keys) => keyRelay?.relayKeys({ atomId, keys }),
		});
		const openLocks = createOpenLocks();
		journals.push(journal);
		openLocksOf.set(journal, openLocks);
		forwardings.push(journalForwarder.forward(forwardedOf({ journal })));
		return {
			sqliteStore,
			journal,
			processor: createSlotProcessor({
				ctx: {
					sqliteStore,
					catalogStore,
					logger,
					subjectPulls,
					journal,
					openLocks,
					barrier,
					ring,
				},
			}),
		};
	});

	/** Per slot, each customer's owed entries, open locks and recent keys as one handoff: what Autumn already applied travels too. */
	const ownedHandoffs = async (): Promise<CustomerHandoff[]> =>
		(
			await Promise.all(
				journals.map(async (journal) => {
					const byCustomer = new Map<string, CustomerHandoff>();
					const handoffOf = (customerId: string) => {
						const handoff = byCustomer.get(customerId) ?? {
							customerId,
							entries: [],
							locks: [],
							keys: [],
						};
						byCustomer.set(customerId, handoff);
						return handoff;
					};
					for (const { customerId, entries } of await journal.handoffs())
						handoffOf(customerId).entries.push(...entries);
					for (const { customerId, locks } of openLocksOf.get(journal)?.all() ??
						[])
						handoffOf(customerId).locks.push(...locks);
					for (const [customerId, keys] of journal.keysToHand())
						handoffOf(customerId).keys.push(...keys);
					return [...byCustomer.values()];
				}),
			)
		).flat();

	// Another split's journal is retired by the thread that owned its slot, once Autumn holds what it owes.
	for (const { path, slot } of journalFilesOfOtherCounts({
		folder,
		slotCount,
	})) {
		if (owners.ownerOf({ slot }) !== owners.index) continue;
		const journal = openJournal({ databasePath: path });
		journals.push(journal);
		forwardings.push(
			journalForwarder.retire({
				...forwardedOf({ journal }),
				retired: () => {
					journal.close();
					removeJournalFiles({ path });
				},
			}),
		);
	}

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
		for (const forwarding of forwardings) forwarding.stop();
		for (const { sqliteStore } of slots) sqliteStore?.close();
		for (const journal of journals) journal.close();
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

	function processorFor({ customerId }: { customerId: string }) {
		return slots[customerIdToSlot({ customerId, slotCount })].processor;
	}

	const ctx: ReplicaSlotsContext = {
		slots,
		slotCount,
		owners,
		catalogStore,
		atomId,
	};
	return {
		atomId,
		slotCount,
		processorFor,
		setCatalog,
		installCatalog: (params) => catalogStore.install(params),
		...serveReplicaReads({ ctx }),
		ownedStores: () =>
			slots.flatMap(({ sqliteStore }) => (sqliteStore ? [sqliteStore] : [])),
		ownedJournals: () => [...journals],
		ownedHandoffs,
		catchUp: (params) => catchUp({ ctx, setCatalog, ...params }),
		copyRecentKeys: ({ source }) => copyRecentKeys({ ctx, source }),
		close,
	};
};
