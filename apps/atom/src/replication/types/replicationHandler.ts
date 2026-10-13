/** What a kind of operation does on a replica that receives it. Applying must be idempotent: deliveries repeat and reorder. */
export type ReplicationHandler = {
	kind: string;
	/** The route a peer posts this kind to; the layer signs and marks the request. */
	path: string;
};
