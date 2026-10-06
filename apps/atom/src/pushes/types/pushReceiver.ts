/** Drains the org's push queue into the data folder, each push applied by its customer's owner thread until stopped. */
export type PushReceiver = {
	run(): Promise<void>;
	/** The receive in flight finishes first: up to SQS's 20 s long poll. */
	stop(): void;
};
