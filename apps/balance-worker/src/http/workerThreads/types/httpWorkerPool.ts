export type HttpWorkerPoolConfig = {
	hostname: string;
	port: number;
	maxRequestBodySize: number;
	/** `Bun.serve` threads beside the decide thread. */
	threads: number;
	/** Per thread, powers of two. */
	requestRingBytes: number;
	replyRingBytes: number;
};

export type HttpWorkerPool = {
	/** Resolves once every thread is bound to the port. */
	listen(): Promise<{ stop(): Promise<void> }>;
};
