import type { Membership } from "./types/membership.js";

/** Peers a deployment can hold at once; the table is fixed-size so threads can share it. */
const MAX_PEERS = 8;
const INTS_PER_PEER = 2;
/** After the peer's address, in each row. */
const STATE = 1;
const LEAVING = 1;
const SELF_LEAVING_INDEX = MAX_PEERS * INTS_PER_PEER;
export const MEMBERSHIP_INTS = SELF_LEAVING_INDEX + 1;

/** An address as an Int32, so a row needs no strings: IPv4 octets, or a hash of anything else. */
const codeOf = (address: string): number => {
	const octets = address.split(".").map(Number);
	if (
		octets.length === 4 &&
		octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255)
	)
		return (
			((octets[0] as number) << 24) |
			((octets[1] as number) << 16) |
			((octets[2] as number) << 8) |
			(octets[3] as number)
		);
	return Bun.hash.xxHash32(address) | 0;
};

/** Backed by `table`, a SharedArrayBuffer's Int32Array on a deployed replica, so every thread reads one view. */
export const createMembership = ({
	self,
	table = new Int32Array(MEMBERSHIP_INTS),
}: {
	self: string;
	table?: Int32Array;
}): Membership => {
	const rowOf = (address: string): number => {
		const code = codeOf(address);
		for (let row = 0; row < MAX_PEERS; row++)
			if (Atomics.load(table, row * INTS_PER_PEER) === code)
				return row * INTS_PER_PEER;
		return -1;
	};

	const rowFor = (address: string): number => {
		const held = rowOf(address);
		if (held >= 0) return held;
		const code = codeOf(address);
		for (let row = 0; row < MAX_PEERS; row++) {
			const at = row * INTS_PER_PEER;
			if (Atomics.compareExchange(table, at, 0, code) === 0) return at;
			if (Atomics.load(table, at) === code) return at;
		}
		throw new Error(`The membership table holds ${MAX_PEERS} peers already`);
	};

	const isLeaving = (address: string): boolean => {
		const at = rowOf(address);
		return at >= 0 && Atomics.load(table, at + STATE) === LEAVING;
	};

	return {
		self,
		isMember: (address) => !isLeaving(address),
		isLeaving,
		markLeaving: (address) =>
			Atomics.store(table, rowFor(address) + STATE, LEAVING),
		forget: (address) => {
			const at = rowOf(address);
			if (at < 0) return;
			Atomics.store(table, at + STATE, 0);
			Atomics.store(table, at, 0);
		},
		leaveSelf: () => Atomics.store(table, SELF_LEAVING_INDEX, 1),
		isSelfLeaving: () => Atomics.load(table, SELF_LEAVING_INDEX) === 1,
	};
};
