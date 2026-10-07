/** Distinct (org, feature) pairs each thread counts on its own; any past this land in `other`. */
const KEYS_PER_THREAD = 128;
/** How many pairs /health lists, the busiest first; the rest are summed into `other`. */
const LISTED_KEYS = 50;
/** One length byte each for the org and feature ids, then their UTF-8; a pair that does not fit counts as `other`. */
const KEY_BYTES = 256;
const OTHER = KEYS_PER_THREAD;

/** A thread's row: how many keys it has written, then allowed and denied per key and for `other`, then the keys. */
const USED_BYTES = 8;
const COUNTS = (KEYS_PER_THREAD + 1) * 2;
const COUNTS_BYTES = COUNTS * Float64Array.BYTES_PER_ELEMENT;
const ROW_BYTES = USED_BYTES + COUNTS_BYTES + KEYS_PER_THREAD * KEY_BYTES;

export type CheckCount = {
	orgId: string;
	featureId: string;
	allowed: number;
	denied: number;
};

export type CheckCountsReport = {
	top: CheckCount[];
	other: { allowed: number; denied: number };
};

/** This thread's allowed and denied checks, by org and feature. */
export type CheckCounts = {
	add(params: { orgId: string; featureId: string; allowed: boolean }): void;
};

const rowOf = ({
	buffer,
	index,
}: {
	buffer: SharedArrayBuffer;
	index: number;
}) => {
	const at = index * ROW_BYTES;
	return {
		used: new Int32Array(buffer, at, 1),
		counts: new Float64Array(buffer, at + USED_BYTES, COUNTS),
		keys: new Uint8Array(
			buffer,
			at + USED_BYTES + COUNTS_BYTES,
			KEYS_PER_THREAD * KEY_BYTES,
		),
	};
};

/** Shared like the thread stats: each thread writes only its own row, so counting a check takes no lock. */
export const createCheckCountsBuffer = ({
	threads,
}: {
	threads: number;
}): SharedArrayBuffer => new SharedArrayBuffer(threads * ROW_BYTES);

export const openCheckCounts = ({
	buffer,
	index,
}: {
	buffer: SharedArrayBuffer;
	index: number;
}): CheckCounts => {
	const { used, counts, keys } = rowOf({ buffer, index });
	const encoder = new TextEncoder();
	const keyOf = new Map<string, Map<string, number>>();

	/** The pair's bytes are written before it is published, so another thread never reads half a key. */
	function claimKey({
		orgId,
		featureId,
	}: {
		orgId: string;
		featureId: string;
	}): number {
		const key = Atomics.load(used, 0);
		if (key >= KEYS_PER_THREAD) return OTHER;
		const org = encoder.encode(orgId);
		const feature = encoder.encode(featureId);
		if (org.length > 255 || 2 + org.length + feature.length > KEY_BYTES)
			return OTHER;
		const at = key * KEY_BYTES;
		keys[at] = org.length;
		keys[at + 1] = feature.length;
		keys.set(org, at + 2);
		keys.set(feature, at + 2 + org.length);
		Atomics.store(used, 0, key + 1);
		const features = keyOf.get(orgId) ?? new Map<string, number>();
		features.set(featureId, key);
		keyOf.set(orgId, features);
		return key;
	}

	function add({
		orgId,
		featureId,
		allowed,
	}: {
		orgId: string;
		featureId: string;
		allowed: boolean;
	}): void {
		const key =
			keyOf.get(orgId)?.get(featureId) ?? claimKey({ orgId, featureId });
		counts[key * 2 + (allowed ? 0 : 1)] += 1;
	}

	return { add };
};

/** Every thread's counts summed by pair: the busiest listed, and the rest with every thread's overflow as `other`. */
export const readCheckCounts = ({
	buffer,
}: {
	buffer: SharedArrayBuffer;
}): CheckCountsReport => {
	const decoder = new TextDecoder();
	const byPair = new Map<string, CheckCount>();
	const other = { allowed: 0, denied: 0 };

	for (let index = 0; index < buffer.byteLength / ROW_BYTES; index++) {
		const { used, counts, keys } = rowOf({ buffer, index });
		const written = Atomics.load(used, 0);
		for (let key = 0; key < written; key++) {
			const at = key * KEY_BYTES;
			const orgEnd = at + 2 + (keys[at] ?? 0);
			const featureEnd = orgEnd + (keys[at + 1] ?? 0);
			// Copied out first: a TextDecoder will not read shared memory.
			const orgId = decoder.decode(keys.slice(at + 2, orgEnd));
			const featureId = decoder.decode(keys.slice(orgEnd, featureEnd));
			const pair = `${orgId}\u0000${featureId}`;
			const count = byPair.get(pair) ?? {
				orgId,
				featureId,
				allowed: 0,
				denied: 0,
			};
			count.allowed += counts[key * 2] ?? 0;
			count.denied += counts[key * 2 + 1] ?? 0;
			byPair.set(pair, count);
		}
		other.allowed += counts[OTHER * 2] ?? 0;
		other.denied += counts[OTHER * 2 + 1] ?? 0;
	}

	const busiestFirst = [...byPair.values()].sort(
		(a, b) => b.allowed + b.denied - (a.allowed + a.denied),
	);
	for (const count of busiestFirst.slice(LISTED_KEYS)) {
		other.allowed += count.allowed;
		other.denied += count.denied;
	}
	return { top: busiestFirst.slice(0, LISTED_KEYS), other };
};
