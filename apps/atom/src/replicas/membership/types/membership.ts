/** What this replica knows of a peer beyond the service name: ready to serve, counted as an owner, or on its way out. */
export type MemberState = "ready" | "joined" | "leaving";

/**
 * Which of the service name's addresses count as ring members, shared by every thread of the replica so all of them
 * flip at once: a peer counts once it is ready and every thread of this replica has handed it its customers' entries
 * (`joined`), and stops counting the moment it announces leaving; this replica itself stops counting when it leaves.
 */
export type Membership = {
	self: string;
	isMember(address: string): boolean;
	isLeaving(address: string): boolean;
	stateOf(address: string): MemberState | null;
	/** The peer answered ready from the boot named: counted from nothing, or again after leaving when the boot is a new one. */
	markReady(params: { address: string; boot: string }): void;
	/** Whether the peer was marked ready from this boot: read from the shared table, so every thread tells a leaving peer back at the same address apart. */
	isBootOf(params: { address: string; boot: string }): boolean;
	markJoined(address: string): void;
	/** Whether this thread has handed the peer its entries since it was marked ready. */
	hasHandedOff(params: { address: string; thread: number }): boolean;
	/** This thread has handed the peer its entries; true once every one of `threads` has, which is when the peer is joined. */
	handedOff(params: {
		address: string;
		thread: number;
		threads: number;
	}): boolean;
	markLeaving(address: string): void;
	/** One of the leaver's threads handed everything it owed; true once all `threads` of them have. */
	handoffCompleted(params: { address: string; threads: number }): boolean;
	isHandoffComplete(address: string): boolean;
	/** Forgotten once the service name has dropped it and it answers no more, so a replica back at the address starts over. */
	forget(address: string): void;
	leaveSelf(): void;
	isSelfLeaving(): boolean;
};
