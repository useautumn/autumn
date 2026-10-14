/**
 * Which of the service name's addresses count as ring members, shared by every thread of the replica so all of them
 * flip at once: a listed peer counts until it announces leaving, and this replica itself stops counting when it leaves.
 */
export type Membership = {
	self: string;
	isMember(address: string): boolean;
	isLeaving(address: string): boolean;
	markLeaving(address: string): void;
	/** Forgotten once the service name has dropped it, so a replica back at the same address starts over. */
	forget(address: string): void;
	leaveSelf(): void;
	isSelfLeaving(): boolean;
};
