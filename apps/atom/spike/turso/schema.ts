/** Atom's slot schema (apps/atom/src/state/openSlotDatabase.ts) plus the two probe columns. */
export const SUBJECT_STATES_DDL = [
	`CREATE TABLE IF NOT EXISTS subject_states (
		customer_id TEXT NOT NULL,
		entity_id TEXT NOT NULL,
		log_offset INTEGER NOT NULL CHECK (log_offset >= 0),
		read_at INTEGER NOT NULL,
		state_json TEXT NOT NULL,
		catalog_json TEXT NOT NULL,
		org_json TEXT NOT NULL,
		seq INTEGER NOT NULL,
		PRIMARY KEY (customer_id, entity_id)
	) WITHOUT ROWID`,
	"CREATE INDEX IF NOT EXISTS subject_states_seq ON subject_states (seq)",
];

const UPSERT_CONFLICT = `
	ON CONFLICT (customer_id, entity_id) DO UPDATE SET
		log_offset = excluded.log_offset,
		read_at = excluded.read_at,
		state_json = excluded.state_json,
		catalog_json = excluded.catalog_json,
		org_json = excluded.org_json,
		seq = excluded.seq
	WHERE excluded.read_at > subject_states.read_at
		OR (excluded.read_at = subject_states.read_at
			AND excluded.log_offset >= subject_states.log_offset)`;

/** One statement for many subjects: one commit, so one commit-batching wait instead of N. */
export const upsertSubjectsSql = ({ rows }: { rows: number }) => `
	INSERT INTO subject_states
		(customer_id, entity_id, log_offset, read_at, state_json, catalog_json, org_json, seq)
	VALUES ${Array.from({ length: rows }, () => "(?, '', ?, ?, ?, ?, ?, ?)").join(", ")}
	${UPSERT_CONFLICT}`;

export const READ_SUBJECT_SQL =
	"SELECT state_json, catalog_json, org_json, log_offset, read_at FROM subject_states WHERE customer_id = ? AND entity_id = ''";

const filler = (bytes: number) => "x".repeat(Math.max(0, bytes));

/** A subject row shaped like herald's push: state ~70%, catalog ~20%, org ~10% of the bytes. */
export const subjectRow = ({
	customerId,
	seq,
	bytes,
}: {
	customerId: string;
	seq: number;
	bytes: number;
}) => {
	const stateJson = JSON.stringify({
		identity: { customerId, entityId: null },
		balances: [{ featureId: "emails", balance: seq % 100_000, usage: seq }],
		pad: filler(bytes * 0.7 - 120),
	});
	const catalogJson = JSON.stringify({ pad: filler(bytes * 0.2 - 10) });
	const orgJson = JSON.stringify({ pad: filler(bytes * 0.1 - 10) });
	return [customerId, seq, Date.now(), stateJson, catalogJson, orgJson, seq];
};

export const customerIdOf = (i: number) =>
	`cus_spike_${i.toString().padStart(6, "0")}`;
