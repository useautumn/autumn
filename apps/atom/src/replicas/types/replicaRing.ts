/** Which replica of the deployment owns each customer: every replica that sees the same members names the same one. */
export type ReplicaRing = {
	/** This replica's own address, as the other members reach it. */
	self: string;
	/** The owner's address, among the members as they resolve now. */
	ownerOf(params: { customerId: string }): Promise<string>;
	isOwner(params: { customerId: string }): Promise<boolean>;
	/** This replica's address and its peers', sorted. */
	members(): Promise<string[]>;
	/**
	 * The member that owns the customer once `member` does not count; null when nobody else does. Without this replica:
	 * where a leaver sends the customer, and where an ungranted replica hops it. Without a joiner: who owned it before.
	 */
	ownerWithout(params: {
		customerId: string;
		member: string;
	}): Promise<string | null>;
	/**
	 * The peer the customer came from, when this replica owns it only because that peer is leaving, or because this
	 * replica joined and the peer is still handing it over; else null.
	 */
	movedFrom(params: { customerId: string }): Promise<string | null>;
};
