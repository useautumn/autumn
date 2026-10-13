/** Which replica of the deployment owns each customer: every replica that sees the same members names the same one. */
export type ReplicaRing = {
	/** The owner's address, among the members as they resolve now. */
	ownerOf(params: { customerId: string }): Promise<string>;
	isOwner(params: { customerId: string }): Promise<boolean>;
	/** This replica's address and its peers', sorted. */
	members(): Promise<string[]>;
};
