export type PulledPush = {
	payload: string;
	receiptHandle: string;
	attempt: number;
};

export type PushQueue = {
	pull(params: { signal: AbortSignal }): Promise<PulledPush[]>;
	ack(receiptHandle: string): Promise<void>;
};
