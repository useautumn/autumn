/** The org's secret keys a thread answers checks for, held only as SHA-256 hashes. */
export type SecretKeys = {
	isKnown(params: { keyHash: string }): boolean;
	/** Holds a key the API accepted as pending, and asks Autumn about it at once. */
	learn(params: { keyHash: string }): void;
	sync(): Promise<void>;
	stop(): void;
};

/** The hashes Autumn says are not the Atom's org and env's keys, or null when it gave no answer. */
export type FindInvalidKeys = (params: {
	keyHashes: string[];
}) => Promise<string[] | null>;
