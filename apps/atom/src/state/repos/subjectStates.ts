import type { Database } from "bun:sqlite";
import type { HeldSubject } from "../types/heldSubject.js";
import type { StoredSubject } from "../types/storedSubject.js";

type SlotContext = { sqliteDb: Database };

/** The customer's own rows are stored under no entity. */
const CUSTOMER_ENTITY_ID = "";

export type SubjectStateRow = {
	logOffset: bigint;
	readAt: bigint;
	stateJson: string;
	catalogJson: string;
	orgJson: string;
};

const textBytes = (texts: string[]): number =>
	texts.reduce((bytes, text) => bytes + text.length, 0);

/** Rows were validated where they entered (the request that stored them), so reading only parses JSON. */
export const storedSubjectFromRow = ({
	row,
}: {
	row: SubjectStateRow;
}): HeldSubject => ({
	subject: {
		state: JSON.parse(row.stateJson),
		catalog: JSON.parse(row.catalogJson),
		org: JSON.parse(row.orgJson),
		logOffset: row.logOffset,
		readAt: Number(row.readAt),
	},
	bytes: textBytes([row.stateJson, row.catalogJson, row.orgJson]),
});

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
				catalog_json AS catalogJson,
				org_json AS orgJson
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
}): (number | null)[] => {
	// One statement is already atomic: a transaction around it only adds a BEGIN and a COMMIT per push.
	if (subjects.length === 1)
		return subjects.map((subject) => upsertSubject({ ctx, subject }));
	return ctx.sqliteDb.transaction(() =>
		subjects.map((subject) => upsertSubject({ ctx, subject })),
	)();
};

/**
 * The bytes of row text stored; null when the subject was read before the one stored, or at the same instant
 * for an earlier change: a late push never undoes a newer one. The row carries its own catalog slice and org.
 */
export const upsertSubject = ({
	ctx,
	subject,
}: {
	ctx: SlotContext;
	subject: StoredSubject;
}): number | null => {
	const { customerId, entityId } = subject.state.identity;
	const stateJson = JSON.stringify(subject.state);
	const catalogJson = JSON.stringify(subject.catalog);
	const orgJson = JSON.stringify(subject.org);
	const { changes } = ctx.sqliteDb
		.query(`
			INSERT INTO subject_states
				(customer_id, entity_id, log_offset, read_at, state_json, catalog_json, org_json)
			VALUES
				($customerId, $entityId, $logOffset, $readAt, $stateJson, $catalogJson, $orgJson)
			ON CONFLICT (customer_id, entity_id) DO UPDATE SET
				log_offset = excluded.log_offset,
				read_at = excluded.read_at,
				state_json = excluded.state_json,
				catalog_json = excluded.catalog_json,
				org_json = excluded.org_json
			WHERE excluded.read_at > subject_states.read_at
				OR (excluded.read_at = subject_states.read_at
					AND excluded.log_offset >= subject_states.log_offset)
		`)
		.run({
			customerId,
			entityId: entityId ?? CUSTOMER_ENTITY_ID,
			logOffset: subject.logOffset,
			readAt: subject.readAt,
			stateJson,
			catalogJson,
			orgJson,
		});
	return changes > 0 ? textBytes([stateJson, catalogJson, orgJson]) : null;
};
