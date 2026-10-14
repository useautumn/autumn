/** A slab's first size; it doubles once half full, so a slot holds 12 bytes and a key 24–48. */
const INITIAL_SLOTS = 1 << 12;
/** Keys are held in slabs this long, so a slab past the window is dropped whole, never swept key by key. */
const SLABS_PER_WINDOW = 3;

/** A customer's key as one fingerprint: the customer's hash xor the key hash's first 8 bytes, as journal_key_log stores them. */
export const keyFingerprint = ({
	customerId,
	keyHashLow,
}: {
	customerId: string;
	keyHashLow: bigint;
}): bigint => {
	const fingerprint = BigInt.asUintN(
		64,
		BigInt(Bun.hash.xxHash3(customerId, 7n)) ^ keyHashLow,
	);
	return fingerprint === 0n ? 1n : fingerprint;
};

/** Fingerprints and the second each was taken, open-addressed. */
const createSlab = ({ startsAt }: { startsAt: number }) => {
	let fingerprints = new BigUint64Array(INITIAL_SLOTS);
	let takenAtSec = new Uint32Array(INITIAL_SLOTS);
	let used = 0;

	const firstSlot = (fingerprint: bigint, size: number) =>
		Number(fingerprint & BigInt(size - 1));

	function place(fingerprint: bigint, atSec: number): void {
		const size = fingerprints.length;
		for (
			let slot = firstSlot(fingerprint, size);
			;
			slot = (slot + 1) & (size - 1)
		) {
			const held = fingerprints[slot] as bigint;
			if (held === 0n) used++;
			if (held === 0n || held === fingerprint) {
				fingerprints[slot] = fingerprint;
				takenAtSec[slot] = Math.max(takenAtSec[slot] as number, atSec);
				return;
			}
		}
	}

	function grow(): void {
		const [oldFingerprints, oldTakenAt] = [fingerprints, takenAtSec];
		fingerprints = new BigUint64Array(oldFingerprints.length * 2);
		takenAtSec = new Uint32Array(oldFingerprints.length * 2);
		used = 0;
		oldFingerprints.forEach((fingerprint, slot) => {
			if (fingerprint !== 0n) place(fingerprint, oldTakenAt[slot] as number);
		});
	}

	return {
		startsAt,
		add: ({ fingerprint, atSec }: { fingerprint: bigint; atSec: number }) => {
			place(fingerprint, atSec);
			if (used > fingerprints.length / 2) grow();
		},
		takenAtSecOf: (fingerprint: bigint): number | null => {
			const size = fingerprints.length;
			for (
				let slot = firstSlot(fingerprint, size);
				;
				slot = (slot + 1) & (size - 1)
			) {
				const held = fingerprints[slot] as bigint;
				if (held === 0n) return null;
				if (held === fingerprint) return takenAtSec[slot] as number;
			}
		},
		keys: () => used,
		bytes: () => fingerprints.byteLength + takenAtSec.byteLength,
	};
};

/**
 * The keys taken in the last `windowMs`, in memory: a key check reads no SQLite page. Times are whole seconds, rounded
 * up, so a key is held at least the window.
 */
export const createRecentKeys = ({ windowMs }: { windowMs: number }) => {
	const slabMs = windowMs / SLABS_PER_WINDOW;
	let slabs: ReturnType<typeof createSlab>[] = [];
	const toSec = (ms: number) => Math.ceil(ms / 1000);

	/** Drops every slab whose last key is past the window. */
	function age({ now }: { now: number }): void {
		const oldest = now - windowMs;
		slabs = slabs.filter(({ startsAt }) => startsAt + slabMs > oldest);
	}

	function add({
		customerId,
		fingerprint,
		at,
		now,
	}: {
		customerId: string;
		fingerprint: bigint;
		at: number;
		now: number;
	}): void {
		age({ now });
		let slab = slabs.find(
			({ startsAt }) => at >= startsAt && at < startsAt + slabMs,
		);
		if (!slab) {
			slab = createSlab({ startsAt: at - (at % slabMs) });
			slabs.push(slab);
		}
		slab.add({ fingerprint, atSec: toSec(at) });
	}

	function has({
		customerId,
		fingerprint,
		since,
	}: {
		customerId: string;
		fingerprint: bigint;
		since: number;
	}): boolean {
		const floorSec = toSec(since);
		return slabs.some(
			(slab) => (slab.takenAtSecOf(fingerprint) ?? -1) >= floorSec,
		);
	}


	return {
		add,
		has,
		keys: () => slabs.reduce((sum, slab) => sum + slab.keys(), 0),
		bytes: () => slabs.reduce((sum, slab) => sum + slab.bytes(), 0),
	};
};
