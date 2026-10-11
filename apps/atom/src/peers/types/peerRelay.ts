/** One push as it is passed on to the other replicas: the same text Autumn sent, named the way its route names it. */
export type RelayedPush =
	| { kind: "subjects.set"; customerId: string; body: string }
	| { kind: "catalog.set"; body: string };

/** Hands Autumn's pushes on to every other replica of this deployment, so each holds the newest copy. */
export type PeerRelay = {
	relay(push: RelayedPush): void;
	/** Addresses of the other replicas, as the deployment's service name resolves them now. */
	peers(): Promise<string[]>;
	stop(): void;
};
