/** What this replica knows of a peer beyond the service name: counted as an owner, or on its way out. */
export type MemberState = "joined" | "leaving";

/**
 * Which of the service name's addresses count as ring members, shared by every thread of the replica so all of them
 * flip at once: a peer counts from the moment it is marked joined and stops counting the moment it announces leaving;
 * this replica itself stops counting when it leaves. Beside the state, what each peer has told this replica: that it
 * counts it as an owner (the grant), and how far it is through handing it the customers that moved.
 */
export type Membership = {
	self: string;
	isMember(address: string): boolean;
	isLeaving(address: string): boolean;
	stateOf(address: string): MemberState | null;
	/** The peer answers ready from the boot named: counted as an owner from now on, for every thread at once. True when this call flipped it. */
	markJoined(params: { address: string; boot: string }): boolean;
	/** Counts every flip to joined, so a thread that did not flip the peer notices it has to hand over. */
	joinEpoch(): number;
	/** The boot the peer was marked joined from, as the table holds it; null for a peer it does not hold. */
	bootOf(address: string): number | null;
	/** Whether the peer was marked joined from this boot: read from the shared table, so every thread tells a leaving peer back at the same address apart. */
	isBootOf(params: { address: string; boot: string }): boolean;
	markLeaving(address: string): void;
	/** The peer counts this replica as an owner: the customers it owned before are answered here from now on. */
	grantedBy(address: string): void;
	isGrantedBy(address: string): boolean;
	/** The peer is handing this replica the customers that moved here: their first requests wait for the handoff. */
	isHanding(address: string): boolean;
	/** One of the peer's threads handed everything it owed; true once all `threads` of them have. */
	handoffCompleted(params: {
		address: string;
		thread: number;
		threads: number;
	}): boolean;
	isHandoffComplete(address: string): boolean;
	/** Forgotten once the service name has dropped it and it answers no more, so a replica back at the address starts over. */
	forget(address: string): void;
	leaveSelf(): void;
	isSelfLeaving(): boolean;
};
