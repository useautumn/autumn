/** Drains the org's push queue into this process's data folder until stopped. */
export type PushReceiver = {
	run(): Promise<void>;
	/** Ends the receives in flight; the pushes already received are still applied and acked. */
	stop(): void;
};
