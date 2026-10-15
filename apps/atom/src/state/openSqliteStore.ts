import type { HeldSubjects } from "./heldSubjects/types/heldSubjects.js";
import {
	countSubjects,
	type DroppedRows,
	dataBytes,
	decodeSubjectWriteResults,
	encodeSubjectWrites,
	listDigestsAppliedAfter,
	listEntityIds,
	listSubjectsAppliedAfter,
	maxAppliedAt,
	readSubject as readSubjectRow,
	readSubjectsByKey,
	readSubjectVersion,
	type SubjectWrite,
	type SubjectWriteResult,
	subjectToSlice,
} from "./repos/subjectStates.js";
import type { SqliteStore } from "./types/sqliteStore.js";
import {
	isDeletedSubject,
	type StoredSubject,
	type SubjectRow,
} from "./types/storedSubject.js";
import { openWrittenFile } from "./writer/openWrittenFile.js";

/** Tells this thread's stores apart in the one held-subjects budget. */
let storesOpened = 0;

type Slice = Pick<StoredSubject, "catalog" | "org">;
/**
 * By slice hash, across every customer the thread holds: customers on one plan hold one catalog, not one each. Weak on
 * the catalog and org themselves, which the held subjects hold, so a slice goes with the last subject holding it.
 */
const slicesByHash = new Map<
	string,
	{ catalog: WeakRef<Slice["catalog"]>; org: WeakRef<Slice["org"]> }
>();

/** The held copy of this slice when any customer holds one, else this one, kept for the next. */
const sharedSlice = ({
	hash,
	slice,
}: {
	hash: string;
	slice: Slice;
}): Slice => {
	const held = slicesByHash.get(hash);
	const catalog = held?.catalog.deref();
	const org = held?.org.deref();
	if (catalog && org) return { catalog, org };
	const shared = { catalog: slice.catalog, org: slice.org };
	slicesByHash.set(hash, {
		catalog: new WeakRef(shared.catalog),
		org: new WeakRef(shared.org),
	});
	return shared;
};

const subjectKey = ({
	customerId,
	entityId,
}: {
	customerId: string;
	entityId: string | null;
}): string => `${customerId}\u0000${entityId ?? ""}`;

const keyOf = ({ state }: SubjectRow): string =>
	subjectKey({
		customerId: state.identity.customerId,
		entityId: state.identity.entityId ?? null,
	});

/**
 * One slot's file and the subjects held from it. Only the slot's owner thread opens the file, so what it holds is
 * the file: a subject is parsed once, on its first read or as it is written, and served from memory after.
 */
