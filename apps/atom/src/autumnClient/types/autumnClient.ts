export type AutumnClient = {
	findInvalidKeys(params: {
		tokenHash: string;
		keyHashes: string[];
	}): Promise<string[]>;
	readSubject(params: {
		tokenHash: string;
		customerId: string;
		entityId: string | null;
	}): Promise<string>;
};
