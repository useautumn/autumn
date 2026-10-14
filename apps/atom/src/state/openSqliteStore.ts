import type { HeldSubjects } from "./heldSubjects/types/heldSubjects.js";
import { openSlotDatabase } from "./openSlotDatabase.js";
import {
	countSubjects,
	dataBytes,
	deleteCustomersWrittenBefore,
	listDigestsAppliedAfter,
	listSubjectsAppliedAfter,
	maxAppliedAt,
	readSubjectRowText,
	readSubjectsByKey,
	readSubjectVersion,
	type SubjectRowText,
	type SubjectWrite,
	type SubjectWriteResult,
	subjectToSlice,
	upsertSubjects,
} from "./repos/subjectStates.js";
import type { SqliteStore } from "./types/sqliteStore.js";
import type { StoredSubject } from "./types/storedSubject.js";

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

const keyOf = ({ state }: StoredSubject): string =>
	subjectKey({
		customerId: state.identity.customerId,
		entityId: state.identity.entityId ?? null,
	});

/**
 * One slot's file and the subjects held from it. Only the slot's owner thread opens the file, so what it holds is the
 * file: a subject's row text is read once and held; it is parsed on its first read or as it is written, and the parsed
 * copy kept beside the text while the thread keeps deciding on it, else parsed again from the text, never read again.
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
	const ctx = { sqliteDb: openSlotDatabase({ databasePath }) };
	const storePrefix = `${storesOpened++}\u0000`;

	/** The held text's parsed copy, its slice shared with every customer holding the same; frozen, as every check shares it. */
	function parseHeld({
		key,
		text,
	}: {
		key: string;
		text: SubjectRowText;
	}): StoredSubject {
		const sliceText = held.sliceOf(text.sliceHash);
		if (!sliceText) throw new Error(`Slice ${text.sliceHash} is not held`);
		const subject = {
			state: JSON.parse(text.stateJson),
			...sharedSlice({
				hash: text.sliceHash,
				slice: {
					catalog: JSON.parse(sliceText.catalogJson),
					org: JSON.parse(sliceText.orgJson),
				},
			}),
			logOffset: text.logOffset,
			readAt: text.readAt,
			customerVersion: text.customerVersion,
		};
		held.keepParsed({ key, subject });
		return subject;
	}

	function readSubject(params: {
		customerId: string;
		entityId: string | null;
	}): StoredSubject | null {
		const key = storePrefix + subjectKey(params);
		const found = held.get(key);
		if (found) return found.subject ?? parseHeld({ key, text: found.text });
		const read = readSubjectRowText({ ctx, ...params });
		if (read === null) return null;
		held.holdSlice({ hash: read.text.sliceHash, ...read.slice });
		held.hold({
			key,
			text: read.text,
			subject: null,
			bytes: read.text.stateJson.length,
		});
		return parseHeld({ key, text: read.text });
	}

	function readVersion(params: {
		customerId: string;
		entityId: string | null;
	}) {
		const found = held.get(storePrefix + subjectKey(params));
		if (found)
			return { readAt: found.text.readAt, logOffset: found.text.logOffset };
		return readSubjectVersion({ ctx, ...params });
	}

	/** A slice any held copy already has is reused, frozen; its row is rewritten only when this customer's held a different one. */
	function writeOf(subject: StoredSubject): SubjectWrite {
		const slice = subjectToSlice({ subject });
		const heldCopy = held.get(storePrefix + keyOf(subject));
		return {
			subject: {
				...subject,
				...sharedSlice({ hash: slice.hash, slice: subject }),
			},
			stateJson: JSON.stringify(subject.state),
			slice,
			sliceStored: heldCopy?.text.sliceHash === slice.hash,
		};
	}

	/** A stored subject is held as written, text and parsed copy; one ignored as older keeps the newer copy, carrying a version the push raised. */
	function holdWritten({
		write: { subject, stateJson, slice },
		result: { bytes, customerVersion },
	}: {
		write: SubjectWrite;
		result: SubjectWriteResult;
	}): void {
		const key = storePrefix + keyOf(subject);
		if (bytes !== null) {
			const version = customerVersion ?? subject.customerVersion;
			held.holdSlice({
				hash: slice.hash,
				catalogJson: slice.catalogJson,
				orgJson: slice.orgJson,
			});
			held.hold({
				key,
				text: {
					stateJson,
					sliceHash: slice.hash,
					logOffset: subject.logOffset,
					readAt: subject.readAt,
					customerVersion: version,
				},
				subject: { ...subject, customerVersion: version },
				bytes: stateJson.length,
			});
			return;
		}
		const heldCopy = held.get(key);
		if (
			customerVersion === null ||
			!heldCopy ||
			heldCopy.text.customerVersion >= customerVersion
		)
			return;
		held.hold({
			key,
			text: { ...heldCopy.text, customerVersion },
			subject: heldCopy.subject && { ...heldCopy.subject, customerVersion },
			bytes: heldCopy.bytes,
		});
	}

	/** After the commit: only the store decides which part settles a customer's version, and rows still mean "stored". */
	function setSubjects({ subjects }: { subjects: StoredSubject[] }): boolean[] {
		const writes = subjects.map(writeOf);
		const results = upsertSubjects({ ctx, writes, appliedAt: now() });
		writes.forEach((write, index) => {
			const result = results[index];
			if (result) holdWritten({ write, result });
		});
		return results.map(({ bytes }) => bytes !== null);
	}

	function dropCustomersWrittenBefore(params: {
		before: number;
		limit: number;
	}) {
		const dropped = deleteCustomersWrittenBefore({ ctx, ...params });
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
		ctx.sqliteDb.close(true);
	}

	return {
		readSubject,
		readVersion,
		setSubject: ({ subject }) =>
			setSubjects({ subjects: [subject] })[0] ?? false,
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