export const openSqliteStore = ({
	databasePath,
	held,
	now = Date.now,
}: {
	databasePath: string;
	held: HeldSubjects;
	/** This replica's clock, stamped on every write so a peer can ask for what was written since. */
	now?: () => number;
}): SqliteStore => {
	const file = openWrittenFile({ databasePath, kind: "slot" });
	const ctx = { sqliteDb: file.sqliteDb };
	const storePrefix = `${storesOpened++}\u0000`;
	/** Subjects with a write still on its way to the writer: what their held copies say of the file may already be stale. */
	const writing = new Map<string, number>();

	function readSubject(params: {
		customerId: string;
		entityId: string | null;
	}): SubjectRow | null {
		const key = storePrefix + subjectKey(params);
		const found = held.get(key);
		if (found) return found.subject;
		const read = readSubjectRow({ ctx, ...params });
		if (read === null) return null;
		const subject = isDeletedSubject(read.subject)
			? read.subject
			: {
					...read.subject,
					...sharedSlice({ hash: read.sliceHash, slice: read.subject }),
				};
		held.hold({ key, subject, bytes: read.bytes, sliceHash: read.sliceHash });
		return subject;
	}

	function readVersion(params: {
		customerId: string;
		entityId: string | null;
	}) {
		const found = held.get(storePrefix + subjectKey(params));
		if (found)
			return {
				readAt: found.subject.readAt,
				logOffset: found.subject.logOffset,
			};
		return readSubjectVersion({ ctx, ...params });
	}

	/** A slice any held copy already has is reused; its row is rewritten only when this customer's held a different one. A deletion holds no slice. */
	function writeOf(subject: SubjectRow): SubjectWrite {
		const slice = subjectToSlice({ subject });
		if (isDeletedSubject(subject))
			return { subject, slice, sliceStored: false };
		const key = storePrefix + keyOf(subject);
		const heldCopy = held.get(key);
		return {
			subject: {
				...subject,
				...sharedSlice({ hash: slice.hash, slice: subject }),
			},
			slice,
			sliceStored: heldCopy?.sliceHash === slice.hash && !writing.has(key),
		};
	}

	/** A stored subject is held as written; one ignored as older keeps the newer copy, carrying a version the push raised. */
	function holdWritten({
		write: { subject, slice },
		result: { bytes, customerVersion },
	}: {
		write: SubjectWrite;
		result: SubjectWriteResult;
	}): void {
		const key = storePrefix + keyOf(subject);
		if (bytes !== null) {
			held.hold({
				key,
				subject: {
					...subject,
					customerVersion: customerVersion ?? subject.customerVersion,
				},
				bytes,
				sliceHash: slice.hash,
			});
			return;
		}
		const heldCopy = held.get(key);
		if (
			customerVersion === null ||
			!heldCopy ||
			heldCopy.subject.customerVersion >= customerVersion
		)
			return;
		held.hold({
			key,
			subject: { ...heldCopy.subject, customerVersion },
			bytes: heldCopy.bytes,
			sliceHash: heldCopy.sliceHash,
		});
	}

	function trackWriting(writes: SubjectWrite[], by: 1 | -1): void {
		for (const { subject } of writes) {
			const key = storePrefix + keyOf(subject);
			const count = (writing.get(key) ?? 0) + by;
			if (count === 0) writing.delete(key);
			else writing.set(key, count);
		}
	}

	/**
	 * After the commit: only the store decides which part settles a customer's version, and rows still mean "stored".
	 * `onStored` runs in the same turn as the held copies change, so nothing reads them before it.
	 */
	async function setSubjects({
		subjects,
		onStored,
	}: {
		subjects: SubjectRow[];
		onStored?: (stored: boolean[]) => void;
	}): Promise<boolean[]> {
		const writes = subjects.map(writeOf);
		const encoded = encodeSubjectWrites({ writes, appliedAt: now() });
		trackWriting(writes, 1);
		let answer: string;
		try {
			answer = await file.write("upsertSubjects", encoded.payload);
		} finally {
			trackWriting(writes, -1);
		}
		const results = decodeSubjectWriteResults({
			...encoded,
			writes,
			results: answer,
		});
		writes.forEach((write, index) => {
			const result = results[index];
			if (result) holdWritten({ write, result });
		});
		const stored = results.map(({ bytes }) => bytes !== null);
		onStored?.(stored);
		return stored;
	}

	async function dropCustomersWrittenBefore({
		before,
		limit,
	}: {
		before: number;
		limit: number;
	}) {
		const dropped: DroppedRows = JSON.parse(
			await file.write(
				"deleteCustomersWrittenBefore",
				`${before}\u0000${limit}`,
			),
		);
		for (const row of dropped)
			held.drop(
				storePrefix + subjectKey({ ...row, entityId: row.entityId || null }),
			);
		return {
			customers: new Set(dropped.map((row) => row.customerId)).size,
			rows: dropped.length,
		};
	}

	function close(): void {
		held.dropPrefix(storePrefix);
		file.close({ throwOnError: true });
	}

	return {
		readSubject,
		readVersion,
		entityIdsOf: ({ customerId }) => listEntityIds({ ctx, customerId }),
		setSubject: async ({ subject }) =>
			(await setSubjects({ subjects: [subject] }))[0] ?? false,
		setSubjects,
		countSubjects: () => countSubjects({ ctx }),
		listAppliedAfter: (params) => listSubjectsAppliedAfter({ ctx, ...params }),
		listDigestsAfter: (params) => listDigestsAppliedAfter({ ctx, ...params }),
		readByKey: (params) => readSubjectsByKey({ ctx, ...params }),
		maxAppliedAt: () => maxAppliedAt({ ctx }),
		dropCustomersWrittenBefore,
		dataBytes: () => dataBytes({ ctx }),
		close,
	};
};
