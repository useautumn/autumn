/** Which replica of the deployment owns each customer: every replica that sees the same members names the same one. */
export type ReplicaRing = {
	/** This replica's own address, as the other members reach it. */
	self: string;
	/** The owner's address, among the members as they resolve now. */
	ownerOf(params: { customerId: string }): Promise<string>;
	isOwner(params: { customerId: string }): Promise<boolean>;
	/** This replica's address and its peers', sorted. */
	members(): Promise<string[]>;
	/** The member that owns the customer once `member` does not count (the previous or next owner); null when nobody does. */
	ownerWithout(params: {
		customerId: string;
		member: string;
	}): Promise<string | null>;
	/** The peer the customer came from: one leaving, or one still handing over to this replica after its join; else null. */
	movedFrom(params: { customerId: string }): Promise<string | null>;
};
