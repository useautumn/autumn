import { mkdirSync } from "node:fs";
import { ATOM_IDEMPOTENCY_TTL_MS } from "@autumn/byoc";
import { journalFilePath } from "../../../src/slots/slotFiles.js";
import { openJournalDatabase } from "../../../src/state/journal/openJournalDatabase.js";
import { journalKeyHash } from "../../../src/state/repos/journalKeys.js";

/**
 * A slot's journal as a long-running Atom holds it before the Atom opens it: `rows` of one customer's keys spread evenly
 * over the key TTL, so from the first 60 s prune on, each prune deletes one minute's worth against a full-size table.
 */
export const preloadJournalKeys = ({
	folder,
	slot,
	slotCount,
	customerId,
	rows,
}: {
	folder: string;
	slot: number;
	slotCount: number;
	customerId: string;
	rows: number;
}): { rows: number; ms: number } => {
	const startedAt = Date.now();
	mkdirSync(folder, { recursive: true });
	const database = openJournalDatabase({
		databasePath: journalFilePath({ folder, slot, slotCount }),
	});
	const insert = database.query(
		"INSERT OR IGNORE INTO journal_keys (customer_id, key_hash, appended_at) VALUES ($customerId, $keyHash, $appendedAt)",
	);
	const oldest = startedAt - ATOM_IDEMPOTENCY_TTL_MS;
	database.transaction(() => {
		for (let i = 0; i < rows; i++)
			insert.run({
				customerId,
				keyHash: journalKeyHash({ key: `preload-${i}` }),
				appendedAt: Math.floor(oldest + (i / rows) * ATOM_IDEMPOTENCY_TTL_MS),
			});
	})();
	database.prepare("PRAGMA wal_checkpoint(TRUNCATE)").all();
	database.close();
	return { rows, ms: Date.now() - startedAt };
};
