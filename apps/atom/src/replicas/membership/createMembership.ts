import type { MemberState, Membership } from "./types/membership.js";

/** Peers a deployment can hold at once; the table is fixed-size so threads can share it. */
const MAX_PEERS = 8;
const INTS_PER_PEER = 5;
/** After the peer's address, in each row. */
const STATE = 1;
/** A hash of the boot the peer was marked joined from. */
const BOOT = 2;
/** 1 once the peer has said it counts this replica as an owner. */
const GRANTED = 3;
/** One bit per thread of the peer that has handed everything it owed; ALL_HANDED once every one has. */
const HANDED_THREADS = 4;
const ALL_HANDED = -1;
const SELF_LEAVING_INDEX = MAX_PEERS * INTS_PER_PEER;
const JOIN_EPOCH_INDEX = SELF_LEAVING_INDEX + 1;
export const MEMBERSHIP_INTS = JOIN_EPOCH_INDEX + 1;

const STATES: Record<MemberState, number> = { joined: 1, leaving: 2 };
const STATE_NAMES = Object.fromEntries(
	Object.entries(STATES).map(([name, code]) => [code, name]),
) as Record<number, MemberState>;

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

/** A boot as an Int32: never 0, so a row holding one is told from a row holding none. */
const bootCodeOf = (boot: string): number => Bun.hash.xxHash32(boot) | 0 || 1;

const allThreads = (threads: number): number => (1 << threads) - 1;

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

	const stateOf = (address: string): MemberState | null => {
		const at = rowOf(address);
		return at < 0
			? null
			: (STATE_NAMES[Atomics.load(table, at + STATE)] ?? null);
	};

	/** The peer's threads have everything to hand again: a moved customer's first requests wait for them anew. */
	const expectHandoff = (at: number): void => {
		Atomics.store(table, at + HANDED_THREADS, 0);
	};

	const isHandoffComplete = (address: string): boolean => {
		const at = rowOf(address);
		return at >= 0 && Atomics.load(table, at + HANDED_THREADS) === ALL_HANDED;
	};

	const isGrantedBy = (address: string): boolean => {
		const at = rowOf(address);
		return at >= 0 && Atomics.load(table, at + GRANTED) === 1;
	};

	/** Back from a new boot: what its old one handed is not what this one holds. */
	const noteBoot = ({ address, boot }: { address: string; boot: string }) => {
		const at = rowFor(address);
		const before = Atomics.exchange(table, at + BOOT, bootCodeOf(boot));
		if (before !== 0 && before !== bootCodeOf(boot)) expectHandoff(at);
		return at;
	};

	return {
		self,
		stateOf,
		isMember: (address) => stateOf(address) === "joined",
		isLeaving: (address) => stateOf(address) === "leaving",
		markJoined: ({ address, boot }) => {
			const at = noteBoot({ address, boot });
			const flipped =
				Atomics.exchange(table, at + STATE, STATES.joined) !== STATES.joined;
			if (flipped) Atomics.add(table, JOIN_EPOCH_INDEX, 1);
			return flipped;
		},
		joinEpoch: () => Atomics.load(table, JOIN_EPOCH_INDEX),
		bootOf: (address) => {
			const at = rowOf(address);
			return at < 0 ? null : Atomics.load(table, at + BOOT);
		},
		isBootOf: ({ address, boot }) => {
			const at = rowOf(address);
			return at >= 0 && Atomics.load(table, at + BOOT) === bootCodeOf(boot);
		},
		noteBoot: ({ address, boot }) => {
			noteBoot({ address, boot });
		},
		markLeaving: (address) => {
			const at = rowFor(address);
			if (
				Atomics.exchange(table, at + STATE, STATES.leaving) !== STATES.leaving
			)
				expectHandoff(at);
		},
		grantedBy: (address) => {
			Atomics.store(table, rowFor(address) + GRANTED, 1);
		},
		isGrantedBy,
		isHanding: (address) => isGrantedBy(address) && !isHandoffComplete(address),
		handoffCompleted: ({ address, boot, thread, threads }) => {
			const at = rowFor(address);
			if (Atomics.load(table, at + BOOT) !== bootCodeOf(boot)) return false;
			const handed =
				Atomics.or(table, at + HANDED_THREADS, 1 << thread) | (1 << thread);
			if (handed !== allThreads(threads)) return false;
			Atomics.store(table, at + HANDED_THREADS, ALL_HANDED);
			return true;
		},
		isHandoffComplete,
		forget: (address) => {
			const at = rowOf(address);
			if (at < 0) return;
			for (let field = INTS_PER_PEER - 1; field >= 0; field--)
				Atomics.store(table, at + field, 0);
		},
		leaveSelf: () => {
			Atomics.store(table, SELF_LEAVING_INDEX, 1);
		},
		isSelfLeaving: () => Atomics.load(table, SELF_LEAVING_INDEX) === 1,
	};
};
