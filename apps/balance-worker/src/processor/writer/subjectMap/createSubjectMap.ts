import type { SubjectState } from "@autumn/balance-engine";
import type { RememberedCommand, SubjectMap } from "./types/subjectMap.js";

/** Per partition writer; a worker holds many partitions, so the fleet total is this × partitions. */
export const SUBJECT_MAP_MAX_BYTES = 2 * 1024 * 1024;
/** A retry lands within seconds; a customer's last few commands cover it. */
export const RECENT_COMMANDS_PER_CUSTOMER = 32;

type Entry = {
	state: SubjectState;
	bytes: number;
	pins: number;
	recentCommands: Map<string, RememberedCommand>;
};

export const createSubjectMap = ({
	maxBytes = SUBJECT_MAP_MAX_BYTES,
}: {
	maxBytes?: number;
} = {}): SubjectMap => {
	// Insertion order is recency: a read re-inserts, eviction walks from the front.
	const entries = new Map<string, Entry>();
	let totalBytes = 0;

	const touch = ({
		subjectKey,
		entry,
	}: {
		subjectKey: string;
		entry: Entry;
	}) => {
		entries.delete(subjectKey);
		entries.set(subjectKey, entry);
	};

	const entryOf = ({ subjectKey }: { subjectKey: string }): Entry => {
		const existing = entries.get(subjectKey);
		if (existing) return existing;
		const created: Entry = {
			state: null as unknown as SubjectState,
			bytes: 0,
			pins: 0,
			recentCommands: new Map(),
		};
		entries.set(subjectKey, created);
		return created;
	};

	/** Best effort: pinned subjects and the one just written stay even if the bound is exceeded. */
	const evictUntilWithinBound = ({ except }: { except: string }) => {
		for (const [subjectKey, entry] of entries) {
			if (totalBytes <= maxBytes) return;
			if (entry.pins > 0 || subjectKey === except) continue;
			entries.delete(subjectKey);
			totalBytes -= entry.bytes;
		}
	};

	const readState = ({ subjectKey }: { subjectKey: string }) => {
		const entry = entries.get(subjectKey);
		if (!entry || entry.bytes === 0) return null;
		touch({ subjectKey, entry });
		return entry.state;
	};

	const setState = ({
		subjectKey,
		state,
	}: {
		subjectKey: string;
		state: SubjectState;
	}) => {
		const entry = entryOf({ subjectKey });
		totalBytes -= entry.bytes;
		entry.state = state;
		entry.bytes = JSON.stringify(state).length;
		totalBytes += entry.bytes;
		touch({ subjectKey, entry });
		evictUntilWithinBound({ except: subjectKey });
	};

	const pin = ({ subjectKey }: { subjectKey: string }) => {
		entryOf({ subjectKey }).pins += 1;
	};

	const unpin = ({ subjectKey }: { subjectKey: string }) => {
		const entry = entries.get(subjectKey);
		if (entry && entry.pins > 0) entry.pins -= 1;
	};

	const rememberCommand = ({
		customerKey,
		commandId,
		fingerprint,
		expiresAt,
	}: {
		customerKey: string;
		commandId: string;
	} & RememberedCommand) => {
		const { recentCommands } = entryOf({ subjectKey: customerKey });
		recentCommands.delete(commandId);
		recentCommands.set(commandId, { fingerprint, expiresAt });
		while (recentCommands.size > RECENT_COMMANDS_PER_CUSTOMER) {
			const oldest = recentCommands.keys().next().value;
			if (oldest === undefined) break;
			recentCommands.delete(oldest);
		}
	};

	const readCommand = ({
		customerKey,
		commandId,
		now,
	}: {
		customerKey: string;
		commandId: string;
		now: number;
	}) => {
		const remembered = entries.get(customerKey)?.recentCommands.get(commandId);
		if (!remembered || remembered.expiresAt <= now) return null;
		return remembered;
	};

	const clear = () => {
		entries.clear();
		totalBytes = 0;
	};

	return {
		readState,
		setState,
		pin,
		unpin,
		rememberCommand,
		readCommand,
		clear,
		sizeBytes: () => totalBytes,
	};
};
