/** The Atom's calls to Autumn, each proven by the token hash of the folder that makes it. Rejects with AutumnClientError. */
export type AutumnClient = {
	/** The hashes among `keyHashes` that are not the secret keys of the Atom's org and env. */
	findInvalidKeys(params: {
		tokenHash: string;
		keyHashes: string[];
	}): Promise<string[]>;
	/** The `subjects.set` body herald would push this Atom for the subject, as text. */
	readSubject(params: {
		tokenHash: string;
		customerId: string;
		entityId: string | null;
	}): Promise<string>;
};
