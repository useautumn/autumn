import { type Catalog, mergeCatalogs } from "@autumn/balance-engine";
import type { JournalEntry } from "../../../state/journal/types/journal.js";
import type { SharedCatalog } from "../../../state/types/catalogStore.js";
import {
	isDeletedSubject,
	type StoredSubject,
} from "../../../state/types/storedSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { freshestCatalog } from "./freshestCatalog.js";
import { owedEntityIdOf } from "./replayOwed.js";

/** The live copy of each entity an owed entry names, beside `copies`: the parts an entity's entries are replayed on. */
export const withOwedEntityCopies = ({
	ctx,
	customerId,
	copies,
	owed,
}: {
	ctx: SlotProcessorContext;
	customerId: string;
	copies: ReadonlyMap<string, StoredSubject>;
	owed: readonly JournalEntry[];
}): ReadonlyMap<string, StoredSubject> => {
	let named: Map<string, StoredSubject> | null = null;
	for (const entry of owed) {
		const entityId = owedEntityIdOf(entry);
		if (entityId === null || (named ?? copies).has(entityId)) continue;
		const row = ctx.sqliteStore.readSubject({ customerId, entityId });
		if (!row || isDeletedSubject(row)) continue;
		named ??= new Map(copies);
		named.set(entityId, row);
	}
	return named ?? copies;
};

/** The part read later is merged last, so where two hold a row its copy is the one kept. */
export const joinedCatalogOf = ({
	parts,
	shared,
}: {
	parts: StoredSubject[];
	shared: SharedCatalog | null;
}): Catalog => {
	const partsOldestFirst = [...parts].sort(
		(left, right) => left.readAt - right.readAt,
	);
	return mergeCatalogs({
		catalogs: partsOldestFirst.map((stored) =>
			freshestCatalog({ stored, shared }),
		),
	});
};
