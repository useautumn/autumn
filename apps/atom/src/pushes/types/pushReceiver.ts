/** Drains the org's push queue into this process's data folder until stopped. */
export type PushReceiver = {
	run(): Promise<void>;
	/** The receive in flight finishes first: up to SQS's 20 s long poll. */
	stop(): void;
};
