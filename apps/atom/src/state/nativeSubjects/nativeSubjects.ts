import { dlopen, FFIType, ptr } from "bun:ffi";
import arm64Library from "../../../native/prebuilt/libatom_subject_store-linux-arm64.so" with {
	type: "file",
};
import x64Library from "../../../native/prebuilt/libatom_subject_store-linux-x64.so" with {
	type: "file",
};
import type { StoredSubject } from "../types/storedSubject.js";

/** logOffset (i64), readAt (f64), customerVersion (i64), then the JSON body; the store patches customerVersion alone. */
const HEADER_BYTES = 24;
const ABSENT = -1;
const UNCHANGED = -2;

const SYMBOLS = {
	ns_create: { args: [], returns: FFIType.ptr },
	ns_put: {
		args: [FFIType.ptr, FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64],
		returns: FFIType.u64,
	},
	ns_get: {
		args: [
			FFIType.ptr,
			FFIType.ptr,
			FFIType.u64,
			FFIType.u64,
			FFIType.ptr,
			FFIType.u64,
			FFIType.ptr,
		],
		returns: FFIType.i64_fast,
	},
	ns_set_customer_version: {
		args: [FFIType.ptr, FFIType.ptr, FFIType.u64, FFIType.i64],
		returns: FFIType.u64,
	},
	ns_delete: {
		args: [FFIType.ptr, FFIType.ptr, FFIType.u64],
		returns: FFIType.i32,
	},
	ns_bytes: { args: [FFIType.ptr], returns: FFIType.i64_fast },
	ns_entries: { args: [FFIType.ptr], returns: FFIType.i64_fast },
} as const;

const openLibrary = () =>
	dlopen(process.arch === "arm64" ? arm64Library : x64Library, SYMBOLS).symbols;

type Library = ReturnType<typeof openLibrary>;

/** The texts a subject's rows are stored as, so a reader parses what the owner already serialized. */
export type SubjectTexts = {
	stateJson: string;
	catalogJson: string;
	orgJson: string;
};

/** A subject read from the shared store: absent, unchanged since `knownSeq`, or its bytes parsed at `seq`. */
export type NativeRead =
	| { found: false }
	| { found: true; changed: false }
	| {
			found: true;
			changed: true;
			seq: number;
			subject: StoredSubject;
			bytes: number;
	  };

export type NativeSubjects = {
	put(params: {
		key: string;
		subject: StoredSubject;
		texts: SubjectTexts;
	}): void;
	read(params: { key: string; knownSeq: number }): NativeRead;
	setCustomerVersion(params: { key: string; customerVersion: bigint }): void;
	drop(params: { key: string }): void;
	readonly bytes: number;
	readonly entries: number;
};

/** The key every thread names one subject of one slot file by. */
export const nativeSubjectKey = ({
	databasePath,
	customerId,
	entityId,
}: {
	databasePath: string;
	customerId: string;
	entityId: string | null;
}): string => `${databasePath}\u0000${customerId}\u0000${entityId ?? ""}`;

/** Main thread only: the store every serving thread is handed the address of. */
export const createNativeSubjectsStore = (): number =>
	Number(openLibrary().ns_create());

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const createNativeSubjects = ({
	library,
	store,
}: {
	library: Library;
	store: number;
}): NativeSubjects => {
	const storePtr = store as unknown as Parameters<Library["ns_put"]>[0];
	let keyBuffer = new Uint8Array(1024);
	let valueBuffer = new Uint8Array(64 * 1024);
	const seqOut = new BigUint64Array(1);

	function encodeKey(key: string): number {
		if (key.length * 3 > keyBuffer.length)
			keyBuffer = new Uint8Array(key.length * 3);
		return encoder.encodeInto(key, keyBuffer).written;
	}

	function put({
		key,
		subject,
		texts,
	}: {
		key: string;
		subject: StoredSubject;
		texts: SubjectTexts;
	}): void {
		const body = `{"s":${texts.stateJson},"c":${texts.catalogJson},"o":${texts.orgJson}}`;
		const needed = HEADER_BYTES + body.length * 3;
		if (needed > valueBuffer.length) valueBuffer = new Uint8Array(needed);
		const header = new DataView(valueBuffer.buffer, 0, HEADER_BYTES);
		header.setBigInt64(0, subject.logOffset, true);
		header.setFloat64(8, subject.readAt, true);
		header.setBigInt64(16, subject.customerVersion, true);
		const { written } = encoder.encodeInto(
			body,
			valueBuffer.subarray(HEADER_BYTES),
		);
		const keyLength = encodeKey(key);
		library.ns_put(
			storePtr,
			ptr(keyBuffer),
			keyLength,
			ptr(valueBuffer),
			HEADER_BYTES + written,
		);
	}

	function read({
		key,
		knownSeq,
	}: {
		key: string;
		knownSeq: number;
	}): NativeRead {
		const keyLength = encodeKey(key);
		let length = Number(
			library.ns_get(
				storePtr,
				ptr(keyBuffer),
				keyLength,
				knownSeq,
				ptr(valueBuffer),
				valueBuffer.length,
				ptr(seqOut),
			),
		);
		if (length === ABSENT) return { found: false };
		if (length === UNCHANGED) return { found: true, changed: false };
		if (length > valueBuffer.length) {
			valueBuffer = new Uint8Array(length * 2);
			length = Number(
				library.ns_get(
					storePtr,
					ptr(keyBuffer),
					keyLength,
					knownSeq,
					ptr(valueBuffer),
					valueBuffer.length,
					ptr(seqOut),
				),
			);
			if (length === ABSENT) return { found: false };
			if (length === UNCHANGED || length > valueBuffer.length)
				return read({ key, knownSeq });
		}
		const header = new DataView(valueBuffer.buffer, 0, HEADER_BYTES);
		const body = JSON.parse(
			decoder.decode(valueBuffer.subarray(HEADER_BYTES, length)),
		);
		return {
			found: true,
			changed: true,
			seq: Number(seqOut[0]),
			bytes: length,
			subject: {
				state: body.s,
				catalog: body.c,
				org: body.o,
				logOffset: header.getBigInt64(0, true),
				readAt: header.getFloat64(8, true),
				customerVersion: header.getBigInt64(16, true),
			},
		};
	}

	return {
		put,
		read,
		setCustomerVersion: ({ key, customerVersion }) => {
			const keyLength = encodeKey(key);
			library.ns_set_customer_version(
				storePtr,
				ptr(keyBuffer),
				keyLength,
				customerVersion,
			);
		},
		drop: ({ key }) => {
			const keyLength = encodeKey(key);
			library.ns_delete(storePtr, ptr(keyBuffer), keyLength);
		},
		get bytes() {
			return Number(library.ns_bytes(storePtr));
		},
		get entries() {
			return Number(library.ns_entries(storePtr));
		},
	};
};

let nativeSubjects: NativeSubjects | null = null;

/** Called once per serving thread with the main thread's store; until then (or with the flag off) there is none. */
export const connectNativeSubjects = ({ store }: { store: number }): void => {
	nativeSubjects = createNativeSubjects({ library: openLibrary(), store });
};

export const getNativeSubjects = (): NativeSubjects | null => nativeSubjects;
