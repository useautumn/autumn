export type ReplicatedOperation = {
	kind: string;
	key: string;
	body: string;
	atomId: string | null;
	headers?: Record<string, string>;
};
