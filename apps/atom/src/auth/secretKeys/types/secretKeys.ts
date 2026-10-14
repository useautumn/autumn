export type SecretKeys = {
	isKnown(params: { keyHash: string }): boolean;
	learn(params: { keyHash: string }): void;
	sync(): Promise<void>;
	stop(): void;
};

export type FindInvalidKeys = (params: {
	keyHashes: string[];
}) => Promise<string[] | null>;
