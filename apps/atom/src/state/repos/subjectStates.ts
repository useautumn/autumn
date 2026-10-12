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
				slices.org_json AS orgJson
			FROM subject_states AS states
			JOIN subject_slices AS slices USING (customer_id, entity_id)
			WHERE states.customer_id = $customerId AND states.entity_id = $entityId
		`)
		.get({ customerId, entityId: entityId ?? CUSTOMER_ENTITY_ID });
	return row ? storedSubjectFromRow({ row }) : null;
};

/** Where a page of applied subjects ends, so the next page starts right after it whatever ties on `applied_at`. */
export type SubjectCursor = {
	appliedAt: number;
	customerId: string;
	entityId: string;
};

/** A stored subject with when this file wrote it, by this replica's clock: what a copy to a peer is ordered by. */
export type AppliedSubject = { subject: StoredSubject; appliedAt: number };

/**
 * Subjects this file wrote at or after `after` (null: all of them), oldest write first, ties broken by key, after
 * `cursor`; so a replica that fell behind copies what it missed, page by page, missing nothing that ties on a page's edge.
 */
export const listSubjectsAppliedAfter = ({
	ctx,
	after,
	cursor,
	limit,
}: {
	ctx: SlotContext;
	after: number | null;
	cursor: SubjectCursor | null;
	limit: number;
}): AppliedSubject[] =>
	ctx.sqliteDb
		.query<
			SubjectStateRow & { appliedAt: bigint },
			{
				after: number;
				cursorAppliedAt: number | null;
				cursorCustomerId: string;
				cursorEntityId: string;
				limit: number;
			}
		>(`
			SELECT
				states.log_offset AS logOffset,
				states.read_at AS readAt,
				states.applied_at AS appliedAt,
				states.state_json AS stateJson,
				states.slice_hash AS sliceHash,
				slices.catalog_json AS catalogJson,
				slices.org_json AS orgJson
			FROM subject_states AS states
			JOIN subject_slices AS slices USING (customer_id, entity_id)
			WHERE states.applied_at >= $after
				AND ($cursorAppliedAt IS NULL
					OR (states.applied_at, states.customer_id, states.entity_id)
						> ($cursorAppliedAt, $cursorCustomerId, $cursorEntityId))
			ORDER BY states.applied_at ASC, states.customer_id ASC, states.entity_id ASC
			LIMIT $limit
		`)
		.all({
			after: after ?? 0,
			cursorAppliedAt: cursor?.appliedAt ?? null,
			cursorCustomerId: cursor?.customerId ?? "",
			cursorEntityId: cursor?.entityId ?? "",
			limit,
		})
		.map((row) => ({
			subject: storedSubjectFromRow({ row }).subject,
			appliedAt: Number(row.appliedAt),
		}));

/** The newest write the file holds by this replica's clock, or 0 when it is empty: how far back a copy from a peer reaches. */
export const maxAppliedAt = ({ ctx }: { ctx: SlotContext }): number => {
	const row = ctx.sqliteDb
		.query<{ appliedAt: bigint | null }, []>(
			"SELECT max(applied_at) AS appliedAt FROM subject_states",
		)
		.get();
	return Number(row?.appliedAt ?? 0);
};

/** Subjects that came from one read are written together. One answer each, as `upsertSubject` gives. */
export const upsertSubjects = ({
	ctx,
	writes,
	appliedAt,
}: {
	ctx: SlotContext;
	writes: SubjectWrite[];
	appliedAt: number;
}): (number | null)[] =>
	ctx.sqliteDb.transaction(() =>
		writes.map((write) => upsertSubject({ ctx, write, appliedAt })),
	)();

/**
 * The bytes of row text the subject now holds; null when it was read before the one stored, or at the same instant
 * for an earlier change: a late push never undoes a newer one. The slice row is rewritten only when it changed.
 */
const upsertSubject = ({
	ctx,
	write: { subject, slice, sliceStored },
	appliedAt,
}: {
	ctx: SlotContext;
	write: SubjectWrite;
	appliedAt: number;
}): number | null => {
	const { customerId, entityId } = subject.state.identity;
	const key = { customerId, entityId: entityId ?? CUSTOMER_ENTITY_ID };
	const stateJson = JSON.stringify(subject.state);
	const { changes } = ctx.sqliteDb
		.query(`
			INSERT INTO subject_states
				(customer_id, entity_id, log_offset, read_at, applied_at, state_json, slice_hash)
			VALUES
				($customerId, $entityId, $logOffset, $readAt, $appliedAt, $stateJson, $sliceHash)
			ON CONFLICT (customer_id, entity_id) DO UPDATE SET
				log_offset = excluded.log_offset,
				read_at = excluded.read_at,
				applied_at = excluded.applied_at,
				state_json = excluded.state_json,
				slice_hash = excluded.slice_hash
			WHERE excluded.read_at > subject_states.read_at
				OR (excluded.read_at = subject_states.read_at
					AND excluded.log_offset >= subject_states.log_offset)
		`)
		.run({
			...key,
			logOffset: subject.logOffset,
			readAt: subject.readAt,
			appliedAt,
			stateJson,
			sliceHash: slice.hash,
		});
	if (changes === 0) return null;
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
	return textBytes([stateJson, slice.catalogJson, slice.orgJson]);
};
