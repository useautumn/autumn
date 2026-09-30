import type { Database } from "bun:sqlite";
import type { StoredSubject } from "../types/storedSubject.js";

type SlotContext = { sqliteDb: Database };

/** The customer's own rows are stored under no entity. */
const CUSTOMER_ENTITY_ID = "";

type SubjectStateRow = {
	logOffset: bigint;
	readAt: bigint;
	stateJson: string;
	catalogJson: string;
	orgJson: string;
};

/** Rows were validated where they entered (the request that stored them), so reading only parses JSON. */
const storedSubjectFromRow = ({
	row,
}: {
	row: SubjectStateRow;
}): StoredSubject => ({
	state: JSON.parse(row.stateJson),
	catalog: JSON.parse(row.catalogJson),
	org: JSON.parse(row.orgJson),
	logOffset: row.logOffset,
	readAt: Number(row.readAt),
});

export const readSubject = ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: SlotContext;
	customerId: string;
	entityId: string | null;
}): StoredSubject | null => {
	const row = ctx.sqliteDb
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
	if (!row) return null;
	return storedSubjectFromRow({ row });
};

export const upsertSubject = ({
	ctx,
	subject,
}: {
	ctx: SlotContext;
	subject: StoredSubject;
}): void => {
	const { customerId, entityId } = subject.state.identity;
	ctx.sqliteDb
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
		`)
		.run({
			customerId,
			entityId: entityId ?? CUSTOMER_ENTITY_ID,
			logOffset: subject.logOffset,
			readAt: subject.readAt,
			stateJson: JSON.stringify(subject.state),
			catalogJson: JSON.stringify(subject.catalog),
			orgJson: JSON.stringify(subject.org),
		});
};
