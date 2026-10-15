/**
 * Which of the service name's addresses count as ring members, shared by every thread of the replica so all of them
 * flip at once: a listed peer counts until it announces leaving and again once that leave has aged out (LEAVING_TTL_MS),
 * whatever the name listed in between; this replica itself stops counting when it leaves.
 */
export type Membership = {
	self: string;
	isMember(address: string): boolean;
	isLeaving(address: string): boolean;
	markLeaving(address: string): void;
	/** One of the leaver's threads handed everything it owed; true once all `threads` of them have. */
	handoffCompleted(params: { address: string; threads: number }): boolean;
	isHandoffComplete(address: string): boolean;
	/** Rows for peers the service name no longer lists are dropped once their leave, if any, has aged out. */
	keepOnly(addresses: string[]): void;
	leaveSelf(): void;
	isSelfLeaving(): boolean;
};
