import type { Database } from "bun:sqlite";
import type { HeldSubject } from "../types/heldSubject.js";
import type { StoredSubject } from "../types/storedSubject.js";

type SlotContext = { sqliteDb: Database };

/** The customer's own rows are stored under no entity. */
const CUSTOMER_ENTITY_ID = "";

type SubjectStateRow = {
	logOffset: bigint;
	readAt: bigint;
	stateJson: string;
	sliceHash: string;
	catalogJson: string;
	orgJson: string;
	customerVersion: bigint;
};

/** A subject's catalog slice and org as stored beside its state, and the hash that tells a push whether they changed. */
export type SubjectSlice = {
	hash: string;
	catalogJson: string;
	orgJson: string;
};

/** One subject to write; `sliceStored` when its slice row already holds this slice, so only the state row is written. */
export type SubjectWrite = {
	subject: StoredSubject;
	slice: SubjectSlice;
	sliceStored: boolean;
};

const textBytes = (texts: string[]): number =>
	texts.reduce((bytes, text) => bytes + text.length, 0);

export const subjectToSlice = ({
	subject,
}: {
	subject: StoredSubject;
}): SubjectSlice => {
	const catalogJson = JSON.stringify(subject.catalog);
	const orgJson = JSON.stringify(subject.org);
	return {
		hash: Bun.hash.xxHash64(`${catalogJson}\u0000${orgJson}`).toString(16),
		catalogJson,
		orgJson,
	};
};

/** Rows were validated where they entered (the request that stored them), so reading only parses JSON. */
const storedSubjectFromRow = ({
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
		customerVersion: row.customerVersion,
	},
	bytes: textBytes([row.stateJson, row.catalogJson, row.orgJson]),
	sliceHash: row.sliceHash,
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

export const readSubject = ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: SlotContext;
	customerId: string;
	entityId: string | null;
}): HeldSubject | null => {
	const row = ctx.sqliteDb
		.query<SubjectStateRow, { customerId: string; entityId: string }>(`
			SELECT
				states.log_offset AS logOffset,
				states.read_at AS readAt,
				states.state_json AS stateJson,
				states.slice_hash AS sliceHash,
				slices.catalog_json AS catalogJson,
				slices.org_json AS orgJson,
				states.customer_version AS customerVersion
			FROM subject_states AS states
			JOIN subject_slices AS slices USING (customer_id, entity_id)
			WHERE states.customer_id = $customerId AND states.entity_id = $entityId
		`)
		.get({ customerId, entityId: entityId ?? CUSTOMER_ENTITY_ID });
	return row ? storedSubjectFromRow({ row }) : null;
};

/** What one write left: the bytes of row text it stored (null when its rows were older), and the customer's version
 * when the write moved it (null when it stayed). */
export type SubjectWriteResult = {
	bytes: number | null;
	customerVersion: bigint | null;
};

/** Subjects that came from one read are written together. */
export const upsertSubjects = ({
	ctx,
	writes,
}: {
	ctx: SlotContext;
	writes: SubjectWrite[];
}): SubjectWriteResult[] =>
	ctx.sqliteDb.transaction(() =>
		writes.map((write) => upsertSubject({ ctx, write })),
	)();

/** The push is read later than the row held, or at the same instant for a later change. */
const IS_NEWER = `(excluded.read_at > subject_states.read_at
	OR (excluded.read_at = subject_states.read_at AND excluded.log_offset >= subject_states.log_offset))`;

/**
 * One statement per subject. Its rows replace the held ones only when newer, so a late push never undoes a newer one;
 * its customer version is kept as the higher of the two either way, since evicts arrive out of order too.
 */
const upsertSubject = ({
	ctx,
	write: { subject, slice, sliceStored },
}: {
	ctx: SlotContext;
	write: SubjectWrite;
}): SubjectWriteResult => {
	const { customerId, entityId } = subject.state.identity;
	const key = { customerId, entityId: entityId ?? CUSTOMER_ENTITY_ID };
	const stateJson = JSON.stringify(subject.state);
	const written = ctx.sqliteDb
		.query<
			{ readAt: bigint; logOffset: bigint; customerVersion: bigint },
			Record<string, string | bigint | number>
		>(`
			INSERT INTO subject_states
				(customer_id, entity_id, log_offset, read_at, state_json, slice_hash, customer_version)
			VALUES
				($customerId, $entityId, $logOffset, $readAt, $stateJson, $sliceHash, $customerVersion)
			ON CONFLICT (customer_id, entity_id) DO UPDATE SET
				log_offset = CASE WHEN ${IS_NEWER} THEN excluded.log_offset ELSE subject_states.log_offset END,
				read_at = CASE WHEN ${IS_NEWER} THEN excluded.read_at ELSE subject_states.read_at END,
				state_json = CASE WHEN ${IS_NEWER} THEN excluded.state_json ELSE subject_states.state_json END,
				slice_hash = CASE WHEN ${IS_NEWER} THEN excluded.slice_hash ELSE subject_states.slice_hash END,
				customer_version = max(subject_states.customer_version, excluded.customer_version)
			WHERE ${IS_NEWER} OR excluded.customer_version > subject_states.customer_version
			RETURNING read_at AS readAt, log_offset AS logOffset, customer_version AS customerVersion
		`)
		.get({
			...key,
			logOffset: subject.logOffset,
			readAt: subject.readAt,
			stateJson,
			sliceHash: slice.hash,
			customerVersion: subject.customerVersion,
		});
	if (!written) return { bytes: null, customerVersion: null };
	const isStored =
		written.readAt === BigInt(subject.readAt) &&
		written.logOffset === subject.logOffset;
	if (!isStored)
		return { bytes: null, customerVersion: written.customerVersion };
	if (!sliceStored)
		ctx.sqliteDb
			.query(`
				INSERT INTO subject_slices (customer_id, entity_id, slice_hash, catalog_json, org_json)
				VALUES ($customerId, $entityId, $sliceHash, $catalogJson, $orgJson)
				ON CONFLICT (customer_id, entity_id) DO UPDATE SET
					slice_hash = excluded.slice_hash,
					catalog_json = excluded.catalog_json,
					org_json = excluded.org_json
				WHERE subject_slices.slice_hash != excluded.slice_hash
			`)
			.run({
				...key,
				sliceHash: slice.hash,
				catalogJson: slice.catalogJson,
				orgJson: slice.orgJson,
			});
	return {
		bytes: textBytes([stateJson, slice.catalogJson, slice.orgJson]),
		customerVersion: written.customerVersion,
	};
};
