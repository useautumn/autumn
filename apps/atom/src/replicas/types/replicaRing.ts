/** Which replica of the deployment owns each customer: every replica that sees the same members names the same one. */
export type ReplicaRing = {
	/** This replica's own address, as the other members reach it. */
	self: string;
	/** The owner's address, among the members as they resolve now. */
	ownerOf(params: { customerId: string }): Promise<string>;
	isOwner(params: { customerId: string }): Promise<boolean>;
	/** This replica's address and its peers', sorted. */
	members(): Promise<string[]>;
};
