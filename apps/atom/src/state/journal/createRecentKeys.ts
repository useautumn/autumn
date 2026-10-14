/** 64-bit fingerprints of the keys taken in the read window, in an open-addressed table: 16 bytes a slot, half full at most. */
const INITIAL_SLOTS = 1 << 12;

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

/** The keys taken since the window's start, held in memory: a key check reads no SQLite page. */
export const createRecentKeys = ({ windowMs }: { windowMs: number }) => {
	let fingerprints = new BigUint64Array(INITIAL_SLOTS);
	let takenAt = new Float64Array(INITIAL_SLOTS);
	let used = 0;

	const slotOf = (fingerprint: bigint, size: number) =>
		Number(fingerprint & BigInt(size - 1));

	function place(fingerprint: bigint, at: number, oldest: number): boolean {
		const size = fingerprints.length;
		for (
			let slot = slotOf(fingerprint, size);
			;
			slot = (slot + 1) & (size - 1)
		) {
			const held = fingerprints[slot] as bigint;
			if (held === 0n) {
				fingerprints[slot] = fingerprint;
				takenAt[slot] = at;
				return true;
			}
			if (held === fingerprint || (takenAt[slot] as number) < oldest) {
				fingerprints[slot] = fingerprint;
				takenAt[slot] = at;
				return false;
			}
		}
	}

	/** Rebuilt with only the live keys, at twice the size when they still fill a quarter of it. */
	function rebuild({ now }: { now: number }): void {
		const oldest = now - windowMs;
		const live: [bigint, number][] = [];
		fingerprints.forEach((fingerprint, slot) => {
			const at = takenAt[slot] as number;
			if (fingerprint !== 0n && at >= oldest) live.push([fingerprint, at]);
		});
		const size =
			live.length > fingerprints.length / 4
				? fingerprints.length * 2
				: fingerprints.length;
		fingerprints = new BigUint64Array(size);
		takenAt = new Float64Array(size);
		used = 0;
		for (const [fingerprint, at] of live)
			if (place(fingerprint, at, oldest)) used++;
	}

	function add({
		fingerprint,
		at,
		now,
	}: {
		fingerprint: bigint;
		at: number;
		now: number;
	}): void {
		if (place(fingerprint, at, now - windowMs)) used++;
		if (used > fingerprints.length / 2) rebuild({ now });
	}

	function has({
		fingerprint,
		since,
	}: {
		fingerprint: bigint;
		since: number;
	}): boolean {
		const size = fingerprints.length;
		for (
			let slot = slotOf(fingerprint, size);
			;
			slot = (slot + 1) & (size - 1)
		) {
			const held = fingerprints[slot] as bigint;
			if (held === 0n) return false;
			if (held === fingerprint && (takenAt[slot] as number) >= since)
				return true;
		}
	}

	return {
		add,
		has,
		bytes: () => fingerprints.byteLength + takenAt.byteLength,
	};
};
