import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
import type {
	CommandAddress,
	CommandRecall,
	RecentCommands,
} from "./types/recentCommands.js";

/**
 * The dedup window as two open-addressing hash tables in typed arrays: 64 bits of key hash and 64 bits
 * of fingerprint hash per slot, no object or string per command, so a window of millions of commands
 * is invisible to the GC. A key-hash collision answers for another command (p ≈ n²/2^65 per generation);
 * a fingerprint-hash collision reads a changed retry as the same request (p = 2^-64 per retry).
 */
const WORDS = 4;
const EMPTY = 0;
const TOMBSTONE = 0xffffffff;
const KEY_SEED_A = 0x9e3779b1;
const KEY_SEED_B = 0x85ebca77;
const FINGERPRINT_SEED_A = 0xc2b2ae3d;
const FINGERPRINT_SEED_B = 0x27d4eb2f;
const MAX_LOAD = 0.5;

type Table = { slots: Uint32Array; mask: number; count: number };

const commandKeyOf = ({ identity, commandId }: CommandAddress): string =>
	JSON.stringify([meteringIdentityToPartitionKey({ identity }), commandId]);

const createTable = ({ capacity }: { capacity: number }): Table => ({
	slots: new Uint32Array(capacity * WORDS),
	mask: capacity - 1,
	count: 0,
});

/** The first hash word doubles as the slot state, so it is never EMPTY or TOMBSTONE. */
const keyWordA = (key: string): number => {
	const h = Bun.hash.xxHash32(key, KEY_SEED_A);
	return h === EMPTY || h === TOMBSTONE ? 1 : h;
};

/** Index of the slot holding the key, or -1; `probe` stops at the first empty slot. */
const findSlot = ({
	table,
	a,
	b,
}: {
	table: Table;
	a: number;
	b: number;
}): number => {
	const { slots, mask } = table;
	let index = b & mask;
	for (;;) {
		const at = index * WORDS;
		const word = slots[at] as number;
		if (word === EMPTY) return -1;
		if (word === a && slots[at + 1] === b) return at;
		index = (index + 1) & mask;
	}
};

const insert = ({
	table,
	a,
	b,
	fa,
	fb,
}: {
	table: Table;
	a: number;
	b: number;
	fa: number;
	fb: number;
}): void => {
	const { slots, mask } = table;
	let index = b & mask;
	for (;;) {
		const at = index * WORDS;
		const word = slots[at] as number;
		if (word === EMPTY) {
			slots[at] = a;
			slots[at + 1] = b;
			slots[at + 2] = fa;
			slots[at + 3] = fb;
			table.count++;
			return;
		}
		if (word === a && slots[at + 1] === b) {
			slots[at + 2] = fa;
			slots[at + 3] = fb;
			return;
		}
		index = (index + 1) & mask;
	}
};

const grown = ({ table }: { table: Table }): Table => {
	const next = createTable({ capacity: (table.mask + 1) * 2 });
	const { slots } = table;
	for (let at = 0; at < slots.length; at += WORDS) {
		const word = slots[at] as number;
		if (word === EMPTY || word === TOMBSTONE) continue;
		insert({
			table: next,
			a: word,
			b: slots[at + 1] as number,
			fa: slots[at + 2] as number,
			fb: slots[at + 3] as number,
		});
	}
	return next;
};

export const createHashedRecentCommands = ({
	windowMs,
	now,
	expectedCommands = 1 << 16,
}: {
	windowMs: number;
	now(): number;
	/** Commands one window is expected to hold; the table starts at twice that and doubles when half full. */
	expectedCommands?: number;
}): RecentCommands => {
	const initialCapacity =
		1 << Math.ceil(Math.log2(Math.max(16, expectedCommands) * 2));
	let current = createTable({ capacity: initialCapacity });
	let previous = createTable({ capacity: initialCapacity });
	let currentStartedAt = now();

	const cleared = (table: Table): Table => {
		table.slots.fill(0);
		table.count = 0;
		return table;
	};

	/** A whole generation is dropped at once; the stale table is zeroed and reused rather than reallocated. */
	const rotate = (at: number): void => {
		const elapsed = at - currentStartedAt;
		if (elapsed < windowMs) return;
		if (elapsed >= 2 * windowMs) {
			cleared(current);
			cleared(previous);
		} else {
			const stale = cleared(previous);
			previous = current;
			current = stale;
		}
		// Aligned to the window, so a late first access does not stretch the next generation.
		currentStartedAt = at - (elapsed % windowMs);
	};

	const rememberHashed = ({
		key,
		fingerprint,
		fresh,
	}: {
		key: string;
		fingerprint: string;
		/** Known absent from the previous generation (it was recalled unknown), so no tombstone to leave there. */
		fresh: boolean;
	}): void => {
		const a = keyWordA(key);
		const b = Bun.hash.xxHash32(key, KEY_SEED_B);
		const inPrevious = fresh ? -1 : findSlot({ table: previous, a, b });
		if (inPrevious >= 0) {
			previous.slots[inPrevious] = TOMBSTONE;
			previous.count--;
		}
		if (current.count + 1 > (current.mask + 1) * MAX_LOAD)
			current = grown({ table: current });
		insert({
			table: current,
			a,
			b,
			fa: Bun.hash.xxHash32(fingerprint, FINGERPRINT_SEED_A),
			fb: Bun.hash.xxHash32(fingerprint, FINGERPRINT_SEED_B),
		});
	};

	const remember = (params: Parameters<RecentCommands["remember"]>[0]) => {
		rotate(now());
		if ("key" in params) return rememberHashed({ ...params, fresh: false });
		rememberHashed({
			key: commandKeyOf({
				identity: params.mutation.identity,
				commandId: params.mutation.id,
			}),
			fingerprint: params.mutation.receipt.fingerprint,
			fresh: false,
		});
	};

	const rememberAll = ({
		commands,
	}: Parameters<RecentCommands["rememberAll"]>[0]) => {
		rotate(now());
		for (const { key, fingerprint } of commands)
			rememberHashed({ key, fingerprint, fresh: true });
	};

	const recall = ({
		key,
		fingerprint,
	}: {
		key: string;
		fingerprint: string;
	}): CommandRecall => {
		rotate(now());
		const a = keyWordA(key);
		const b = Bun.hash.xxHash32(key, KEY_SEED_B);
		let table = current;
		let at = findSlot({ table, a, b });
		if (at < 0) {
			table = previous;
			at = findSlot({ table, a, b });
			if (at < 0) return "unknown";
		}
		const same =
			table.slots[at + 2] ===
				Bun.hash.xxHash32(fingerprint, FINGERPRINT_SEED_A) &&
			table.slots[at + 3] ===
				Bun.hash.xxHash32(fingerprint, FINGERPRINT_SEED_B);
		return same ? "same" : "different";
	};

	const size = () => current.count + previous.count;

	return { keyOf: commandKeyOf, recall, remember, rememberAll, size };
};
