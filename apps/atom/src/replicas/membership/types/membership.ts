/** What this replica knows of a peer beyond the service name: ready to serve, counted as an owner, or on its way out. */
export type MemberState = "ready" | "joined" | "leaving";

/**
 * Which of the service name's addresses count as ring members, shared by every thread of the replica so all of them
 * flip at once: a peer counts once it is ready and this replica has handed it its customers' entries (`joined`), and stops
 * counting the moment it announces leaving; this replica itself stops counting when it leaves.
 */
export type Membership = {
	self: string;
	isMember(address: string): boolean;
	stateOf(address: string): MemberState | null;
	/** The peer answered ready; true the first time, so the caller hands off and then marks it joined. */
	markReady(address: string): boolean;
	markJoined(address: string): void;
	/** One thread has handed the peer its entries; true once every thread has, which is when the peer is joined. */
	handedOff(params: { address: string; threads: number }): boolean;
	markLeaving(address: string): void;
	/** When the peer announced leaving, in ms; null unless it is leaving. */
	leavingSince(address: string): number | null;
	/** One of the leaver's threads handed everything it owed; true once all `threads` of them have. */
	handoffCompleted(params: { address: string; threads: number }): boolean;
	isHandoffComplete(address: string): boolean;
	/** Forgotten once the service name has dropped it, so a replica back at the same address starts over. */
	forget(address: string): void;
	leaveSelf(): void;
	isSelfLeaving(): boolean;
};
