import type { Database } from "bun:sqlite";
import type { SubjectTexts } from "../nativeSubjects/nativeSubjects.js";
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

/** The version a row holds, read without parsing it; null when the file has no such row. */
export const readSubjectVersion = ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: SlotContext;
	customerId: string;
	entityId: string | null;
}): { readAt: number; logOffset: bigint } | null => {
	const row = ctx.sqliteDb
		.query<
			{ readAt: bigint; logOffset: bigint },
			{ customerId: string; entityId: string }
		>(
			"SELECT read_at AS readAt, log_offset AS logOffset FROM subject_states WHERE customer_id = $customerId AND entity_id = $entityId",
		)
		.get({ customerId, entityId: entityId ?? CUSTOMER_ENTITY_ID });
	return row ? { readAt: Number(row.readAt), logOffset: row.logOffset } : null;
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

export const readSubject = ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: SlotContext;
	customerId: string;
	entityId: string | null;
}): (HeldSubject & { texts: SubjectTexts }) | null => {
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
	return row ? { ...storedSubjectFromRow({ row }), texts: row } : null;
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
				states.customer_version AS customerVersion,
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

/** A row's identity and version alone: what a replica compares before asking for the row itself. */
export type SubjectDigest = SubjectCursor & {
	readAt: number;
	logOffset: bigint;
};

/** The digests of the subjects written at or after `after`, in the same order and pages as `listSubjectsAppliedAfter`. */
export const listDigestsAppliedAfter = ({
	ctx,
	after,
	cursor,
	limit,
}: {
	ctx: SlotContext;
	after: number | null;
	cursor: SubjectCursor | null;
	limit: number;
}): SubjectDigest[] =>
	ctx.sqliteDb
		.query<
			{
				customerId: string;
				entityId: string;
				readAt: bigint;
				logOffset: bigint;
				appliedAt: bigint;
			},
			{
				after: number;
				cursorAppliedAt: number | null;
				cursorCustomerId: string;
				cursorEntityId: string;
				limit: number;
			}
		>(`
			SELECT customer_id AS customerId, entity_id AS entityId, read_at AS readAt, log_offset AS logOffset, applied_at AS appliedAt
			FROM subject_states
			WHERE applied_at >= $after
				AND ($cursorAppliedAt IS NULL
					OR (applied_at, customer_id, entity_id) > ($cursorAppliedAt, $cursorCustomerId, $cursorEntityId))
			ORDER BY applied_at ASC, customer_id ASC, entity_id ASC
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
			customerId: row.customerId,
			entityId: row.entityId,
			readAt: Number(row.readAt),
			logOffset: row.logOffset,
			appliedAt: Number(row.appliedAt),
		}));

/** The rows named, with when they were written; a key the file does not hold is left out. */
export const readSubjectsByKey = ({
	ctx,
	keys,
}: {
	ctx: SlotContext;
	keys: { customerId: string; entityId: string }[];
}): AppliedSubject[] => {
	const query = ctx.sqliteDb.query<
		SubjectStateRow & { appliedAt: bigint },
		{ customerId: string; entityId: string }
	>(`
		SELECT
			states.log_offset AS logOffset,
			states.read_at AS readAt,
			states.applied_at AS appliedAt,
			states.state_json AS stateJson,
			states.slice_hash AS sliceHash,
			states.customer_version AS customerVersion,
			slices.catalog_json AS catalogJson,
			slices.org_json AS orgJson
		FROM subject_states AS states
		JOIN subject_slices AS slices USING (customer_id, entity_id)
		WHERE states.customer_id = $customerId AND states.entity_id = $entityId
	`);
	return keys.flatMap((key) => {
		const row = query.get(key);
		return row
			? [
					{
						subject: storedSubjectFromRow({ row }).subject,
						appliedAt: Number(row.appliedAt),
					},
				]
			: [];
	});
};

/** The newest write the file holds by this replica's clock, or 0 when it is empty: how far back a copy from a peer reaches. */
export const maxAppliedAt = ({ ctx }: { ctx: SlotContext }): number => {
	const row = ctx.sqliteDb
		.query<{ appliedAt: bigint | null }, []>(
			"SELECT max(applied_at) AS appliedAt FROM subject_states",
		)
		.get();
	return Number(row?.appliedAt ?? 0);
};

/** What one write left: the bytes of row text it stored (null when its rows were older), and the customer's version
 * when the write moved it (null when it stayed). */
export type SubjectWriteResult = {
	bytes: number | null;
	customerVersion: bigint | null;
	stateJson: string;
};

/** Subjects that came from one read are written together. */
export const upsertSubjects = ({
	ctx,
	writes,
	appliedAt,
}: {
	ctx: SlotContext;
	writes: SubjectWrite[];
	appliedAt: number;
}): SubjectWriteResult[] =>
	ctx.sqliteDb.transaction(() =>
		writes.map((write) => upsertSubject({ ctx, write, appliedAt })),
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
	appliedAt,
}: {
	ctx: SlotContext;
	write: SubjectWrite;
	appliedAt: number;
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
				(customer_id, entity_id, log_offset, read_at, applied_at, state_json, slice_hash, customer_version)
			VALUES
				($customerId, $entityId, $logOffset, $readAt, $appliedAt, $stateJson, $sliceHash, $customerVersion)
			ON CONFLICT (customer_id, entity_id) DO UPDATE SET
				log_offset = CASE WHEN ${IS_NEWER} THEN excluded.log_offset ELSE subject_states.log_offset END,
				read_at = CASE WHEN ${IS_NEWER} THEN excluded.read_at ELSE subject_states.read_at END,
				applied_at = CASE WHEN ${IS_NEWER} THEN excluded.applied_at ELSE subject_states.applied_at END,
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
			appliedAt,
			stateJson,
			sliceHash: slice.hash,
			customerVersion: subject.customerVersion,
		});
	if (!written) return { bytes: null, customerVersion: null, stateJson };
	const isStored =
		written.readAt === BigInt(subject.readAt) &&
		written.logOffset === subject.logOffset;
	if (!isStored)
		return {
			bytes: null,
			customerVersion: written.customerVersion,
			stateJson,
		};
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
		stateJson,
	};
};

/** The pages the file holds, dropped pages already given back: its size once its log is checkpointed. */
export const dataBytes = ({ ctx }: { ctx: SlotContext }): number => {
	const pages = ctx.sqliteDb
		.query<{ page_count: bigint }, []>("PRAGMA page_count")
		.get();
	const size = ctx.sqliteDb
		.query<{ page_size: bigint }, []>("PRAGMA page_size")
		.get();
	return Number(pages?.page_count ?? 0n) * Number(size?.page_size ?? 0n);
};

/** The keys of the rows one drop removed, so the copies held of them go too. */
export type DroppedRows = { customerId: string; entityId: string }[];

/**
 * Deletes every row of up to `limit` customers whose own row, rewritten by every push of the customer or an entity, was
 * written before `before`, oldest first. A customer goes whole, its entities with it, so no entity outlives the rows it is
 * read beside; one with any row copied since (a peer's catch-up writes a part alone) stays.
 */
export const deleteCustomersWrittenBefore = ({
	ctx,
	before,
	limit,
}: {
	ctx: SlotContext;
	before: number;
	limit: number;
}): DroppedRows =>
	ctx.sqliteDb.transaction((): DroppedRows => {
		const customers = ctx.sqliteDb
			.query<{ customerId: string }, { before: number; limit: number }>(`
				SELECT own.customer_id AS customerId FROM subject_states AS own
				WHERE own.entity_id = '' AND own.applied_at < $before
					AND NOT EXISTS (SELECT 1 FROM subject_states AS fresh
						WHERE fresh.customer_id = own.customer_id AND fresh.applied_at >= $before)
				ORDER BY own.applied_at ASC LIMIT $limit
			`)
			.all({ before, limit });
		if (customers.length === 0) return [];
		const ids = JSON.stringify(customers.map(({ customerId }) => customerId));
		const inCustomers = "customer_id IN (SELECT value FROM json_each($ids))";
		const dropped = ctx.sqliteDb
			.query<{ customerId: string; entityId: string }, { ids: string }>(
				`DELETE FROM subject_states WHERE ${inCustomers} RETURNING customer_id AS customerId, entity_id AS entityId`,
			)
			.all({ ids });
		ctx.sqliteDb
			.query(`DELETE FROM subject_slices WHERE ${inCustomers}`)
			.run({ ids });
		// Freed pages go back to the volume once the main thread checkpoints the file.
		ctx.sqliteDb.run("PRAGMA incremental_vacuum");
		return dropped;
	})();
