import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAtomLogger } from "../lib/logging/getAtomLogger.js";
import { createSlotProcessor } from "../processor/createSlotProcessor.js";
import type { HeldSubjects } from "../state/heldSubjects/types/heldSubjects.js";
import { openCatalogStore } from "../state/openCatalogStore.js";
import { openSqliteStore } from "../state/openSqliteStore.js";
import type { SubjectPulls } from "../subjectPulls/types/subjectPulls.js";
import type { CatalogUpdate } from "../threads/owners/types/ownerCall.js";
import type { SlotOwners } from "../threads/owners/types/slotOwners.js";
import { customerIdToSlot } from "./customerIdToSlot.js";
import { catchUp } from "./replica/catchUp.js";
import { serveReplicaReads } from "./replica/serveReplicaReads.js";
import type { ReplicaSlotsContext } from "./replica/types/replicaSlotsContext.js";
import { removeSlotFilesOfOtherCounts, slotFilePath } from "./slotFiles.js";
import type { OpenedSlot } from "./types/openedSlot.js";
import type { Slots } from "./types/slots.js";

export const CATALOG_FILE = "catalog.sqlite";

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

export const openSlots = ({
	folder,
	slotCount,
	atomId = null,
	owners,
	held,
	now = Date.now,
	pulls,
}: {
	folder: string;
	slotCount: number;
	atomId?: string | null;
	owners: SlotOwners;
	held: HeldSubjects;
	now?: () => number;
	pulls: { subjectPulls: SubjectPulls; tokenHash: () => string };
}): Slots => {
	const filesFound = existsSync(folder) ? readdirSync(folder).length : 0;
	mkdirSync(folder, { recursive: true });
	removeSlotFilesOfOtherCounts({ folder, slotCount });

	const catalogStore = openCatalogStore({
		databasePath: join(folder, CATALOG_FILE),
	});
	const logger = getAtomLogger();
	const subjectPulls = pulls.subjectPulls.forFolder({
		tokenHash: pulls.tokenHash,
		applyPulled: ({ customerId, body }) =>
			processorFor({ customerId }).setSubject({ customerId, body }),
	});
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
				ctx: { sqliteStore, catalogStore, logger, subjectPulls },
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
		catchUp: (params) => catchUp({ ctx, setCatalog, ...params }),
		close,
	};
};
