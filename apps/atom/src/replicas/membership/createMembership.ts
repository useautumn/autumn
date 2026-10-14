import type { MemberState, Membership } from "./types/membership.js";

/** Peers a deployment can hold at once; the table is fixed-size so threads can share it. */
const MAX_PEERS = 8;
const INTS_PER_PEER = 5;
/** After the peer's address, in each row. */
const STATE = 1;
/** Which of this replica's threads have handed the peer its entries since it was marked ready, as a bitmask. */
const HANDED_OFF = 2;
/** The leaver's threads that have handed everything; HANDOFF_COMPLETE once all of them have. */
const HANDOFF_DONE = 3;
/** A hash of the boot the peer was marked ready from. */
const BOOT = 4;
const HANDOFF_COMPLETE = 1 << 30;
const SELF_LEAVING_INDEX = MAX_PEERS * INTS_PER_PEER;
export const MEMBERSHIP_INTS = SELF_LEAVING_INDEX + 1;
/** The bitmask's width. */
export const MAX_THREADS = 31;

const STATES: Record<MemberState, number> = { ready: 1, joined: 2, leaving: 3 };
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

	const clearRow = (at: number): void => {
		Atomics.store(table, at + STATE, 0);
		Atomics.store(table, at + HANDED_OFF, 0);
		Atomics.store(table, at + HANDOFF_DONE, 0);
		Atomics.store(table, at + BOOT, 0);
	};

	return {
		self,
		stateOf,
		isMember: (address) => stateOf(address) === "joined",
		isLeaving: (address) => stateOf(address) === "leaving",
		markReady: ({ address, boot }) => {
			const at = rowFor(address);
			// Back after leaving, from a new boot: its customers' entries are handed to it again before it owns them.
			clearRow(at);
			Atomics.store(table, at + BOOT, bootCodeOf(boot));
			Atomics.store(table, at + STATE, STATES.ready);
		},
		isBootOf: ({ address, boot }) => {
			const at = rowOf(address);
			return at >= 0 && Atomics.load(table, at + BOOT) === bootCodeOf(boot);
		},
		markJoined: (address) =>
			Atomics.store(table, rowFor(address) + STATE, STATES.joined),
		hasHandedOff: ({ address, thread }) => {
			const at = rowOf(address);
			return (
				at >= 0 && (Atomics.load(table, at + HANDED_OFF) & (1 << thread)) !== 0
			);
		},
		handedOff: ({ address, thread, threads }) => {
			if (thread >= MAX_THREADS || threads > MAX_THREADS)
				throw new Error(
					`The membership table counts up to ${MAX_THREADS} threads`,
				);
			const at = rowFor(address);
			const mask =
				Atomics.or(table, at + HANDED_OFF, 1 << thread) | (1 << thread);
			const everyThread = (1 << threads) - 1;
			const done = (mask & everyThread) === everyThread;
			if (done) Atomics.store(table, at + STATE, STATES.joined);
			return done;
		},
		markLeaving: (address) => {
			const at = rowFor(address);
			if (Atomics.load(table, at + STATE) !== STATES.leaving)
				Atomics.store(table, at + HANDOFF_DONE, 0);
			Atomics.store(table, at + STATE, STATES.leaving);
		},
		handoffCompleted: ({ address, threads }) => {
			const at = rowFor(address);
			const done = Atomics.add(table, at + HANDOFF_DONE, 1) + 1;
			if (done < threads) return false;
			Atomics.or(table, at + HANDOFF_DONE, HANDOFF_COMPLETE);
			return true;
		},
		isHandoffComplete: (address) => {
			const at = rowOf(address);
			return (
				at >= 0 &&
				(Atomics.load(table, at + HANDOFF_DONE) & HANDOFF_COMPLETE) !== 0
			);
		},
		forget: (address) => {
			const at = rowOf(address);
			if (at < 0) return;
			clearRow(at);
			Atomics.store(table, at, 0);
		},
		leaveSelf: () => Atomics.store(table, SELF_LEAVING_INDEX, 1),
		isSelfLeaving: () => Atomics.load(table, SELF_LEAVING_INDEX) === 1,
	};
};
