import type { Database } from "bun:sqlite";
import { sharedJson, sharedTextHash } from "../sharedJson.js";
import type { StoredSubject } from "../types/storedSubject.js";

type SlotContext = { sqliteDb: Database };

/** The customer's own rows are stored under no entity. */
const CUSTOMER_ENTITY_ID = "";

export type SubjectStateRow = {
	logOffset: bigint;
	readAt: bigint;
	stateJson: string;
	catalogHash: string;
	orgHash: string;
};

/** Rows were validated where they entered (the request that stored them), so reading only parses JSON. The customer's own state is parsed per row; its catalog and org are mostly the org's, shared. */
export const storedSubjectFromRow = ({
	ctx,
	row,
}: {
	ctx: SlotContext;
	row: SubjectStateRow;
}): StoredSubject => ({
	state: JSON.parse(row.stateJson),
	catalog: sharedJson({
		hash: row.catalogHash,
		load: () => JSON.parse(readSharedText({ ctx, hash: row.catalogHash })),
	}),
	org: sharedJson({
		hash: row.orgHash,
		load: () => JSON.parse(readSharedText({ ctx, hash: row.orgHash })),
	}),
	logOffset: row.logOffset,
	readAt: Number(row.readAt),
});

/** A row only ever names a text already stored, so this read finds it. */
const readSharedText = ({
	ctx,
	hash,
}: {
	ctx: SlotContext;
	hash: string;
}): string => {
	const row = ctx.sqliteDb
		.query<{ text: string }, { hash: string }>(
			"SELECT text FROM shared_texts WHERE hash = $hash",
		)
		.get({ hash });
	if (!row) throw new Error(`Shared text ${hash} is missing`);
	return row.text;
};

/** Hashes each connection has stored or seen stored: texts are never removed, so these need no second write. */
const storedHashes = new WeakMap<Database, Set<string>>();

/** Stores the value's text once per file, before any row names it; the value held is the one copy for its hash. */
const storeSharedText = <T>({
	ctx,
	value,
}: {
	ctx: SlotContext;
	value: T;
}): { hash: string; held: T } => {
	const text = JSON.stringify(value);
	const hash = sharedTextHash(text);
	const held = sharedJson({ hash, load: () => value });
	const known = storedHashes.get(ctx.sqliteDb) ?? new Set<string>();
	storedHashes.set(ctx.sqliteDb, known);
	if (known.has(hash)) return { hash, held };
	ctx.sqliteDb
		.query(
			"INSERT OR IGNORE INTO shared_texts (hash, text) VALUES ($hash, $text)",
		)
		.run({ hash, text });
	known.add(hash);
	return { hash, held };
};

/** How many subjects the file holds: what a restart finds, or does not. */
export const countSubjects = ({ ctx }: { ctx: SlotContext }): number => {
	const row = ctx.sqliteDb
		.query<{ count: bigint }, []>(
			"SELECT count(*) AS count FROM subject_states",
		)
		.get();
	return Number(row?.count ?? 0);
};

/** The row as stored, unparsed. */
export const readSubjectRow = ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: SlotContext;
	customerId: string;
	entityId: string | null;
}): SubjectStateRow | null =>
	ctx.sqliteDb
		.query<SubjectStateRow, { customerId: string; entityId: string }>(`
			SELECT
				log_offset AS logOffset,
				read_at AS readAt,
				state_json AS stateJson,
				catalog_hash AS catalogHash,
				org_hash AS orgHash
			FROM subject_states
			WHERE customer_id = $customerId AND entity_id = $entityId
		`)
		.get({ customerId, entityId: entityId ?? CUSTOMER_ENTITY_ID });

/** Subjects that came from one read are written together. One answer each, as `upsertSubject` gives. */
export const upsertSubjects = ({
	ctx,
	subjects,
}: {
	ctx: SlotContext;
	subjects: StoredSubject[];
}): (StoredSubject | null)[] => {
	// One statement is already atomic: a transaction around it only adds a BEGIN and a COMMIT per push.
	if (subjects.length === 1)
		return subjects.map((subject) => upsertSubject({ ctx, subject }));
	return ctx.sqliteDb.transaction(() =>
		subjects.map((subject) => upsertSubject({ ctx, subject })),
	)();
};

/**
 * The subject as it is now held, its catalog and org the one copy per text; null when it was read before the one
 * stored, or at the same instant for an earlier change: a late push never undoes a newer one.
 */
export const upsertSubject = ({
	ctx,
	subject,
}: {
	ctx: SlotContext;
	subject: StoredSubject;
}): StoredSubject | null => {
	const { customerId, entityId } = subject.state.identity;
	const catalog = storeSharedText({ ctx, value: subject.catalog });
	const org = storeSharedText({ ctx, value: subject.org });
	const { changes } = ctx.sqliteDb
		.query(`
			INSERT INTO subject_states
				(customer_id, entity_id, log_offset, read_at, state_json, catalog_hash, org_hash)
			VALUES
				($customerId, $entityId, $logOffset, $readAt, $stateJson, $catalogHash, $orgHash)
			ON CONFLICT (customer_id, entity_id) DO UPDATE SET
				log_offset = excluded.log_offset,
				read_at = excluded.read_at,
				state_json = excluded.state_json,
				catalog_hash = excluded.catalog_hash,
				org_hash = excluded.org_hash
			WHERE excluded.read_at > subject_states.read_at
				OR (excluded.read_at = subject_states.read_at
					AND excluded.log_offset >= subject_states.log_offset)
		`)
		.run({
			customerId,
			entityId: entityId ?? CUSTOMER_ENTITY_ID,
			logOffset: subject.logOffset,
			readAt: subject.readAt,
			stateJson: JSON.stringify(subject.state),
			catalogHash: catalog.hash,
			orgHash: org.hash,
		});
	if (changes === 0) return null;
	return { ...subject, catalog: catalog.held, org: org.held };
};
