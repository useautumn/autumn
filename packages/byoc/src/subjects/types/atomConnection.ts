export type AtomQueueAddress = { externalId: string; atomId: string | null };

export type AtomConnection = {
	target: "org" | "shadow";
	endpointUrl: string;
	encryptedToken: string;
	queue: AtomQueueAddress | null;
};
