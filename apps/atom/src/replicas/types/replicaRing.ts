/** Which replica of the deployment owns each customer: every replica that sees the same members names the same one. */
export type ReplicaRing = {
	/** This replica's own address, as the other members reach it. */
	self: string;
	/** The owner's address, among the members as they resolve now. */
	ownerOf(params: { customerId: string }): Promise<string>;
	isOwner(params: { customerId: string }): Promise<boolean>;
	/** This replica's address and its peers', sorted. */
	members(): Promise<string[]>;
	/** The leaving peer this customer came from, when it is this replica's only because that peer is leaving; else null. */
	movedFrom(params: { customerId: string }): Promise<string | null>;
	/** The member that takes the customer once this replica leaves; null when it is alone. */
	ownerAfterLeaving(params: { customerId: string }): Promise<string | null>;
	/** The owner among the members plus `peer`, as the ring will be once the peer is counted. */
	ownerOnceJoined(params: {
		customerId: string;
		peer: string;
	}): Promise<string>;
};
